import type { Business, InboundMessage } from "@prisma/client";
import type { WhatsappAudience } from "../../adapters/whatsapp/WhatsAppAdapter.js";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import { reclamarEnvio } from "../../lib/messageIdempotency.js";
import { interpretarComando, type PalabraClave } from "./webhooks.js";
import { enviarTexto, resolverRemitente } from "./service.js";
import { registrarBaja, revocarBaja } from "./bajas.js";
import {
  activarAvisosDelDueno,
  activo,
  consintio,
  construirEnlaceAlta,
  darDeBajaDueno,
  nombreParaWhatsapp,
  reactivarDueno,
} from "./altaDueno.js";
import * as mensajes from "./mensajes.js";

/**
 * Enrutador de mensajes entrantes (PLAN-CANAL-DUENO.md § 6), fase 1 / PR 2:
 * alta del dueño (`ALTA <código>`, botón «Activar avisos»), STOP/BAJA en
 * los dos números, `ALTA` a secas (reactivación), AYUDA y respuestas fijas
 * a todo lo demás. Los botones de los avisos (PR 3) y el chat (fase 2)
 * siguen en `pendiente:*`.
 *
 * Reglas:
 * - Primero la base de datos, después la respuesta. Nunca lanza por un
 *   fallo al responder: el motivo vuelve en `error` y queda en el log.
 * - Como mucho UNA respuesta por entrante, siempre como texto desde el
 *   mismo número al que escribió la persona (ventana abierta, 0,004 $), y
 *   reclamada con `reclamarEnvio` (`entrante:<id>:<tipo>`): un reintento
 *   no responde dos veces.
 * - Techo de 20 respuestas por número y hora, y para las ramas
 *   informativas una vez al día por tipo. Los contadores leen columnas que
 *   se escriben después del envío: bajo una ráfaga concurrente son
 *   aproximados (pueden dejar pasar unas pocas respuestas de más). Asumido.
 * - Toda escritura de estado lleva el número del remitente en el `where`.
 */

export interface ResultadoEnrutado {
  /** Nombre del handler que atendió el mensaje (con sufijo `:silenciado` o `:baja`). */
  handler: string;
  /** Motivo si la respuesta no pudo salir; el estado ya está guardado. */
  error?: string;
}

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;
const RESPALDO_BOTON_MS = 72 * HORA_MS;
const TECHO_RESPUESTAS_POR_HORA = 20;
const MAX_FALLOS_CODIGO_POR_HORA = 5;

type SubtipoIgnorado = "reaction" | "system" | "unsupported";
const SUBTIPOS_IGNORADOS: readonly string[] = [
  "reaction",
  "system",
  "unsupported",
];

interface OpcionesRespuesta {
  /** Solo la confirmación del propio STOP: salta la guardia de baja. */
  permitirBaja?: boolean;
  /** Solo la confirmación del STOP: ignora el techo por hora una vez al día. */
  saltarTecho?: boolean;
  /** Ramas informativas: una respuesta de este tipo por número y día. */
  unaVezAlDia?: boolean;
  /** Negocio al que atribuir la respuesta (si no, el del entrante). */
  businessId?: string | null;
}

interface Respuesta {
  /** "" | ":silenciado" | ":baja" */
  sufijo: string;
  error?: string;
}

function esErrorDeBaja(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "WHATSAPP_OPT_OUT"
  );
}

/**
 * ¿Ya se envió una respuesta de este tipo a este número en 24 h? Una fila
 * reclamada cuyo envío falló (`failed`) no cuenta: si Telnyx cae en la
 * primera respuesta del día, la siguiente lo vuelve a intentar. Una fila
 * `suppressed` (el número pidió STOP) sí cuenta.
 */
async function yaAvisadoHoy(
  inbound: InboundMessage,
  tipo: string
): Promise<boolean> {
  const count = await prisma.sentMessage.count({
    where: {
      toNumber: inbound.fromNumber,
      audience: inbound.audience ?? undefined,
      callbackData: `aviso:${tipo}`,
      sentAt: { gt: new Date(Date.now() - DIA_MS) },
      NOT: { deliveryStatus: "failed" },
    },
  });
  return count > 0;
}

/**
 * Responde al entrante con un texto desde el número al que escribió.
 * Devuelve el sufijo del handler y, si el envío falló, el motivo.
 */
async function responder(
  inbound: InboundMessage,
  tipo: string,
  body: string,
  opciones: OpcionesRespuesta = {}
): Promise<Respuesta> {
  const audience = inbound.audience as WhatsappAudience;
  const from = inbound.fromNumber;
  const businessId = opciones.businessId ?? inbound.businessId ?? undefined;
  const callbackData = `aviso:${tipo}`;

  try {
    if (opciones.unaVezAlDia && (await yaAvisadoHoy(inbound, tipo))) {
      return { sufijo: ":silenciado" };
    }
    const enUltimaHora = await prisma.sentMessage.count({
      where: {
        toNumber: from,
        audience,
        sentAt: { gt: new Date(Date.now() - HORA_MS) },
      },
    });
    if (enUltimaHora >= TECHO_RESPUESTAS_POR_HORA) {
      const excepcion =
        opciones.saltarTecho === true && !(await yaAvisadoHoy(inbound, tipo));
      if (!excepcion) {
        console.warn(
          `[WhatsApp] Respuesta ${tipo} a ${from} silenciada: ${enUltimaHora} respuestas en la última hora desde el número de ${audience}`
        );
        return { sufijo: ":silenciado" };
      }
    }
  } catch (error) {
    // Sin contadores se responde igual: la idempotencia por entrante sigue.
    console.error(
      `[WhatsApp] No se pudieron leer los contadores de respuestas de ${from} (${tipo}); se responde: ${errorMessage(error)}`
    );
  }

  const idempotencyKey = `entrante:${inbound.id}:${tipo}`;
  const reclamado = await reclamarEnvio("whatsapp", idempotencyKey, {
    businessId: businessId ?? null,
    audience,
    toNumber: from,
    callbackData,
    kind: "text",
  });
  if (!reclamado) {
    return { sufijo: "" };
  }

  try {
    const result = await enviarTexto({
      audience,
      to: from,
      businessId,
      body,
      idempotencyKey,
      callbackData,
      permitirBaja: opciones.permitirBaja,
    });
    console.log(
      `[WhatsApp] Respuesta ${tipo} a ${from} (negocio ${businessId ?? "—"}): ${result.messageId}`
    );
    return { sufijo: "" };
  } catch (error) {
    if (esErrorDeBaja(error)) {
      // Caso correcto, no un fallo: el número pidió STOP.
      console.log(
        `[WhatsApp] Respuesta ${tipo} a ${from} omitida: el número pidió STOP`
      );
      await prisma.sentMessage
        .updateMany({
          where: { channel: "whatsapp", idempotencyKey },
          data: { deliveryStatus: "suppressed", errorCode: "OPT_OUT" },
        })
        .catch(() => undefined);
      return { sufijo: ":baja" };
    }
    const motivo = errorMessage(error);
    console.error(
      `[WhatsApp] No se pudo responder (${tipo}) a ${from} desde el número de ${audience} (negocio ${businessId ?? "—"}): ${motivo}`
    );
    // Que la fila reclamada no cuente como respuesta enviada (una vez al
    // día): el siguiente entrante lo vuelve a intentar.
    await prisma.sentMessage
      .updateMany({
        where: { channel: "whatsapp", idempotencyKey },
        data: {
          deliveryStatus: "failed",
          errorCode: "SEND_ERROR",
          errorDetail: motivo,
        },
      })
      .catch((marcaError: unknown) => {
        console.error(
          `[WhatsApp] No se pudo marcar como fallida la respuesta ${idempotencyKey} a ${from}; contará como enviada hoy: ${errorMessage(marcaError)}`
        );
      });
    return { sufijo: "", error: motivo };
  }
}

function resultado(base: string, respuesta: Respuesta): ResultadoEnrutado {
  return respuesta.error
    ? { handler: `${base}${respuesta.sufijo}`, error: respuesta.error }
    : { handler: `${base}${respuesta.sufijo}` };
}

function nombres(negocios: Array<{ name: string }>): string[] {
  return negocios.map((b) => nombreParaWhatsapp(b));
}

/** Negocios activos cuyo móvil del dueño es el remitente. */
async function negociosDelMovil(from: string): Promise<Business[]> {
  return prisma.business.findMany({
    where: { ownerWhatsappNumber: from, active: true },
    orderBy: { name: "asc" },
  });
}

function subtipoDelPayload(message: InboundMessage): string | null {
  const payload = message.payload as { type?: unknown } | null;
  return payload && typeof payload.type === "string" ? payload.type : null;
}

async function numeroDeNegocios(): Promise<string> {
  return (await resolverRemitente("owner")).phoneNumber;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export async function enrutarEntrante(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  if (message.audience !== "owner" && message.audience !== "client") {
    console.warn(
      `[WhatsApp] Entrante ${message.providerMessageId} de ${message.fromNumber} a ${message.toNumber || "?"} sin audiencia; se ignora`
    );
    return { handler: "ignorado:sin-audiencia" };
  }
  const audience: WhatsappAudience = message.audience;

  if (message.kind === "other") {
    const subtipo = subtipoDelPayload(message);
    if (subtipo && SUBTIPOS_IGNORADOS.includes(subtipo)) {
      // Meta no cuenta una reacción ni un mensaje de sistema como mensaje
      // del usuario: ni respuesta ni ventana.
      return { handler: `ignorado:${subtipo as SubtipoIgnorado}` };
    }
    if (subtipo === "request_welcome") {
      const respuesta =
        audience === "owner"
          ? await responder(
              message,
              "desconocido-negocios",
              mensajes.desconocidoEnNegocios(),
              { unaVezAlDia: true }
            )
          : await responder(
              message,
              "desconocido-clientes",
              mensajes.desconocidoEnClientes(),
              { unaVezAlDia: true }
            );
      return resultado(`bienvenida-chat:${audience}`, respuesta);
    }
  }

  if (audience === "owner" && message.role === "owner") {
    await abrirVentanaDelDueno(message);
  }

  return audience === "owner"
    ? enrutarEnNegocios(message)
    : enrutarEnClientes(message);
}

/**
 * Un entrante real del dueño abre la ventana de 24 h y prueba que llega.
 * La ventana solo avanza: el barrido puede enrutar una fila antigua después
 * de un mensaje más reciente, y `receivedAt + 24 h` de la vieja no debe
 * retroceder la ventana vigente.
 */
async function abrirVentanaDelDueno(message: InboundMessage): Promise<void> {
  const from = message.fromNumber;
  const nuevaVentana = new Date(message.receivedAt.getTime() + DIA_MS);
  try {
    const limpiados = await prisma.business.updateMany({
      where: {
        ownerWhatsappNumber: from,
        active: true,
        ownerWhatsappUnreachableAt: { not: null },
      },
      data: { ownerWhatsappUnreachableAt: null },
    });
    await prisma.business.updateMany({
      where: {
        ownerWhatsappNumber: from,
        active: true,
        OR: [
          { ownerWindowOpenUntil: null },
          { ownerWindowOpenUntil: { lt: nuevaVentana } },
        ],
      },
      data: { ownerWindowOpenUntil: nuevaVentana },
    });
    if (limpiados.count > 0) {
      console.log(
        `[WhatsApp] ${from} vuelve a ser alcanzable (había un 131026)`
      );
    }
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo abrir la ventana de 24 h de ${from} (entrante ${message.providerMessageId}): ${errorMessage(error)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Número de NEGOCIOS
// ---------------------------------------------------------------------------

async function enrutarEnNegocios(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  const comando =
    message.kind === "keyword" && message.text
      ? interpretarComando(message.text)
      : null;

  if (comando) {
    switch (comando.keyword) {
      case "STOP":
      case "BAJA":
        return stopEnNegocios(message, comando.keyword);
      case "ALTA":
        return comando.code
          ? altaConCodigo(message, comando.code)
          : altaASecas(message);
      case "AYUDA":
        return ayudaEnNegocios(message);
      default:
        return palabraClavePendiente(message, comando.keyword);
    }
  }

  if (message.kind === "button") {
    return botonEnNegocios(message);
  }

  if (message.kind === "text") {
    if (message.role === "owner") {
      return resultado("texto:dueno", await todaviaNoChateo(message));
    }
    return textoDesconocidoEnNegocios(message);
  }

  // audio / media / other sin subtipo ignorado
  if (message.role === "owner") {
    return resultado(
      `pendiente:${message.kind}`,
      await todaviaNoChateo(message)
    );
  }
  return { handler: `ignorado:${message.kind}` };
}

async function todaviaNoChateo(message: InboundMessage): Promise<Respuesta> {
  return responder(
    message,
    "dueno-texto",
    mensajes.todaviaNoChateo({ panelUrl: mensajes.panelUrl() }),
    { unaVezAlDia: true }
  );
}

async function textoDesconocidoEnNegocios(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  return resultado(
    "texto:desconocido",
    await responder(
      message,
      "desconocido-negocios",
      mensajes.desconocidoEnNegocios(),
      { unaVezAlDia: true }
    )
  );
}

async function palabraClavePendiente(
  message: InboundMessage,
  keyword: PalabraClave
): Promise<ResultadoEnrutado> {
  if (message.role === "owner") {
    // Comandos del Gestor (fase 2): por ahora, la respuesta fija del dueño.
    return resultado(
      `pendiente:palabra-clave:${keyword}`,
      await todaviaNoChateo(message)
    );
  }
  return textoDesconocidoEnNegocios(message);
}

async function stopEnNegocios(
  message: InboundMessage,
  keyword: "STOP" | "BAJA"
): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;
  const negocios = await negociosDelMovil(from);

  if (negocios.length > 0) {
    await darDeBajaDueno({
      from,
      keyword,
      inboundMessageId: message.id,
      businessId: message.businessId ?? negocios[0].id,
    });
    // No se nombra un negocio al que nunca dijo que sí.
    const consentidos = negocios.filter(consintio);
    const respuesta =
      consentidos.length > 0
        ? await responder(
            message,
            "stop-dueno",
            mensajes.bajaDueno({ negocios: nombres(consentidos) }),
            { permitirBaja: true, saltarTecho: true }
          )
        : await responder(
            message,
            "stop-desconocido",
            mensajes.bajaDesconocido(),
            { permitirBaja: true, saltarTecho: true, unaVezAlDia: true }
          );
    return resultado("stop:dueno", respuesta);
  }

  await registrarBaja({
    phoneNumber: from,
    audience: "owner",
    keyword,
    inboundMessageId: message.id,
    businessId: message.businessId,
  });
  console.log(
    `[WhatsApp] Baja de ${from} en el número de negocios sin negocio asociado (entrante ${message.id})`
  );
  return resultado(
    "stop:desconocido",
    await responder(message, "stop-desconocido", mensajes.bajaDesconocido(), {
      permitirBaja: true,
      saltarTecho: true,
      unaVezAlDia: true,
    })
  );
}

/**
 * Intentos de código que no vincularon nada en la última hora. Cuenta
 * también los `alta:ya-activo:codigo`: un móvil que ya es dueño activo
 * recibe «ya activo» en vez de «no reconocido» (doble toque del enlace),
 * pero no por eso puede probar códigos de otros negocios sin límite.
 */
async function fallosDeCodigoEnUnaHora(from: string): Promise<number> {
  return prisma.inboundMessage.count({
    where: {
      fromNumber: from,
      OR: [
        { handler: { startsWith: "alta:codigo-invalido" } },
        { handler: { startsWith: "alta:codigo-caducado" } },
        { handler: { startsWith: "alta:ya-activo:codigo" } },
      ],
      receivedAt: { gt: new Date(Date.now() - HORA_MS) },
    },
  });
}

async function altaConCodigo(
  message: InboundMessage,
  code: string
): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;

  const fallos = await fallosDeCodigoEnUnaHora(from);
  if (fallos >= MAX_FALLOS_CODIGO_POR_HORA) {
    console.warn(
      `[WhatsApp] ${from} lleva ${fallos} códigos de alta fallidos en una hora; se bloquea sin consultar el código`
    );
    return resultado(
      "alta:bloqueado",
      await responder(message, "bloqueado", mensajes.demasiadosIntentos(), {
        unaVezAlDia: true,
      })
    );
  }

  const now = Date.now();
  const business = await prisma.business.findUnique({
    where: { ownerAltaCode: code },
  });
  const caducado =
    business !== null &&
    business.active &&
    (business.ownerAltaCodeExpiresAt === null ||
      business.ownerAltaCodeExpiresAt.getTime() <= now);
  const valido = business !== null && business.active && !caducado;

  if (valido) {
    const { count, numeroAnterior } = await activarAvisosDelDueno({
      businessId: business.id,
      from,
      via: "alta_codigo",
      inboundMessageId: message.id,
      codigo: code,
    });
    if (count === 1) {
      return resultado(
        "alta:vinculado",
        await responder(
          message,
          "bienvenida",
          mensajes.bienvenidaTrasAlta({
            negocios: [nombreParaWhatsapp(business)],
            movilApuntado: numeroAnterior !== null && from !== numeroAnterior,
          }),
          { businessId: business.id }
        )
      );
    }
    // Otro proceso lo consumió a la vez: se trata como código gastado.
  }

  // Un código gastado desde el móvil que ya es dueño activo (doble toque
  // del enlace, borrador reenviado, QR escaneado dos veces) recibe «ya
  // activo», pero el intento cuenta para el bloqueo de 5 por hora.
  const activos = (await negociosDelMovil(from)).filter(activo);
  if (activos.length > 0) {
    return resultado(
      "alta:ya-activo:codigo",
      await responder(
        message,
        "ya-activo",
        mensajes.yaActivo({ negocios: nombres(activos) }),
        { businessId: activos[0].id }
      )
    );
  }

  if (caducado) {
    return resultado(
      "alta:codigo-caducado",
      await responder(message, "codigo-caducado", mensajes.codigoCaducado())
    );
  }
  return resultado(
    "alta:codigo-invalido",
    await responder(message, "codigo-invalido", mensajes.codigoNoReconocido())
  );
}

async function altaASecas(message: InboundMessage): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;
  const negocios = await negociosDelMovil(from);

  // Reactivación: solo negocios que YA consintieron desde este móvil.
  const reactivables = negocios.filter(
    (b) => consintio(b) && b.ownerWhatsappOptOutAt !== null
  );
  if (reactivables.length > 0) {
    await reactivarDueno({ from, inboundMessageId: message.id });
    return resultado(
      "alta:reactivado",
      await responder(
        message,
        "reactivado",
        mensajes.avisosReactivados({ negocios: nombres(reactivables) }),
        { businessId: reactivables[0].id }
      )
    );
  }

  const activos = negocios.filter(activo);
  if (activos.length > 0) {
    await revocarBaja({
      phoneNumber: from,
      audience: "owner",
      inboundMessageId: message.id,
    });
    return resultado(
      "alta:ya-activo",
      await responder(
        message,
        "ya-activo",
        mensajes.yaActivo({ negocios: nombres(activos) }),
        { businessId: activos[0].id }
      )
    );
  }

  // Solo negocios `pendiente` (alguien tecleó este móvil en un panel, que
  // puede no ser el suyo) o ninguno: NO es consentimiento. La prueba es el
  // código (tener el panel) o el botón de la plantilla de ese negocio.
  return resultado(
    "alta:sin-codigo",
    await responder(message, "sin-codigo", mensajes.comoDarseDeAlta(), {
      unaVezAlDia: true,
    })
  );
}

async function ayudaEnNegocios(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  if (message.role === "owner") {
    const negocios = await negociosDelMovil(message.fromNumber);
    // Solo los que consintieron desde este móvil: un negocio que tecleó
    // este número en su panel (quizá otro tenant) no se nombra.
    const consentidos = negocios.filter(consintio);
    if (consentidos.length === 0) {
      return resultado(
        "ayuda:sin-consentimiento",
        await responder(message, "sin-codigo", mensajes.comoDarseDeAlta(), {
          unaVezAlDia: true,
        })
      );
    }
    return resultado(
      "ayuda:dueno",
      await responder(
        message,
        "ayuda-dueno",
        mensajes.ayudaDueno({
          negocios: nombres(consentidos),
          panelUrl: mensajes.panelUrl(),
        })
      )
    );
  }
  return resultado(
    "ayuda:desconocido",
    await responder(
      message,
      "desconocido-negocios",
      mensajes.desconocidoEnNegocios(),
      { unaVezAlDia: true }
    )
  );
}

function normalizarTitulo(value: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function esEnvioDeActivacion(enviado: {
  callbackData: string | null;
  templateName: string | null;
}): boolean {
  return (
    (enviado.callbackData?.startsWith("alta:") ?? false) ||
    enviado.templateName === "bienvenida_negocio"
  );
}

function negocioDelEnvio(enviado: {
  businessId: string | null;
  callbackData: string | null;
}): string | null {
  if (enviado.businessId) return enviado.businessId;
  return enviado.callbackData?.startsWith("alta:")
    ? enviado.callbackData.slice(5)
    : null;
}

async function botonEnNegocios(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;
  const pareceActivacion =
    normalizarTitulo(message.buttonTitle ?? message.buttonId) ===
    "ACTIVAR AVISOS";

  if (message.contextMessageId) {
    const enviado = await prisma.sentMessage.findUnique({
      where: { providerMessageId: message.contextMessageId },
    });
    if (!enviado && pareceActivacion) {
      // No se adivina a qué envío respondía: quedaría un consentimiento
      // atribuido a un negocio que la persona no eligió.
      console.warn(
        `[WhatsApp] Botón Activar avisos desde ${from} responde al mensaje ${message.contextMessageId}, que no tiene fila en sent_messages; se deja pendiente`
      );
      return { handler: "pendiente:boton:sin-fila" };
    }
    if (enviado && esEnvioDeActivacion(enviado)) {
      if (enviado.audience !== "owner" || enviado.toNumber !== from) {
        console.warn(
          `[WhatsApp] Botón de activación desde ${from} para un envío a ${enviado.toNumber ?? "?"} (${enviado.audience ?? "?"}, negocio ${enviado.businessId ?? "—"}); se ignora`
        );
        return { handler: "boton:activacion:remitente-distinto" };
      }
      const businessId = negocioDelEnvio(enviado);
      const business = businessId
        ? await prisma.business.findUnique({ where: { id: businessId } })
        : null;
      if (
        !business ||
        !business.active ||
        business.ownerWhatsappNumber !== from
      ) {
        return resultado(
          "boton:activacion:numero-antiguo",
          await responder(
            message,
            "otro-movil",
            mensajes.mensajeParaOtroMovil(),
            { businessId }
          )
        );
      }
      return activarPorBoton(message, business, "ok");
    }
  }

  // Respaldo ACOTADO para el botón sin `context.id`: UNA sola activación
  // reciente a ESE móvil (que salió de verdad), y solo ese negocio. Con dos
  // negocios distintos en 72 h no se sabe cuál pulsó: no se activa nada.
  if (pareceActivacion && !message.contextMessageId) {
    const enviados = await prisma.sentMessage.findMany({
      where: {
        audience: "owner",
        toNumber: from,
        callbackData: { startsWith: "alta:" },
        sentAt: { gt: new Date(Date.now() - RESPALDO_BOTON_MS) },
        NOT: { deliveryStatus: { in: ["failed", "suppressed"] } },
      },
      orderBy: { sentAt: "desc" },
      take: 2,
    });
    const negociosCandidatos = new Set(
      enviados.map((e) => negocioDelEnvio(e)).filter((id) => id !== null)
    );
    if (negociosCandidatos.size > 1) {
      console.warn(
        `[WhatsApp] Botón Activar avisos sin context.id desde ${from} con activaciones de varios negocios en 72 h (${[...negociosCandidatos].join(", ")}); no se activa ninguno`
      );
      return { handler: "pendiente:boton:ambiguo" };
    }
    const enviado = enviados[0] ?? null;
    const businessId = enviado ? negocioDelEnvio(enviado) : null;
    const business = businessId
      ? await prisma.business.findUnique({ where: { id: businessId } })
      : null;
    if (
      enviado &&
      business &&
      business.active &&
      business.ownerWhatsappNumber === from
    ) {
      console.log(
        `[WhatsApp] Botón Activar avisos sin context.id; se acepta por la activación ${enviado.providerMessageId ?? enviado.idempotencyKey} del negocio ${business.id}`
      );
      return activarPorBoton(message, business, "por-envio");
    }
    return { handler: "pendiente:boton:sin-contexto" };
  }

  // Botones de los avisos (PR 3) y del lado cliente (PR 4).
  const prefix = message.buttonId?.split(":")[0] ?? "?";
  return { handler: `pendiente:boton:${prefix}` };
}

async function activarPorBoton(
  message: InboundMessage,
  business: Business,
  variante: "ok" | "por-envio"
): Promise<ResultadoEnrutado> {
  const nombre = nombreParaWhatsapp(business);
  if (activo(business)) {
    // Botón pulsado dos veces: no se reescribe el consentimiento.
    return resultado(
      "boton:activacion:ya-activo",
      await responder(
        message,
        "ya-activo",
        mensajes.yaActivo({ negocios: [nombre] }),
        { businessId: business.id }
      )
    );
  }
  const { count } = await activarAvisosDelDueno({
    businessId: business.id,
    from: message.fromNumber,
    via: "boton_plantilla",
    inboundMessageId: message.id,
  });
  if (count === 0) {
    return resultado(
      "boton:activacion:numero-antiguo",
      await responder(message, "otro-movil", mensajes.mensajeParaOtroMovil(), {
        businessId: business.id,
      })
    );
  }
  return resultado(
    `boton:activacion:${variante}`,
    await responder(
      message,
      "bienvenida",
      mensajes.bienvenidaTrasAlta({ negocios: [nombre], movilApuntado: false }),
      { businessId: business.id }
    )
  );
}

// ---------------------------------------------------------------------------
// Número de CLIENTES
// ---------------------------------------------------------------------------

async function enrutarEnClientes(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;
  const comando =
    message.kind === "keyword" && message.text
      ? interpretarComando(message.text)
      : null;

  if (comando) {
    switch (comando.keyword) {
      case "STOP":
      case "BAJA": {
        // Baja GLOBAL por número: un dueño aquí se da de baja como cliente.
        await registrarBaja({
          phoneNumber: from,
          audience: "client",
          keyword: comando.keyword,
          inboundMessageId: message.id,
          businessId: message.businessId,
        });
        console.log(
          `[WhatsApp] Baja global del cliente ${from} (entrante ${message.id})`
        );
        return resultado(
          "stop:cliente",
          await responder(message, "stop-cliente", mensajes.bajaCliente(), {
            permitirBaja: true,
            saltarTecho: true,
            unaVezAlDia: true,
          })
        );
      }
      case "ALTA": {
        if (comando.code) {
          // No se valida, consume ni vincula nada: se le devuelve su propio
          // código en un enlace al número de negocios.
          const enlace = construirEnlaceAlta(
            await numeroDeNegocios(),
            comando.code
          );
          return resultado(
            "alta:numero-equivocado",
            await responder(
              message,
              "numero-equivocado",
              mensajes.numeroEquivocado({ enlace })
            )
          );
        }
        const revocadas = await revocarBaja({
          phoneNumber: from,
          audience: "client",
          inboundMessageId: message.id,
        });
        if (revocadas === 1) {
          return resultado(
            "alta:cliente-reactivado",
            await responder(
              message,
              "cliente-reactivado",
              mensajes.clienteReactivado()
            )
          );
        }
        break; // sin baja: como texto libre
      }
      default:
        break; // AYUDA y el resto: como texto libre
    }
  }

  if (message.kind === "button") {
    const prefix = message.buttonId?.split(":")[0] ?? "?";
    return { handler: `pendiente:boton:${prefix}` };
  }

  if (message.kind === "text" || message.kind === "keyword") {
    return textoEnClientes(message);
  }

  return { handler: `ignorado:${message.kind}` };
}

async function esDuenoConocido(from: string): Promise<boolean> {
  const count = await prisma.business.count({
    where: {
      ownerWhatsappNumber: from,
      active: true,
      ownerWhatsappOptInAt: { not: null },
    },
  });
  return count > 0;
}

async function textoEnClientes(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;

  if (message.role !== "client" && (await esDuenoConocido(from))) {
    const digitos = (await numeroDeNegocios()).replace(/^\+/, "");
    return resultado(
      "texto:dueno-en-clientes",
      await responder(
        message,
        "dueno-en-clientes",
        mensajes.duenoEnClientes({ enlace: `https://wa.me/${digitos}` }),
        { unaVezAlDia: true }
      )
    );
  }

  if (message.role === "client") {
    const business = message.businessId
      ? await prisma.business.findUnique({
          where: { id: message.businessId },
          select: { name: true, phone: true },
        })
      : null;
    return resultado(
      "pendiente:texto:client",
      await responder(
        message,
        "cliente-conocido",
        mensajes.clienteConocido({
          negocio: business ? nombreParaWhatsapp(business) : "tu negocio",
          telefono:
            business && !business.phone.startsWith("TEMP-")
              ? business.phone
              : null,
        }),
        { unaVezAlDia: true }
      )
    );
  }

  return resultado(
    "texto:desconocido",
    await responder(
      message,
      "desconocido-clientes",
      mensajes.desconocidoEnClientes(),
      { unaVezAlDia: true }
    )
  );
}
