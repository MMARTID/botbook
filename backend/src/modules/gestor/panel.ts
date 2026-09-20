import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import { ESTADOS_DE_SUSCRIPCION_BLOQUEADOS } from "../../lib/planFeatures.js";
import { telnyxAiAdapter } from "../../adapters/telnyx/TelnyxAiAdapter.js";
import {
  TEXTO_DE_SEGUIMIENTO,
  anotarEnConversacionDelDueno,
  chatDelDuenoActivo,
  esRespuestaVacia,
  gestorAssistantId,
  turnoDelGestor,
} from "../whatsapp/chatDueno.js";
import { estadoWhatsappDelDueno } from "../whatsapp/altaDueno.js";
import { estaDadoDeBaja } from "../whatsapp/bajas.js";
import * as mensajes from "../whatsapp/mensajes.js";
import {
  decidirPropuesta,
  registrarPropuesta,
  type PropuestaSiguiente,
} from "./acciones.js";

/**
 * «Tu Gestor» en el panel (PLAN-CANAL-DUENO.md § 13, fase 2 / PR 5): el
 * mismo Gestor y la misma conversación de Telnyx que por WhatsApp, pero la
 * respuesta vuelve al navegador en vez de salir como mensaje. Comparte con
 * el WhatsApp el contador diario, el lock del hilo, el registro de
 * propuestas y sus botones (aquí, botones de la página). No exige que el
 * dueño tenga WhatsApp dado de alta: el JWT ya dice quién es.
 */

const MAX_MENSAJES_HISTORIAL = 60;
const MAX_TEXTO = 1000;

export interface MensajeDelHistorial {
  de: "dueno" | "gestor";
  texto: string;
  /** ISO, si Telnyx lo devuelve. */
  en: string | null;
}

export interface PropuestaDelPanel {
  id: string;
  resumen: string;
  expiresAt: string;
  botones: { confirmar: string; cancelar: string };
}

export interface EstadoDelGestorEnPanel {
  /** Interruptor global y assistant configurado. */
  disponible: boolean;
  /** `Business.ownerChatEnabled`. */
  activoEnNegocio: boolean;
  /** Estado del móvil del dueño, para el texto de ayuda. */
  whatsapp: "sin_numero" | "pendiente" | "activo" | "sin_whatsapp" | "baja";
  mensajes: MensajeDelHistorial[];
  propuesta: PropuestaDelPanel | null;
}

const BOTONES_POR_DEFECTO = { confirmar: "Confirmar", cancelar: "Cancelar" };

const SELECT_NEGOCIO = {
  id: true,
  name: true,
  businessType: true,
  timezone: true,
  active: true,
  ownerChatEnabled: true,
  ownerWhatsappNumber: true,
  ownerWhatsappOptInAt: true,
  ownerWhatsappOptOutAt: true,
  ownerWhatsappUnreachableAt: true,
  ownerConversationId: true,
  ownerConversationCreatedAt: true,
  subscriptionStatus: true,
} as const;

function disponible(): boolean {
  return chatDelDuenoActivo() && gestorAssistantId() !== null;
}

/** El marcador que el sistema pone delante de cada mensaje del dueño. */
const MARCADOR = /^\[WhatsApp · [^\]]*\]\s*/;

/** Los turnos sintéticos tras un botón y sus «Listo.» no son conversación. */
function esTurnoSintetico(texto: string): boolean {
  return texto.startsWith("(") && texto.endsWith(")");
}

async function propuestaPendiente(
  businessId: string
): Promise<PropuestaDelPanel | null> {
  const fila = await prisma.ownerPendingAction.findFirst({
    where: {
      businessId,
      confirmedAt: null,
      rejectedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, tipo: true, resumen: true, expiresAt: true },
  });
  if (!fila) return null;
  return {
    id: fila.id,
    resumen: fila.resumen,
    expiresAt: fila.expiresAt.toISOString(),
    botones:
      fila.tipo === "avisar_cliente"
        ? { confirmar: "Sí, avísale", cancelar: "No" }
        : BOTONES_POR_DEFECTO,
  };
}

export async function historialDelGestor(
  businessId: string
): Promise<EstadoDelGestorEnPanel | null> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: SELECT_NEGOCIO,
  });
  if (!business) return null;
  const bajaGlobal = business.ownerWhatsappNumber
    ? await estaDadoDeBaja("owner", business.ownerWhatsappNumber)
    : false;
  const whatsapp = estadoWhatsappDelDueno(
    business,
    bajaGlobal ? { optedOutAt: new Date() } : null
  );

  let historial: MensajeDelHistorial[] = [];
  if (business.ownerConversationId && disponible()) {
    try {
      const crudos = await telnyxAiAdapter.listConversationMessages(
        business.ownerConversationId
      );
      // Telnyx los devuelve del más nuevo al más viejo.
      historial = crudos
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          de: m.role === "user" ? ("dueno" as const) : ("gestor" as const),
          texto: m.text.replace(MARCADOR, "").trim(),
          en: m.createdAt ?? m.sentAt ?? null,
        }))
        .filter(
          (m) =>
            m.texto !== "" &&
            !(m.de === "dueno" && esTurnoSintetico(m.texto)) &&
            !(m.de === "gestor" && esRespuestaVacia(m.texto))
        )
        .reverse()
        .slice(-MAX_MENSAJES_HISTORIAL);
    } catch (error) {
      console.error(
        `[Gestor] Panel del negocio ${businessId}: no se pudo leer el historial de la conversación ${business.ownerConversationId}: ${errorMessage(error)}`
      );
    }
  }
  return {
    disponible: disponible(),
    activoEnNegocio: business.ownerChatEnabled,
    whatsapp,
    mensajes: historial,
    propuesta: await propuestaPendiente(businessId),
  };
}

export type RespuestaDelPanel =
  | {
      ok: true;
      respuesta: string;
      propuesta: PropuestaDelPanel | null;
    }
  | {
      ok: false;
      motivo:
        | "no_disponible"
        | "apagado_negocio"
        | "negocio_inactivo"
        | "sin_texto"
        | "limite"
        | "ocupado"
        | "sin_respuesta";
      mensaje: string;
    };

/** Un mensaje del dueño desde el panel. */
export async function preguntarAlGestor(input: {
  businessId: string;
  texto: string;
}): Promise<RespuestaDelPanel> {
  const texto = input.texto.trim().slice(0, MAX_TEXTO);
  if (!disponible()) {
    return {
      ok: false,
      motivo: "no_disponible",
      mensaje: "El Gestor no está disponible todavía.",
    };
  }
  if (!texto) {
    return { ok: false, motivo: "sin_texto", mensaje: "Escribe algo primero." };
  }
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: SELECT_NEGOCIO,
  });
  if (
    !business ||
    !business.active ||
    (business.subscriptionStatus &&
      ESTADOS_DE_SUSCRIPCION_BLOQUEADOS.has(business.subscriptionStatus))
  ) {
    return {
      ok: false,
      motivo: "negocio_inactivo",
      mensaje: "El Gestor no puede atender con la suscripción en este estado.",
    };
  }
  if (!business.ownerChatEnabled) {
    return {
      ok: false,
      motivo: "apagado_negocio",
      mensaje: "El Gestor está desactivado en Ajustes › WhatsApp.",
    };
  }
  const turno = await turnoDelGestor({
    business,
    ownerPhone: business.ownerWhatsappNumber ?? "panel",
    texto,
    inboundMessageId: `panel:${randomUUID()}`,
    etiqueta: `${business.id}/panel`,
  });
  if (turno.estado === "limite") {
    return {
      ok: false,
      motivo: "limite",
      mensaje:
        "Por hoy hemos llegado al límite de mensajes con el Gestor. Mañana seguimos.",
    };
  }
  if (turno.estado === "ocupado") {
    return {
      ok: false,
      motivo: "ocupado",
      mensaje:
        "El Gestor está atendiendo otro mensaje tuyo. Espera un momento.",
    };
  }
  if (!turno.respuesta || !turno.respuesta.trim()) {
    console.error(
      `[Gestor] Panel del negocio ${business.id}: sin respuesta del Gestor${turno.motivoDeFallo ? ` (${turno.motivoDeFallo})` : ""}`
    );
    return {
      ok: false,
      motivo: "sin_respuesta",
      mensaje: "El Gestor no ha respondido. Inténtalo de nuevo en un momento.",
    };
  }
  const propuesta = turno.accionId
    ? await propuestaPendiente(business.id)
    : null;
  return { ok: true, respuesta: turno.respuesta.trim(), propuesta };
}

export type DecisionDelPanel =
  | {
      ok: true;
      estado: "ejecutada" | "fallida" | "rechazada";
      mensaje: string;
      /** «¿Le mando la confirmación?» tras una acción ejecutada. */
      propuesta: PropuestaDelPanel | null;
      /** Lo que añade el Gestor en el turno de seguimiento, si algo. */
      seguimiento: string | null;
    }
  | {
      ok: false;
      motivo: "caducada" | "ya_decidida" | "no_encontrada";
      mensaje: string;
    };

/** Botón de una propuesta pulsado en el panel: mismo camino que por WhatsApp
 * (`decidirPropuesta`, nota en la conversación, pregunta siguiente o turno
 * de seguimiento), con la respuesta de vuelta al navegador. */
export async function decidirEnElPanel(input: {
  businessId: string;
  accionId: string;
  decision: "confirmar" | "cancelar";
}): Promise<DecisionDelPanel> {
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: SELECT_NEGOCIO,
  });
  if (!business) {
    return {
      ok: false,
      motivo: "no_encontrada",
      mensaje: mensajes.accionNoEncontrada(),
    };
  }
  const propuestaFila = await prisma.ownerPendingAction.findFirst({
    where: { id: input.accionId, businessId: business.id },
    select: { tipo: true },
  });
  const r = await decidirPropuesta({
    accionId: input.accionId,
    businessId: business.id,
    timezone: business.timezone,
    decision: input.decision,
    inboundMessageId: `panel:${randomUUID()}`,
  });
  switch (r.estado) {
    case "no_encontrada":
      return {
        ok: false,
        motivo: r.estado,
        mensaje: mensajes.accionNoEncontrada(),
      };
    case "caducada":
      return {
        ok: false,
        motivo: r.estado,
        mensaje: mensajes.accionCaducada(),
      };
    case "ya_decidida":
      return {
        ok: false,
        motivo: r.estado,
        mensaje: mensajes.accionYaDecidida(),
      };
    default:
      break;
  }

  const eraAviso = propuestaFila?.tipo === "avisar_cliente";
  let propuesta: PropuestaDelPanel | null = null;
  if (r.estado === "ejecutada" && r.siguiente) {
    propuesta = await proponerSiguiente(business, r.siguiente);
  }
  await anotarEnConversacionDelDueno(
    business.id,
    r.estado === "ejecutada"
      ? `El dueño pulsó Confirmar en la propuesta ${input.accionId} (desde el panel) y se ejecutó. Resultado: ${r.nota ?? r.mensaje}${
          propuesta
            ? ` A continuación el sistema le ha preguntado con botones: «${r.siguiente!.pregunta}» (propuesta ${propuesta.id}); no lo vuelvas a preguntar.`
            : ""
        }`
      : r.estado === "fallida"
        ? `El dueño pulsó Confirmar en la propuesta ${input.accionId} (desde el panel) pero no se pudo ejecutar: ${r.nota ?? r.mensaje}`
        : eraAviso
          ? `El dueño ha decidido no avisar al cliente por WhatsApp (propuesta ${input.accionId}); si acaso, le llama él. No hay nada más que hacer.`
          : `El dueño pulsó Cancelar en la propuesta ${input.accionId} (desde el panel): no se hizo nada.`
  );

  const mensaje =
    r.estado === "rechazada"
      ? eraAviso
        ? mensajes.avisoAlClienteDescartado()
        : mensajes.accionRechazada()
      : r.mensaje;

  // Sin pregunta pendiente ni «no le aviso», el Gestor sigue (onboarding) y
  // puede proponer el paso siguiente.
  let seguimiento: string | null = null;
  if (!propuesta && !(r.estado === "rechazada" && eraAviso)) {
    const turno = await turnoDeSeguimiento(business, r.estado);
    seguimiento = turno.texto;
    if (turno.conPropuesta) {
      propuesta = await propuestaPendiente(business.id);
    }
  }
  return { ok: true, estado: r.estado, mensaje, propuesta, seguimiento };
}

async function proponerSiguiente(
  business: { id: string; timezone: string },
  siguiente: PropuestaSiguiente
): Promise<PropuestaDelPanel | null> {
  try {
    const registrada = await registrarPropuesta({
      businessId: business.id,
      timezone: business.timezone,
      conversationId: null,
      inboundMessageId: `panel:${randomUUID()}`,
      tipo: siguiente.tipo,
      parametros: siguiente.parametros,
      resumen: siguiente.resumen,
    });
    if (!registrada.ok) {
      console.warn(
        `[Gestor] Panel del negocio ${business.id}: no se pudo proponer ${siguiente.tipo}: ${registrada.motivo}`
      );
      return null;
    }
    return {
      id: registrada.accionId,
      resumen: siguiente.pregunta,
      expiresAt: registrada.expiresAt.toISOString(),
      botones: siguiente.botones,
    };
  } catch (error) {
    console.error(
      `[Gestor] Panel del negocio ${business.id}: falló la pregunta de ${siguiente.tipo}: ${errorMessage(error)}`
    );
    return null;
  }
}

async function turnoDeSeguimiento(
  business: Parameters<typeof turnoDelGestor>[0]["business"] & {
    ownerWhatsappNumber: string | null;
  },
  resultado: "ejecutada" | "fallida" | "rechazada"
): Promise<{ texto: string | null; conPropuesta: boolean }> {
  try {
    const turno = await turnoDelGestor({
      business,
      ownerPhone: business.ownerWhatsappNumber ?? "panel",
      texto: TEXTO_DE_SEGUIMIENTO[resultado],
      inboundMessageId: `panel:${randomUUID()}`,
      etiqueta: `${business.id}/panel:seguimiento`,
    });
    if (turno.estado !== "ok" || !turno.respuesta) {
      return { texto: null, conPropuesta: false };
    }
    const texto = turno.respuesta.trim();
    return {
      texto: esRespuestaVacia(texto) && !turno.accionId ? null : texto,
      conPropuesta: turno.accionId !== null,
    };
  } catch (error) {
    console.error(
      `[Gestor] Panel del negocio ${business.id}: el turno de seguimiento falló: ${errorMessage(error)}`
    );
    return { texto: null, conPropuesta: false };
  }
}
