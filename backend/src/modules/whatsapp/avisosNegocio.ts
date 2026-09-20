import type { Prisma } from "@prisma/client";
import type { WhatsAppButton } from "../../adapters/whatsapp/WhatsAppAdapter.js";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import { reclamarEnvio } from "../../lib/messageIdempotency.js";
import { getRedis } from "../../lib/redis.js";
import { timezoneOffsetMinutes } from "../../lib/voiceDateTime.js";
import { bajaVigente } from "./bajas.js";
import { nombreParaWhatsapp, puedeRecibirAvisos } from "./altaDueno.js";
import {
  enviarBotones,
  enviarCtaUrl,
  enviarPlantilla,
  resolverPlantilla,
  ventanaAbierta,
} from "./service.js";
import * as mensajes from "./mensajes.js";

/**
 * Avisos al negocio por WhatsApp (PLAN-CANAL-DUENO.md § 4, § 9 y § 12),
 * fase 1 / PR 3: nueva reserva (#1), cita que no entró en el calendario
 * (#3) y cancelación del cliente (#4). El recado (#2, post-conversación) y
 * las alertas operativas (#5) llegan en PRs aparte.
 *
 * Cómo sale cada aviso, en este orden:
 * 1. Solo a un móvil `activo` (consentido, sin STOP, sin 131026) y sin baja
 *    global; si no, el respaldo por email cuando el aviso lo tiene.
 * 2. Dentro de la ventana de 24 h del dueño (Telnyx es la fuente de verdad):
 *    mensaje interactivo con botones, 0,004 $.
 * 3. Fuera de la ventana: la plantilla del aviso, si Meta la tiene aprobada
 *    (0,024 $). Las doce del plan siguen `PENDING`: hasta entonces, fuera
 *    de la ventana solo queda el email.
 * 4. Sin ventana ni plantilla: email si el aviso lo tiene; si no, nada, y
 *    queda en el log y en `SentMessage` (`skipped`).
 *
 * Idempotente por recurso (`aviso:<tipo>:<recursoId>`): un reintento de
 * Cloud Tasks o dos llamadas del mismo flujo no avisan dos veces. Nunca
 * lanza: un aviso que no sale no puede tumbar la reserva o la cancelación
 * que lo origina.
 */

export type TipoAviso =
  | "nueva_reserva"
  | "cita_pendiente"
  | "cancelacion"
  | "recado"
  | "alerta";

export type ViaAviso = "interactivo" | "plantilla" | "email" | "ninguna";

export interface ResultadoAviso {
  via: ViaAviso;
  /** Por qué no salió por WhatsApp (log y `Lead.notifiedVia`). */
  motivo?: string;
}

interface AvisoAlNegocio {
  businessId: string;
  tipo: TipoAviso;
  /** Id de la reserva o del lead: forma la clave de idempotencia y los botones. */
  recursoId: string;
  /** Cuerpo del interactivo (dentro de la ventana). */
  texto: string;
  /** Botones del interactivo; sus ids llevan `aviso:<tipo>:<recursoId>:<accion>`. */
  botones: WhatsAppButton[];
  /** En vez de botones de respuesta: un único botón que abre una URL. */
  ctaUrl?: { texto: string; url: string };
  /** Plantilla aprobada por Meta para fuera de la ventana. */
  plantilla: {
    key: string;
    params: Record<string, string>;
    /** Sufijos dinámicos de los botones URL de la plantilla. */
    buttonUrlParams?: Array<{ index: number; text: string }>;
  };
  /** Respaldo cuando WhatsApp no es posible. Nunca debe lanzar. */
  email?: () => Promise<void>;
}

/** Preferencias de avisos del negocio (`Business.notificationPrefs`). */
export interface PreferenciasDeAvisos {
  /** Aviso #1 por cada reserva. Activado salvo que el dueño lo apague. */
  avisoPorReserva?: boolean;
}

export function preferenciasDeAvisos(
  raw: Prisma.JsonValue | null | undefined
): PreferenciasDeAvisos {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const prefs = raw as Record<string, unknown>;
  return {
    avisoPorReserva:
      typeof prefs.avisoPorReserva === "boolean"
        ? prefs.avisoPorReserva
        : undefined,
  };
}

/** Tope de avisos de cita pendiente por negocio y hora: si el calendario
 * está caído, cinco avisos bastan para enterarse; el resto queda en el
 * panel y en el email (que ya tiene su propio antirrebote). */
const TOPE_CITAS_PENDIENTES_POR_HORA = 5;

export function idDeBoton(
  tipo: TipoAviso,
  recursoId: string,
  accion: string
): string {
  return `aviso:${tipo}:${recursoId}:${accion}`;
}

/** «jueves 24 de septiembre a las 17:00», en la zona horaria del negocio. */
export function formatearCita(fecha: Date, timezone: string): string {
  const partes = new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone || "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(fecha);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? "";
  return `${valor("weekday")} ${valor("day")} de ${valor("month")} a las ${valor("hour")}:${valor("minute")}`;
}

/** «jueves 17:00» para el texto corto del interactivo. */
export function formatearCitaCorta(fecha: Date, timezone: string): string {
  const partes = new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone || "Europe/Madrid",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(fecha);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? "";
  return `${valor("weekday")} ${valor("hour")}:${valor("minute")}`;
}

async function marcarEnvio(
  idempotencyKey: string,
  data: Prisma.SentMessageUpdateManyMutationInput
): Promise<void> {
  try {
    await prisma.sentMessage.updateMany({
      where: { channel: "whatsapp", idempotencyKey },
      data,
    });
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo marcar el aviso ${idempotencyKey}: ${errorMessage(error)}`
    );
  }
}

async function respaldoPorEmail(
  aviso: AvisoAlNegocio,
  motivo: string
): Promise<ResultadoAviso> {
  if (!aviso.email) {
    console.log(
      `[WhatsApp] Aviso ${aviso.tipo} del negocio ${aviso.businessId} sin salida (${motivo}); no tiene respaldo por email`
    );
    return { via: "ninguna", motivo };
  }
  try {
    await aviso.email();
    console.log(
      `[WhatsApp] Aviso ${aviso.tipo} del negocio ${aviso.businessId} por email (${motivo})`
    );
    return { via: "email", motivo };
  } catch (error) {
    console.error(
      `[WhatsApp] Aviso ${aviso.tipo} del negocio ${aviso.businessId}: WhatsApp no posible (${motivo}) y el email también falló: ${errorMessage(error)}`
    );
    return {
      via: "ninguna",
      motivo: `${motivo}; email: ${errorMessage(error)}`,
    };
  }
}

/**
 * Envía un aviso al dueño por la mejor vía disponible (ver cabecera del
 * fichero). Nunca lanza.
 */
export async function enviarAvisoAlNegocio(
  aviso: AvisoAlNegocio
): Promise<ResultadoAviso> {
  const etiqueta = `aviso ${aviso.tipo} (${aviso.recursoId}) del negocio ${aviso.businessId}`;
  let business;
  try {
    business = await prisma.business.findUnique({
      where: { id: aviso.businessId },
      select: {
        id: true,
        name: true,
        active: true,
        ownerWhatsappNumber: true,
        ownerWhatsappOptInAt: true,
        ownerWhatsappOptOutAt: true,
        ownerWhatsappUnreachableAt: true,
        notificationPrefs: true,
      },
    });
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo leer el negocio para el ${etiqueta}: ${errorMessage(error)}`
    );
    return respaldoPorEmail(aviso, "sin acceso a la base de datos");
  }
  if (!business || !business.active) {
    return { via: "ninguna", motivo: "negocio inexistente o inactivo" };
  }

  if (
    aviso.tipo === "nueva_reserva" &&
    preferenciasDeAvisos(business.notificationPrefs).avisoPorReserva === false
  ) {
    return { via: "ninguna", motivo: "aviso por reserva desactivado" };
  }

  const numero = business.ownerWhatsappNumber;
  let bajaGlobal = null;
  if (numero) {
    try {
      bajaGlobal = await bajaVigente("owner", numero);
    } catch (error) {
      console.error(
        `[WhatsApp] No se pudo comprobar la baja de ${numero} para el ${etiqueta}; se asume sin baja: ${errorMessage(error)}`
      );
    }
  }
  if (!numero || !puedeRecibirAvisos(business, bajaGlobal)) {
    return respaldoPorEmail(
      aviso,
      numero ? "el móvil del dueño no está activo" : "el negocio no tiene móvil"
    );
  }

  const idempotencyKey = `aviso:${aviso.tipo}:${aviso.recursoId}`;
  const callbackData = `aviso:${aviso.tipo}:${aviso.recursoId}`;
  const reclamado = await reclamarEnvio("whatsapp", idempotencyKey, {
    businessId: business.id,
    audience: "owner",
    toNumber: numero,
    callbackData,
    kind: "interactive",
  });
  if (!reclamado) {
    return { via: "ninguna", motivo: "ya enviado" };
  }

  const ventana = await ventanaAbierta("owner", numero);
  try {
    if (ventana) {
      const result = aviso.ctaUrl
        ? await enviarCtaUrl({
            audience: "owner",
            to: numero,
            businessId: business.id,
            body: aviso.texto,
            buttonText: aviso.ctaUrl.texto,
            url: aviso.ctaUrl.url,
            idempotencyKey,
            callbackData,
          })
        : await enviarBotones({
            audience: "owner",
            to: numero,
            businessId: business.id,
            body: aviso.texto,
            buttons: aviso.botones,
            idempotencyKey,
            callbackData,
          });
      console.log(
        `[WhatsApp] ${etiqueta}: interactivo a ${numero} (${result.messageId})`
      );
      return { via: "interactivo" };
    }

    const plantilla = await resolverPlantilla({ key: aviso.plantilla.key });
    if (plantilla) {
      await marcarEnvio(idempotencyKey, { kind: "template" });
      const result = await enviarPlantilla({
        audience: "owner",
        to: numero,
        businessId: business.id,
        template: { id: plantilla.telnyxTemplateId },
        bodyParams: aviso.plantilla.params,
        buttonUrlParams: aviso.plantilla.buttonUrlParams,
        idempotencyKey,
        callbackData,
      });
      console.log(
        `[WhatsApp] ${etiqueta}: plantilla ${aviso.plantilla.key} a ${numero} (${result.messageId})`
      );
      return { via: "plantilla" };
    }

    const motivo = `ventana cerrada y plantilla ${aviso.plantilla.key} sin aprobar`;
    await marcarEnvio(idempotencyKey, {
      deliveryStatus: "skipped",
      errorCode: "SIN_VENTANA_NI_PLANTILLA",
      errorDetail: motivo,
    });
    return respaldoPorEmail(aviso, motivo);
  } catch (error) {
    if ((error as { code?: unknown })?.code === "WHATSAPP_OPT_OUT") {
      return { via: "ninguna", motivo: "el número pidió STOP" };
    }
    const motivo = errorMessage(error);
    console.error(
      `[WhatsApp] ${etiqueta}: no se pudo enviar a ${numero}: ${motivo}`
    );
    await marcarEnvio(idempotencyKey, {
      deliveryStatus: "failed",
      errorCode: "SEND_ERROR",
      errorDetail: motivo,
    });
    return respaldoPorEmail(aviso, `fallo al enviar: ${motivo}`);
  }
}

// ---------------------------------------------------------------------------
// Los tres avisos de este PR
// ---------------------------------------------------------------------------

export async function mapaDeServicios(
  serviceIds: string[]
): Promise<Map<string, string>> {
  if (serviceIds.length === 0) return new Map();
  try {
    const servicios = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true },
    });
    return new Map(servicios.map((s) => [s.id, s.name]));
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudieron leer los nombres de los servicios: ${errorMessage(error)}`
    );
    return new Map();
  }
}

export async function nombreDeServicios(
  serviceIds: string[]
): Promise<string[]> {
  const porId = await mapaDeServicios(serviceIds);
  return serviceIds.map((id) => porId.get(id)).filter((n): n is string => !!n);
}

/** «corte y mechas, con Laura» / «corte» / «con Laura» / «cita». */
export function describirServicio(
  serviceNames: string[],
  professionalName: string | null
): string {
  const servicios = serviceNames.filter(Boolean);
  const base =
    servicios.length === 0
      ? ""
      : servicios.length === 1
        ? servicios[0]
        : `${servicios.slice(0, -1).join(", ")} y ${servicios[servicios.length - 1]}`;
  if (professionalName && base) return `${base}, con ${professionalName}`;
  if (professionalName) return `con ${professionalName}`;
  return base || "cita";
}

/** #1 — La recepcionista ha reservado una cita. */
export async function avisarNuevaReserva(input: {
  businessId: string;
  businessName: string;
  timezone: string;
  bookingId: string;
  clientName: string;
  startDateTime: Date;
  serviceNames: string[];
  professionalName: string | null;
}): Promise<ResultadoAviso> {
  const negocio = nombreParaWhatsapp({ name: input.businessName });
  const servicio = describirServicio(
    input.serviceNames,
    input.professionalName
  );
  return enviarAvisoAlNegocio({
    businessId: input.businessId,
    tipo: "nueva_reserva",
    recursoId: input.bookingId,
    texto: mensajes.avisoNuevaReserva({
      negocio,
      cliente: input.clientName,
      cita: formatearCitaCorta(input.startDateTime, input.timezone),
      servicio,
    }),
    botones: [
      {
        id: idDeBoton("nueva_reserva", input.bookingId, "vale"),
        title: "Vale",
      },
      {
        id: idDeBoton("nueva_reserva", input.bookingId, "agenda_hoy"),
        title: "Ver agenda de hoy",
      },
    ],
    plantilla: {
      key: "nueva_reserva_negocio",
      params: {
        negocio_nombre: negocio,
        cliente_nombre: input.clientName,
        servicio,
        cita: formatearCita(input.startDateTime, input.timezone),
      },
    },
  });
}

/** Motivo legible del fallo de calendario (`Lead.data.failureCode`). */
export function motivoDeFallo(failureCode: string | null | undefined): string {
  switch (failureCode) {
    case "calendar_reconnect_required":
    case "CALENDAR_RECONNECT_REQUIRED":
      return "la conexión con tu calendario estaba caducada";
    case "calendar_not_connected":
    case "CALENDAR_NOT_CONNECTED":
      return "no tienes ningún calendario conectado";
    case "booking_lock":
    case "BOOKING_LOCK":
      return "otra reserva estaba entrando a la vez";
    default:
      return "tu calendario no respondió";
  }
}

/** #3 — La cita se reservó por teléfono pero no entró en el calendario. */
export async function avisarCitaPendiente(input: {
  businessId: string;
  businessName: string;
  timezone: string;
  leadId: string;
  clientName: string;
  startDateTime: Date;
  failureCode: string | null;
  email?: () => Promise<void>;
}): Promise<ResultadoAviso> {
  // Tope por negocio y hora: con el calendario caído, cinco avisos bastan.
  try {
    const clave = `whatsapp:cita_pendiente:${input.businessId}:${Math.floor(Date.now() / 3_600_000)}`;
    const enEstaHora = await getRedis().incr(clave);
    if (enEstaHora === 1) {
      await getRedis().expire(clave, 3_600);
    }
    if (enEstaHora > TOPE_CITAS_PENDIENTES_POR_HORA) {
      console.log(
        `[WhatsApp] Aviso cita_pendiente del negocio ${input.businessId} omitido: ${enEstaHora - 1} en la última hora`
      );
      return marcarLeadAvisado(input.leadId, {
        via: "ninguna",
        motivo: "tope por hora",
      });
    }
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo leer el tope de avisos de cita pendiente del negocio ${input.businessId}; se avisa: ${errorMessage(error)}`
    );
  }

  const negocio = nombreParaWhatsapp({ name: input.businessName });
  const motivo = motivoDeFallo(input.failureCode);
  const resultado = await enviarAvisoAlNegocio({
    businessId: input.businessId,
    tipo: "cita_pendiente",
    recursoId: input.leadId,
    texto: mensajes.avisoCitaPendiente({
      negocio,
      cliente: input.clientName,
      cita: formatearCitaCorta(input.startDateTime, input.timezone),
      motivo,
      panelUrl: mensajes.panelUrl("/ajustes"),
    }),
    botones: [
      {
        id: idDeBoton("cita_pendiente", input.leadId, "apuntada"),
        title: "La apunté yo",
      },
      {
        id: idDeBoton("cita_pendiente", input.leadId, "reintentar"),
        title: "Reintentar",
      },
      {
        id: idDeBoton("cita_pendiente", input.leadId, "reconectar"),
        title: "Reconectar",
      },
    ],
    plantilla: {
      key: "cita_pendiente_negocio",
      params: {
        negocio_nombre: negocio,
        cliente_nombre: input.clientName,
        cita: formatearCita(input.startDateTime, input.timezone),
        motivo,
      },
    },
    email: input.email,
  });
  return marcarLeadAvisado(input.leadId, resultado);
}

async function marcarLeadAvisado(
  leadId: string,
  resultado: ResultadoAviso
): Promise<ResultadoAviso> {
  try {
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        notifiedAt: resultado.via === "ninguna" ? undefined : new Date(),
        notifiedVia: resultado.motivo
          ? `${resultado.via}:${resultado.motivo}`.slice(0, 200)
          : resultado.via,
      },
    });
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo anotar el aviso en el lead ${leadId}: ${errorMessage(error)}`
    );
  }
  return resultado;
}

/** #4 — El cliente ha cancelado su cita. */
export async function avisarCancelacion(input: {
  businessId: string;
  businessName: string;
  timezone: string;
  bookingId: string;
  clientName: string | null;
  startDateTime: Date;
  serviceNames: string[];
}): Promise<ResultadoAviso> {
  const negocio = nombreParaWhatsapp({ name: input.businessName });
  const cliente = input.clientName?.trim() || "Un cliente";
  return enviarAvisoAlNegocio({
    businessId: input.businessId,
    tipo: "cancelacion",
    recursoId: input.bookingId,
    texto: mensajes.avisoCancelacion({
      negocio,
      cliente,
      cita: formatearCitaCorta(input.startDateTime, input.timezone),
      servicio: describirServicio(input.serviceNames, null),
    }),
    botones: [
      { id: idDeBoton("cancelacion", input.bookingId, "vale"), title: "Vale" },
      {
        id: idDeBoton("cancelacion", input.bookingId, "avisar_espera"),
        // 19 caracteres (tope 20 del interactivo); la plantilla
        // `cancelacion_negocio` lleva «Avisar a quien esperaba» y se
        // resuelve por título.
        title: "Avisar lista espera",
      },
    ],
    plantilla: {
      key: "cancelacion_negocio",
      params: {
        negocio_nombre: negocio,
        cliente_nombre: cliente,
        cita: formatearCita(input.startDateTime, input.timezone),
      },
    },
  });
}

/** #2 — Recado o petición de llamada tomados en la post-conversación. */
export async function avisarRecado(input: {
  businessId: string;
  businessName: string;
  leadId: string;
  clientName: string | null;
  clientPhone: string | null;
  motivo: string;
  quiereQueLeLlamen: boolean;
  /** Sufijo del recurso para los recordatorios («Recuérdamelo mañana»). */
  intento?: number;
  email?: () => Promise<void>;
}): Promise<ResultadoAviso> {
  const negocio = nombreParaWhatsapp({ name: input.businessName });
  const recursoId = input.intento ? `${input.leadId}:r${input.intento}` : input.leadId;
  const resultado = await enviarAvisoAlNegocio({
    businessId: input.businessId,
    tipo: "recado",
    recursoId,
    texto: mensajes.avisoRecado({
      negocio,
      cliente: input.clientName,
      telefono: input.clientPhone,
      motivo: input.motivo,
      quiereQueLeLlamen: input.quiereQueLeLlamen,
    }),
    botones: [
      { id: idDeBoton("recado", input.leadId, "atendido"), title: "Atendido" },
      {
        id: idDeBoton("recado", input.leadId, "manana"),
        title: "Recuérdamelo mañana",
      },
    ],
    plantilla: {
      key: "recado_negocio",
      params: {
        negocio_nombre: negocio,
        cliente_nombre: input.clientName ?? "Un cliente",
        cliente_telefono: input.clientPhone ?? "sin teléfono",
        motivo: input.motivo,
      },
    },
    email: input.email,
  });
  return marcarLeadAvisado(input.leadId, resultado);
}

/** Causas del aviso #5 y a qué pantalla del panel llevan. */
export type CausaDeAlerta =
  | "calendario"
  | "telefono"
  | "prueba"
  | "minutos"
  | "pago";

/** Sufijo del botón URL de la plantilla (`https://alhabla.ai/ajustes/{{1}}`)
 * y ruta real del panel. `calendario` y `telefono` viven en /agente: el
 * frontend redirige /ajustes/calendario y /ajustes/telefono allí. */
export const RUTA_DE_ALERTA: Record<CausaDeAlerta, string> = {
  calendario: "calendario",
  telefono: "telefono",
  prueba: "facturacion",
  minutos: "facturacion",
  pago: "facturacion",
};

/** #5 — Alerta operativa: algo que el dueño tiene que arreglar en el panel. */
export async function avisarAlerta(input: {
  businessId: string;
  businessName: string;
  causa: CausaDeAlerta;
  /** Texto de la alerta sin el nombre del negocio (se antepone aquí). */
  texto: string;
  /** Identifica esta alerta concreta (idempotencia): p.ej. `pago:<invoiceId>`. */
  recursoId: string;
  email?: () => Promise<void>;
}): Promise<ResultadoAviso> {
  const negocio = nombreParaWhatsapp({ name: input.businessName });
  const ruta = RUTA_DE_ALERTA[input.causa];
  return enviarAvisoAlNegocio({
    businessId: input.businessId,
    tipo: "alerta",
    recursoId: input.recursoId,
    texto: `${negocio}: ${input.texto}`,
    botones: [],
    ctaUrl: {
      texto: "Ir a Ajustes",
      url: mensajes.panelUrl(`/ajustes/${ruta}`),
    },
    plantilla: {
      key: "alerta_operativa_negocio",
      params: { negocio_nombre: negocio, texto: input.texto },
      buttonUrlParams: [{ index: 0, text: ruta }],
    },
    email: input.email,
  });
}

/** Aviso de que una cita pendiente entró por fin en el calendario. */
export async function avisarCitaRecuperada(input: {
  businessId: string;
  businessName: string;
  timezone: string;
  leadId: string;
  clientName: string;
  startDateTime: Date;
}): Promise<ResultadoAviso> {
  return enviarAvisoAlNegocio({
    businessId: input.businessId,
    tipo: "cita_pendiente",
    recursoId: `${input.leadId}:recuperada`,
    texto: mensajes.avisoCitaRecuperada({
      negocio: nombreParaWhatsapp({ name: input.businessName }),
      cliente: input.clientName,
      cita: formatearCitaCorta(input.startDateTime, input.timezone),
    }),
    botones: [
      {
        id: idDeBoton("cita_pendiente", `${input.leadId}:recuperada`, "vale"),
        title: "Vale",
      },
    ],
    // Sin plantilla propia: fuera de la ventana no se avisa (el panel ya
    // lo refleja); `resolverPlantilla` devuelve null para una clave que no
    // existe y se cae al respaldo, que aquí no hay.
    plantilla: { key: "cita_recuperada_negocio", params: {} },
  });
}

// ---------------------------------------------------------------------------
// Agenda del día (botón «Ver agenda de hoy» y palabras clave AGENDA/HOY/MAÑANA)
// ---------------------------------------------------------------------------

/** Límites del día `dia` (0 = hoy, 1 = mañana) en la zona horaria del negocio. */
export function limitesDelDia(
  timezone: string,
  dia: number,
  ahora: Date = new Date()
): { inicio: Date; fin: Date; etiqueta: string } {
  const zona = timezone || "Europe/Madrid";
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? "";
  // Medianoche local del día pedido: la fecha civil como UTC menos el desfase
  // de la zona en ese instante (misma técnica que voiceDateTime.ts).
  const civil = new Date(
    Date.UTC(
      Number(valor("year")),
      Number(valor("month")) - 1,
      Number(valor("day")) + dia
    )
  );
  const inicio = new Date(
    civil.getTime() - timezoneOffsetMinutes(civil, zona) * 60_000
  );
  const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  const etiqueta = new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone || "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(inicio);
  return { inicio, fin, etiqueta };
}

/** Texto con las citas del día del negocio, listo para enviar. */
export async function textoAgendaDelDia(
  business: { id: string; name: string; timezone: string },
  dia: 0 | 1
): Promise<string> {
  const { inicio, fin, etiqueta } = limitesDelDia(business.timezone, dia);
  const reservas = await prisma.booking.findMany({
    where: {
      call: { businessId: business.id },
      isCancelled: false,
      programedAt: { gte: inicio, lt: fin },
    },
    orderBy: { programedAt: "asc" },
    select: {
      programedAt: true,
      clientName: true,
      serviceIds: true,
      professional: { select: { name: true } },
    },
    take: 40,
  });
  const porId = await mapaDeServicios([
    ...new Set(reservas.flatMap((r) => r.serviceIds)),
  ]);
  const lineas = reservas.map((r) => {
    const hora = new Intl.DateTimeFormat("es-ES", {
      timeZone: business.timezone || "Europe/Madrid",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(r.programedAt);
    const servicios = r.serviceIds
      .map((id) => porId.get(id))
      .filter((n): n is string => !!n);
    return `${hora} · ${r.clientName?.trim() || "Sin nombre"}${servicios.length ? ` · ${servicios.join(", ")}` : ""}${r.professional ? ` · ${r.professional.name}` : ""}`;
  });
  return mensajes.agendaDelDia({
    negocio: nombreParaWhatsapp(business),
    dia: dia === 0 ? "hoy" : "mañana",
    etiqueta,
    lineas,
  });
}
