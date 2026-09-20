import type { Business, InboundMessage } from "@prisma/client";
import type { WhatsappAudience } from "../../adapters/whatsapp/WhatsAppAdapter.js";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import { reclamarEnvio } from "../../lib/messageIdempotency.js";
import { enqueueRetryBookingJob } from "../../lib/cloudTasks.js";
import { interpretarComando, type PalabraClave } from "./webhooks.js";
import { textoAgendaDelDia, type TipoAviso } from "./avisosNegocio.js";
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
 * Enrutador de mensajes entrantes (PLAN-CANAL-DUENO.md § 6), fase 1:
 * alta del dueño (`ALTA <código>`, botón «Activar avisos»), STOP/BAJA en
 * los dos números, `ALTA` a secas (reactivación), AYUDA, los botones de los
 * avisos al negocio (PR 3: `aviso:<tipo>:<recurso>:<accion>`), la agenda
 * del día (AGENDA/HOY/MAÑANA) y respuestas fijas a todo lo demás. El chat
 * (fase 2) y los botones del lado cliente (PR 4) siguen en `pendiente:*`.
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
    if (keyword === "AGENDA" || keyword === "HOY" || keyword === "MANANA") {
      return agendaEnNegocios(message, keyword === "MANANA" ? 1 : 0);
    }
    // PAUSA y el resto de comandos del Gestor (fase 2): la respuesta fija.
    return resultado(
      `pendiente:palabra-clave:${keyword}`,
      await todaviaNoChateo(message)
    );
  }
  return textoDesconocidoEnNegocios(message);
}

/** AGENDA / HOY / MAÑANA: las citas del día de los negocios del móvil. */
async function agendaEnNegocios(
  message: InboundMessage,
  dia: 0 | 1
): Promise<ResultadoEnrutado> {
  const negocios = (await negociosDelMovil(message.fromNumber)).filter((b) =>
    consintio(b)
  );
  if (negocios.length === 0) {
    return resultado("agenda:sin-negocio", await todaviaNoChateo(message));
  }
  const textos: string[] = [];
  for (const business of negocios) {
    try {
      textos.push(await textoAgendaDelDia(business, dia));
    } catch (error) {
      console.error(
        `[WhatsApp] No se pudo montar la agenda de ${dia === 0 ? "hoy" : "mañana"} del negocio ${business.id}: ${errorMessage(error)}`
      );
      textos.push(
        `${nombreParaWhatsapp(business)}: no he podido leer la agenda ahora mismo.`
      );
    }
  }
  return resultado(
    `agenda:${dia === 0 ? "hoy" : "manana"}`,
    await responder(message, `agenda-${dia}`, textos.join("\n\n"), {
      businessId: negocios[0].id,
    })
  );
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

  const aviso = await resolverBotonDeAviso(message);
  if (aviso) {
    return botonDeAviso(message, aviso);
  }

  const prefix = message.buttonId?.split(":")[0] ?? "?";
  return { handler: `pendiente:boton:${prefix}` };
}

// ---------------------------------------------------------------------------
// Botones de los avisos al negocio (PR 3)
// ---------------------------------------------------------------------------

interface BotonDeAviso {
  tipo: TipoAviso;
  recursoId: string;
  accion: string;
  /** Negocio al que se envió el aviso (SentMessage.businessId). */
  businessId: string | null;
}

const TIPOS_DE_AVISO: readonly string[] = [
  "nueva_reserva",
  "cita_pendiente",
  "cancelacion",
];

/** Acción por el título del botón de una PLANTILLA (sin id propio). */
function accionPorTitulo(titulo: string): string | null {
  switch (normalizarTitulo(titulo)) {
    case "VALE":
      return "vale";
    case "VER AGENDA DE HOY":
      return "agenda_hoy";
    case "LA APUNTE YO":
      return "apuntada";
    case "REINTENTAR":
      return "reintentar";
    case "RECONECTAR":
      return "reconectar";
    case "AVISAR A QUIEN ESPERABA":
      return "avisar_espera";
    default:
      return null;
  }
}

/**
 * Un botón de aviso llega de dos formas: interactivo (el id lleva
 * `aviso:<tipo>:<recurso>:<accion>`) o de plantilla (solo el título; el
 * aviso se sabe por `context.id` → SentMessage.callbackData
 * `aviso:<tipo>:<recurso>`). En los dos casos el envío original tiene que
 * existir y haber ido a este móvil: nunca se actúa sobre un recurso que la
 * persona no recibió.
 */
async function resolverBotonDeAviso(
  message: InboundMessage
): Promise<BotonDeAviso | null> {
  const enviado = message.contextMessageId
    ? await prisma.sentMessage.findUnique({
        where: { providerMessageId: message.contextMessageId },
        select: {
          businessId: true,
          audience: true,
          toNumber: true,
          callbackData: true,
        },
      })
    : null;
  if (
    enviado &&
    (enviado.audience !== "owner" || enviado.toNumber !== message.fromNumber)
  ) {
    return null;
  }

  const partesId = (message.buttonId ?? "").split(":");
  if (partesId[0] === "aviso" && partesId.length >= 4) {
    const tipo = partesId[1];
    const accion = partesId[partesId.length - 1];
    const recursoId = partesId.slice(2, -1).join(":");
    if (TIPOS_DE_AVISO.includes(tipo) && recursoId && accion) {
      if (!enviado) {
        // Sin el envío original no se sabe si este móvil recibió el aviso.
        console.warn(
          `[WhatsApp] Botón ${message.buttonId} desde ${message.fromNumber} sin envío original (context ${message.contextMessageId ?? "—"}); se ignora`
        );
        return null;
      }
      return {
        tipo: tipo as TipoAviso,
        recursoId,
        accion,
        businessId: enviado.businessId,
      };
    }
  }

  const callback = enviado?.callbackData ?? "";
  const partesCb = callback.split(":");
  if (
    partesCb[0] === "aviso" &&
    TIPOS_DE_AVISO.includes(partesCb[1]) &&
    partesCb.length >= 3
  ) {
    const accion = accionPorTitulo(
      message.buttonTitle ?? message.buttonId ?? ""
    );
    if (!accion) return null;
    return {
      tipo: partesCb[1] as TipoAviso,
      recursoId: partesCb.slice(2).join(":"),
      accion,
      businessId: enviado?.businessId ?? null,
    };
  }
  return null;
}

async function botonDeAviso(
  message: InboundMessage,
  aviso: BotonDeAviso
): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;
  const base = `aviso:${aviso.tipo}:${aviso.accion}`;
  const business = aviso.businessId
    ? await prisma.business.findFirst({
        where: {
          id: aviso.businessId,
          ownerWhatsappNumber: from,
          active: true,
        },
      })
    : null;
  if (!business) {
    // El aviso era de un negocio que ya no tiene este móvil: no se actúa.
    return resultado(
      `${base}:numero-antiguo`,
      await responder(message, "otro-movil", mensajes.mensajeParaOtroMovil(), {
        businessId: aviso.businessId,
      })
    );
  }

  switch (aviso.accion) {
    case "vale":
      // Solo cierra el aviso; el toque ya abrió la ventana de 24 h.
      return { handler: base };
    case "agenda_hoy":
      return resultado(
        base,
        await responder(
          message,
          "agenda-0",
          await textoAgendaDelDia(business, 0).catch((error: unknown) => {
            console.error(
              `[WhatsApp] No se pudo montar la agenda de hoy del negocio ${business.id}: ${errorMessage(error)}`
            );
            return `${nombreParaWhatsapp(business)}: no he podido leer la agenda ahora mismo.`;
          }),
          { businessId: business.id }
        )
      );
    case "apuntada":
    case "reintentar":
    case "reconectar":
      return botonDeCitaPendiente(message, aviso, business, base);
    case "avisar_espera":
      return resultado(
        `${base}:pendiente`,
        await responder(
          message,
          "lista-espera",
          mensajes.listaDeEsperaTodaviaNo(),
          {
            businessId: business.id,
          }
        )
      );
    default:
      return { handler: `pendiente:boton:aviso:${aviso.accion}` };
  }
}

async function botonDeCitaPendiente(
  message: InboundMessage,
  aviso: BotonDeAviso,
  business: Business,
  base: string
): Promise<ResultadoEnrutado> {
  if (aviso.accion === "reconectar") {
    return resultado(
      base,
      await responder(
        message,
        "reconectar",
        mensajes.reconectarCalendario({
          panelUrl: mensajes.panelUrl("/ajustes"),
        }),
        { businessId: business.id }
      )
    );
  }
  // El lead tiene que ser de ESTE negocio: el id viene del botón.
  const lead = await prisma.lead.findFirst({
    where: {
      id: aviso.recursoId,
      type: "pending_booking",
      call: { businessId: business.id },
    },
    select: { id: true, resolvedAt: true, data: true },
  });
  if (!lead) {
    console.warn(
      `[WhatsApp] Botón ${aviso.accion} de ${message.fromNumber} para el lead ${aviso.recursoId}, que no es una cita pendiente del negocio ${business.id}; se ignora`
    );
    return { handler: `${base}:lead-ajeno` };
  }
  const cliente =
    (
      (lead.data as { clientName?: unknown } | null)?.clientName as
        string | undefined
    )?.trim() || "ese cliente";
  if (lead.resolvedAt) {
    return resultado(
      `${base}:ya-resuelta`,
      await responder(message, "cita-resuelta", mensajes.citaYaResuelta(), {
        businessId: business.id,
      })
    );
  }
  if (aviso.accion === "apuntada") {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        resolvedAt: new Date(),
        data: {
          ...((lead.data as Record<string, unknown> | null) ?? {}),
          resolvedBy: "owner_whatsapp",
          resolvedFromInboundMessageId: message.id,
        },
      },
    });
    console.log(
      `[WhatsApp] Cita pendiente ${lead.id} del negocio ${business.id} resuelta a mano por el dueño (${message.fromNumber})`
    );
    return resultado(
      base,
      await responder(
        message,
        "cita-apuntada",
        mensajes.citaApuntada({ cliente }),
        {
          businessId: business.id,
        }
      )
    );
  }
  // reintentar
  try {
    await enqueueRetryBookingJob({ leadId: lead.id });
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo encolar el reintento de la cita pendiente ${lead.id} (negocio ${business.id}): ${errorMessage(error)}`
    );
    return resultado(
      `${base}:sin-encolar`,
      await responder(
        message,
        "reintento-fallido",
        `No he podido programar el reintento de la cita de ${cliente}. Inténtalo desde el panel: ${mensajes.panelUrl("/")}`,
        { businessId: business.id }
      )
    );
  }
  return resultado(
    base,
    await responder(
      message,
      "cita-reintento",
      mensajes.reintentandoCita({ cliente }),
      {
        businessId: business.id,
      }
    )
  );
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
