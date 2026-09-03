import { prisma } from "../../lib/prisma.js";
import { telnyxAdapter } from "../../adapters/telnyx/TelnyxAdapter.js";
import { vapiAdapter } from "../../adapters/vapi/VapiAdapter.js";
import { retellAdapter } from "../../adapters/retell/RetellAdapter.js";
import { getPublicWebhookBaseUrl } from "../../lib/serverUrl.js";

export type PhoneNumberStatus =
  | "pending"
  | "purchased"
  | "active"
  | "failed";

const DEFAULT_COUNTRY =
  process.env.TWILIO_PHONE_NUMBER_COUNTRY || "ES";

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
export async function provisionPhoneNumber(
  businessId: string
): Promise<{
  success: boolean;
  phoneNumber?: string;
  status: PhoneNumberStatus;
  error?: string;
}> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      agents: {
        where: { active: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  if (!business) {
    return { success: false, status: "failed", error: "Business not found" };
  }

  const orchestrator = business.orchestrator || "retell";

  const isAlreadyActive =
    business.twilioPhoneNumberStatus === "active" &&
    (business.telnyxPhoneNumber || business.twilioPhoneNumber);
  if (isAlreadyActive) {
    return {
      success: true,
      phoneNumber:
        business.telnyxPhoneNumber || business.twilioPhoneNumber || undefined,
      status: "active",
    };
  }

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
      const connectionId = process.env.TELNYX_SIP_CONNECTION_ID;

      // 1. Search available numbers
      const available = await telnyxAdapter.searchAvailableNumbers(
        DEFAULT_COUNTRY,
        { limit: 5 }
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

    // 3. Find active agent to associate
    const agent = business.agents[0];

    if (orchestrator === "retell") {
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
        },
      });

      console.log(
        `[Phone] Number ${order.phoneNumber} active for business ${businessId} (Retell)`
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
    const message =
      error instanceof Error ? error.message : String(error);
    console.error(`[Phone] Provisioning failed for business ${businessId}:`, message);

    await prisma.business.update({
      where: { id: businessId },
      data: {
        twilioPhoneNumberStatus: "failed",
      },
    });

    return { success: false, status: "failed", error: message };
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
