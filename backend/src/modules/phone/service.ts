import { prisma } from "../../lib/prisma.js";
import { telnyxAdapter } from "../../adapters/telnyx/TelnyxAdapter.js";
import { vapiAdapter } from "../../adapters/vapi/VapiAdapter.js";
import { retellAdapter } from "../../adapters/retell/RetellAdapter.js";
import { getPublicWebhookBaseUrl } from "../../lib/serverUrl.js";
import { getRedis } from "../../lib/redis.js";
import { acquireLock, releaseLock } from "../../lib/bookingLock.js";

// El webhook de Stripe (checkout.session.completed) y el fallback de
// reconcile del frontend pueden disparar provisionPhoneNumber casi a la vez
// para el mismo negocio — sin este lock, ambos leen telnyxNumberOrderId como
// null antes de que ninguno lo haya escrito y acaban comprando dos números
// reales en Telnyx (solo uno queda enlazado en la BD, el otro queda huérfano
// facturando de más).
const PROVISION_LOCK_TTL_SECONDS = 60;

export type PhoneNumberStatus = "pending" | "purchased" | "active" | "failed";

const DEFAULT_COUNTRY = process.env.TWILIO_PHONE_NUMBER_COUNTRY || "ES";

const ORDER_POLL_ATTEMPTS = 5;
const ORDER_POLL_DELAY_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Provisions a Telnyx phone number for a business and configures it in the
 * active voice orchestrator (Retell). Idempotent: safe to call multiple
 * times; skips if status is already 'active'. Telnyx number orders are
 * asynchronous (regulatory review) — if a previous attempt already placed an
 * order, resumes polling that same order instead of purchasing a new one.
 */
export async function provisionPhoneNumber(businessId: string): Promise<{
  success: boolean;
  phoneNumber?: string;
  status: PhoneNumberStatus;
  error?: string;
}> {
  // Lectura rápida antes del lock: solo para el atajo "ya está activo" (no
  // arriesga nada, un falso negativo aquí como mucho hace pasar por el lock
  // de más). La lectura que de verdad importa —la que decide si hace falta
  // comprar un número o reanudar un pedido— tiene que ser DESPUÉS de
  // adquirir el lock, o dos llamadas casi simultáneas pueden leer ambas
  // telnyxNumberOrderId: null antes de que ninguna lo haya escrito: la
  // primera compra y guarda el pedido, pero la segunda —que ya tenía su
  // propia copia (obsoleta) de `business` en memoria desde antes de que la
  // primera terminara— la usa igualmente y compra un SEGUNDO número real en
  // Telnyx (hallazgo #12 de la auditoría).
  const initialBusiness = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      twilioPhoneNumberStatus: true,
      telnyxPhoneNumber: true,
      twilioPhoneNumber: true,
    },
  });

  if (!initialBusiness) {
    return { success: false, status: "failed", error: "Business not found" };
  }

  const isAlreadyActive =
    initialBusiness.twilioPhoneNumberStatus === "active" &&
    (initialBusiness.telnyxPhoneNumber || initialBusiness.twilioPhoneNumber);
  if (isAlreadyActive) {
    return {
      success: true,
      phoneNumber:
        initialBusiness.telnyxPhoneNumber ||
        initialBusiness.twilioPhoneNumber ||
        undefined,
      status: "active",
    };
  }

  const lockKey = `phone_provision_lock:${businessId}`;
  // acquireBudgetMs=0: un solo intento, sin reintentos — si otra ejecución
  // concurrente ya tiene el lock, esta simplemente devuelve el estado
  // actual y deja que la que lo tiene termine de resolverlo (comportamiento
  // original preservado). acquireLock/releaseLock (lib/bookingLock.ts) en
  // vez de un SET/DEL manuales: la liberación ahora es comparar-y-borrar
  // (solo borra si el token sigue siendo el nuestro), así que si el TTL
  // expirara mientras esta ejecución sigue trabajando y otra adquiriera el
  // lock mientras tanto, el `finally` de esta ejecución ya no puede borrar
  // el lock de esa otra por error — el bug real que tenía el `del`
  // incondicional anterior.
  const lockToken = await acquireLock(
    lockKey,
    PROVISION_LOCK_TTL_SECONDS * 1000,
    0
  );
  if (!lockToken) {
    // Ya hay un provisioning en curso para este negocio (la otra llamada
    // concurrente) — no comprar un segundo número, solo devolver el estado
    // actual (releído, no la copia de antes del lock). El que tiene el lock
    // es quien terminará de resolverlo.
    console.log(
      `[Phone] Provisioning ya en curso para business ${businessId}, se omite la llamada duplicada`
    );
    const currentBusiness = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        twilioPhoneNumberStatus: true,
        telnyxPhoneNumber: true,
        twilioPhoneNumber: true,
      },
    });
    return {
      success: currentBusiness?.twilioPhoneNumberStatus === "active",
      phoneNumber:
        currentBusiness?.telnyxPhoneNumber ||
        currentBusiness?.twilioPhoneNumber ||
        undefined,
      status:
        (currentBusiness?.twilioPhoneNumberStatus as PhoneNumberStatus) ||
        "pending",
    };
  }

  // Releído YA con el lock en la mano: esta es la copia que decide si hace
  // falta comprar, reanudar un pedido pendiente, o si ya se resolvió
  // mientras esperábamos el lock.
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      agents: {
        where: { active: true, deletedAt: null },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  if (!business) {
    await releaseLock(lockKey, lockToken);
    return { success: false, status: "failed", error: "Business not found" };
  }

  if (
    business.twilioPhoneNumberStatus === "active" &&
    (business.telnyxPhoneNumber || business.twilioPhoneNumber)
  ) {
    await releaseLock(lockKey, lockToken);
    return {
      success: true,
      phoneNumber:
        business.telnyxPhoneNumber || business.twilioPhoneNumber || undefined,
      status: "active",
    };
  }

  const orchestrator = business.orchestrator || "retell";

  try {
    // Por ahora solo compramos números españoles: es el único país con
    // Requirement Group regulatorio aprobado en Telnyx. Fallar claro aquí en
    // vez de intentar una compra que Telnyx rechazaría con un error más
    // confuso.
    if (DEFAULT_COUNTRY !== "ES") {
      throw new Error(
        `Solo se soportan números de España (ES) por ahora; TWILIO_PHONE_NUMBER_COUNTRY está en "${DEFAULT_COUNTRY}"`
      );
    }

    // Requirement Group regulatorio de plataforma (tipo "individual" hoy,
    // pasará a "business" cuando el usuario se dé de alta como
    // autónomo/empresa) — un único grupo reutilizado para todos los
    // negocios, aprobado para números locales de España.
    const requirementGroupId = process.env.TELNYX_SPAIN_REQUIREMENT_GROUP_ID;
    if (!requirementGroupId) {
      throw new Error(
        "Falta configurar TELNYX_SPAIN_REQUIREMENT_GROUP_ID (Requirement Group aprobado para España en Telnyx)"
      );
    }

    // Un Requirement Group de tipo "individual" (como el actual, de pruebas)
    // ata el número a la localidad de la prueba de domicilio aportada — un
    // número de otra ciudad queda "requirement-info-exception" aunque el
    // grupo esté aprobado. TELNYX_SPAIN_LOCALITY debe reflejar esa localidad
    // (opcional: sin ella no se filtra por ciudad, pensado para cuando el
    // Requirement Group pase a tipo "business").
    const locality = process.env.TELNYX_SPAIN_LOCALITY || undefined;

    let order;
    if (business.telnyxNumberOrderId) {
      // Ya hay un pedido en curso de un intento anterior (quedó "pending" en
      // revisión regulatoria) — reanudarlo en vez de comprar un número
      // nuevo, para no duplicar el cargo en Telnyx.
      console.log(
        `[Phone] Resuming existing Telnyx order ${business.telnyxNumberOrderId} for business ${businessId}`
      );
      order = await telnyxAdapter.getNumberOrder(business.telnyxNumberOrderId);
    } else {
      // El número se conecta inicialmente al Call Control App de Telnyx
      // cuando ese sea el primary, o al SIP trunk de Retell en cualquier
      // otro caso (plan Telnyx-orquestador §1 paso 5) — Retell se importa
      // más abajo siempre, como fallback caliente, independientemente de
      // cuál sea el connection_id activo aquí.
      const connectionId =
        orchestrator === "telnyx"
          ? process.env.TELNYX_CALL_CONTROL_APP_ID
          : process.env.TELNYX_SIP_CONNECTION_ID;

      // 1. Search available numbers
      const available = await telnyxAdapter.searchAvailableNumbers(
        DEFAULT_COUNTRY,
        { limit: 5, locality }
      );

      if (available.length === 0) {
        throw new Error(
          `No available phone numbers in country ${DEFAULT_COUNTRY}`
        );
      }

      const selected = available[0];

      console.log(
        `[Phone] Purchasing number ${selected.phoneNumber} for business ${businessId}`
      );

      // 2. Place the order
      order = await telnyxAdapter.purchaseNumber(selected.phoneNumber, {
        requirementGroupId,
        connectionId,
      });

      // Persistir el id del pedido cuanto antes: si queda "pending" en
      // revisión regulatoria, un reintento debe reanudarlo, no duplicarlo.
      await prisma.business.update({
        where: { id: businessId },
        data: { telnyxNumberOrderId: order.orderId },
      });
    }

    // El pedido de Telnyx es asíncrono — sondear con un margen acotado antes
    // de dejarlo en "pending" para que el botón de reintento lo reanude más
    // tarde en vez de bloquear la petición indefinidamente.
    let attempts = 0;
    while (order.status === "pending" && attempts < ORDER_POLL_ATTEMPTS) {
      await sleep(ORDER_POLL_DELAY_MS);
      order = await telnyxAdapter.getNumberOrder(order.orderId);
      attempts++;
    }

    if (order.status === "failure") {
      // Limpiar telnyxNumberOrderId aquí, no solo dejar que el catch de más
      // abajo marque twilioPhoneNumberStatus como "failed" — sin esto, un
      // pedido rechazado definitivamente por Telnyx (no una revisión
      // "pending", un fallo real) se queda enlazado para siempre: el
      // siguiente intento de "reintentar" reanuda ESE MISMO pedido muerto en
      // vez de comprar uno nuevo, y vuelve a fallar en bucle (hallazgo #32
      // de la auditoría).
      await prisma.business.update({
        where: { id: businessId },
        data: { telnyxNumberOrderId: null },
      });
      throw new Error(
        `El pedido de Telnyx para el número ${order.phoneNumber || ""} falló`
      );
    }

    if (order.status === "pending") {
      console.log(
        `[Phone] Telnyx order ${order.orderId} still pending regulatory review for business ${businessId}`
      );
      await prisma.business.update({
        where: { id: businessId },
        data: {
          telnyxPhoneNumber: order.phoneNumber || undefined,
          telnyxPhoneNumberId: order.phoneNumberId,
          twilioPhoneNumberStatus: "pending",
        },
      });

      // Este pedido "pending" puede llegar ya con phoneNumber asignado
      // (revisión regulatoria en curso, no ausencia de número) — misma
      // invalidación que en la rama "success" de abajo, por la misma razón.
      if (order.phoneNumber) {
        try {
          await getRedis().del(`voice_config:${businessId}`);
        } catch (err) {
          console.error(
            `[Phone] No se pudo invalidar la caché de configuración de voz para ${businessId}:`,
            err
          );
        }
      }

      return {
        success: false,
        status: "pending",
        error:
          "El pedido de número sigue en revisión regulatoria en Telnyx; se reanudará en el siguiente intento",
      };
    }

    // order.status === "success"
    await prisma.business.update({
      where: { id: businessId },
      data: {
        telnyxPhoneNumber: order.phoneNumber,
        telnyxPhoneNumberId: order.phoneNumberId,
        telnyxPhoneNumberPurchasedAt: new Date(),
        twilioPhoneNumberStatus: "purchased",
      },
    });

    // telnyxPhoneNumber forma parte de BusinessVoiceConfig (voiceTools/service.ts,
    // usado como remitente del SMS de aviso de reserva) — sin invalidar, un
    // negocio que ya hubiera hecho alguna llamada de voz antes de comprar su
    // número se quedaría con ese campo en null cacheado hasta que expire (1h),
    // y el SMS simplemente no se enviaría en ese tiempo aunque la BD ya esté
    // actualizada.
    try {
      await getRedis().del(`voice_config:${businessId}`);
    } catch (err) {
      console.error(
        `[Phone] No se pudo invalidar la caché de configuración de voz para ${businessId}:`,
        err
      );
    }

    // 3. Find active agent to associate
    const agent = business.agents[0];

    // Retell se importa aquí para "retell" (primary) y también para
    // "telnyx" (fallback caliente obligatorio, plan §1 paso 2) — el
    // connection_id que de verdad recibe las llamadas ya se fijó al comprar
    // el número más arriba según el orchestrator; este import nunca lo
    // cambia, solo dota a Retell del número por si hace falta un failover.
    if (orchestrator === "retell" || orchestrator === "telnyx") {
      if (!agent?.retellAgentId) {
        console.warn(
          `[Phone] Business ${businessId} has no active agent with retellAgentId. Number purchased but not linked in Retell.`
        );
        return {
          success: true,
          phoneNumber: order.phoneNumber,
          status: "purchased",
        };
      }

      // SIP trunk de plataforma (la conexión de Telnyx apuntando a Retell) —
      // único, reutilizado para todos los negocios.
      const terminationUri = process.env.RETELL_SIP_TERMINATION_URI;
      const sipTrunkAuthUsername = process.env.RETELL_SIP_TRUNK_AUTH_USERNAME;
      const sipTrunkAuthPassword = process.env.RETELL_SIP_TRUNK_AUTH_PASSWORD;

      if (!terminationUri) {
        throw new Error(
          "Falta configurar RETELL_SIP_TERMINATION_URI (SIP trunk de Telnyx para importar el número en Retell)"
        );
      }

      const webhookBaseUrl = getPublicWebhookBaseUrl();
      const inboundWebhookUrl = webhookBaseUrl
        ? `${webhookBaseUrl.replace(/\/$/, "")}/webhooks/retell/inbound`
        : undefined;
      if (!inboundWebhookUrl) {
        console.warn(
          `[Phone] No hay BASE_URL/webhookUrl configurada — el número de ${businessId} se importará sin inbound_webhook_url, así que el prompt se quedará con las variables {{...}} sin rellenar.`
        );
      }

      const retellPhone = await retellAdapter.importPhoneNumber({
        phoneNumber: order.phoneNumber,
        terminationUri,
        sipTrunkAuthUsername,
        sipTrunkAuthPassword,
        nickname: business.name,
        inboundAgentId: agent.retellAgentId,
        inboundWebhookUrl,
      });

      await prisma.business.update({
        where: { id: businessId },
        data: {
          twilioPhoneNumberStatus: "active",
          retellPhoneNumber: retellPhone.phone_number,
          retellPhoneNumberId:
            retellPhone.phone_number_id || retellPhone.phone_number,
        },
      });

      console.log(
        `[Phone] Number ${order.phoneNumber} active for business ${businessId} (${
          orchestrator === "telnyx" ? "Telnyx primary, Retell fallback" : "Retell"
        })`
      );

      return {
        success: true,
        phoneNumber: order.phoneNumber,
        status: "active",
      };
    }

    // Default: Vapi orchestrator. VAPI está inactivo — ningún negocio nuevo
    // cae aquí (detectVoiceOrchestrator siempre devuelve "retell"). Se
    // mantiene por compatibilidad histórica, pero asume un número comprado
    // en Twilio (twilioAccountSid/twilioAuthToken); no aplica a números
    // comprados en Telnyx.
    if (!agent?.vapiAssistantId) {
      console.warn(
        `[Phone] Business ${businessId} has no active agent with vapiAssistantId. Number purchased but not linked in Vapi.`
      );
      return {
        success: true,
        phoneNumber: order.phoneNumber,
        status: "purchased",
      };
    }

    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

    if (!twilioAccountSid || !twilioAuthToken) {
      throw new Error(
        "Twilio credentials (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN) are required to link the number in Vapi"
      );
    }

    const vapiPhone = await vapiAdapter.createPhoneNumber({
      provider: "twilio",
      number: order.phoneNumber,
      twilioAccountSid,
      twilioAuthToken,
      assistantId: agent.vapiAssistantId,
      name: business.name,
    });

    await prisma.business.update({
      where: { id: businessId },
      data: {
        twilioPhoneNumberStatus: "active",
        vapiPhoneNumberId: vapiPhone.id,
      },
    });

    console.log(
      `[Phone] Number ${order.phoneNumber} active for business ${businessId} (Vapi ID: ${vapiPhone.id})`
    );

    return {
      success: true,
      phoneNumber: order.phoneNumber,
      status: "active",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[Phone] Provisioning failed for business ${businessId}:`,
      message
    );

    await prisma.business.update({
      where: { id: businessId },
      data: {
        twilioPhoneNumberStatus: "failed",
      },
    });

    return { success: false, status: "failed", error: message };
  } finally {
    await releaseLock(lockKey, lockToken);
  }
}

/**
 * Get the phone number status for a business.
 */
export async function getPhoneNumberStatus(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      twilioPhoneNumber: true,
      twilioPhoneNumberSid: true,
      twilioPhoneNumberPurchasedAt: true,
      twilioPhoneNumberStatus: true,
      telnyxPhoneNumber: true,
      telnyxPhoneNumberId: true,
      telnyxPhoneNumberPurchasedAt: true,
      vapiPhoneNumberId: true,
      retellPhoneNumberId: true,
      orchestrator: true,
    },
  });

  if (!business) {
    return null;
  }

  return {
    phoneNumber: business.telnyxPhoneNumber || business.twilioPhoneNumber,
    sid: business.telnyxPhoneNumberId || business.twilioPhoneNumberSid,
    purchasedAt:
      business.telnyxPhoneNumberPurchasedAt ||
      business.twilioPhoneNumberPurchasedAt,
    status: business.twilioPhoneNumberStatus,
    orchestrator: business.orchestrator || "retell",
    vapiPhoneNumberId: business.vapiPhoneNumberId,
    retellPhoneNumberId: business.retellPhoneNumberId,
  };
}
