import type { InboundMessage } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { getRedis } from "../../lib/redis.js";
import { errorMessage } from "../../lib/logUtils.js";
import { acquireLock, releaseLock } from "../../lib/bookingLock.js";
import { ESTADOS_DE_SUSCRIPCION_BLOQUEADOS } from "../../lib/planFeatures.js";
import { telnyxAiAdapter } from "../../adapters/telnyx/TelnyxAiAdapter.js";
import { BusinessScheduleSchema } from "../../lib/businessSchedule.js";
import {
  BUSINESS_TYPE_LABELS,
  isBusinessType,
} from "../../lib/businessType.js";
import {
  claveDePropuesta,
  claveDelTurno,
  TTL_TURNO_SEGUNDOS,
} from "../gestor/tools.js";
import { activo, nombreParaWhatsapp } from "./altaDueno.js";
import { formatearMomento } from "./chatCliente.js";
import {
  DIA_MS,
  responder,
  resultado,
  type ResultadoEnrutado,
} from "./respuestas.js";
import * as mensajes from "./mensajes.js";

/**
 * El Gestor por chat (PLAN-CANAL-DUENO.md § 8, fase 2 / PR 2): el texto
 * libre del dueño en el número de negocios va, por `ai.assistants.chat`, al
 * assistant ÚNICO de plataforma (`TELNYX_GESTOR_ASSISTANT_ID`). La
 * conversación de Telnyx la crea Alhabla con `metadata { business_id, role:
 * "owner", … }` y Telnyx templa esas claves en las cabeceras de las tools
 * del Gestor (X-Alhabla-Business / X-Alhabla-Role): el negocio lo fija el
 * backend, nunca el LLM. El contexto inicial va en el `system_prompt` de la
 * conversación; el detalle, por la tool `contexto_negocio`.
 *
 * Igual que la recepcionista por chat (chatCliente.ts): marcador con la
 * fecha y hora en la zona del negocio delante de cada mensaje (en chat la
 * hora del sistema llega en UTC), 60 turnos por negocio y día, un turno a la
 * vez por hilo, conversación reutilizada 30 días (`Business.ownerConversationId`)
 * y rotada con BAJA, timeout, sin etiqueta «Beta» (decisión del usuario).
 * Si el LLM llamó a `proponer_accion` en el turno, la respuesta sale con los
 * botones «Confirmar» · «Cancelar» (`accion:<id>:confirmar|cancelar`).
 * Nunca lanza: si no puede atender devuelve `atendido: false`.
 */

export const TURNOS_POR_DUENO_Y_DIA = 60;
export const ROTACION_CONVERSACION_DUENO_MS = 30 * DIA_MS;
export const TIMEOUT_TURNO_DUENO_MS = 30_000;
const LOCK_TTL_MS = 60_000;
/** Límite de Meta para el cuerpo de un mensaje interactivo, con margen. */
const MAX_CUERPO_INTERACTIVO = 1000;
const LOCK_ESPERA_MS = 25_000;

export function chatDelDuenoActivo(): boolean {
  return process.env.TELNYX_OWNER_CHAT_ENABLED === "true";
}

export function gestorAssistantId(): string | null {
  const id = process.env.TELNYX_GESTOR_ASSISTANT_ID?.trim();
  return id ? id : null;
}

export type ResultadoDelChatDueno =
  | { atendido: false; motivo: MotivoNoAtendidoDueno }
  | { atendido: true; resultado: ResultadoEnrutado };

export type MotivoNoAtendidoDueno =
  | "apagado"
  | "sin_gestor"
  | "apagado_negocio"
  | "negocio_inactivo"
  | "dueno_no_activo"
  | "sin_texto";

const SELECT_NEGOCIO_DEL_CHAT_DUENO = {
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

type NegocioDelChatDueno = {
  id: string;
  name: string;
  businessType: string | null;
  timezone: string;
  active: boolean;
  ownerChatEnabled: boolean;
  ownerWhatsappNumber: string | null;
  ownerWhatsappOptInAt: Date | null;
  ownerWhatsappOptOutAt: Date | null;
  ownerWhatsappUnreachableAt: Date | null;
  ownerConversationId: string | null;
  ownerConversationCreatedAt: Date | null;
  subscriptionStatus: string | null;
};

/** Marcador delante de cada mensaje del dueño: solo el momento actual (el
 * negocio y el móvil ya los fija el sistema). */
export function marcadorDelGestor(input: {
  timezone: string;
  ahora?: Date;
}): string {
  return `[WhatsApp · ${formatearMomento(input.ahora ?? new Date(), input.timezone)}]`;
}

/** `system_prompt` de la conversación: lo estable del negocio. El detalle
 * cambia y va por `contexto_negocio`. */
export function systemPromptDelGestor(business: {
  name: string;
  businessType: string | null;
  timezone: string;
}): string {
  const sector = isBusinessType(business.businessType)
    ? BUSINESS_TYPE_LABELS[business.businessType]
    : "negocio";
  return [
    `Negocio de esta conversación: ${nombreParaWhatsapp(business)} (${sector.toLowerCase()}), zona horaria ${business.timezone || "Europe/Madrid"}.`,
    "Hablas con su dueño o dueña por WhatsApp. El sistema ya ha comprobado quién es: no pidas que se identifique.",
    "Para servicios, profesionales, horario, calendario, plan, citas pendientes y recados, usa contexto_negocio.",
  ].join(" ");
}

function claveDelDia(businessId: string, timezone: string): string {
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return `whatsapp:chat:dueno:${businessId}:${dia}`;
}

async function turnosDeHoy(
  businessId: string,
  timezone: string
): Promise<number> {
  try {
    const clave = claveDelDia(businessId, timezone);
    const turnos = await getRedis().incr(clave);
    if (turnos === 1) {
      await getRedis().expire(clave, 2 * 24 * 60 * 60);
    }
    return turnos;
  } catch (error) {
    console.error(
      `[WhatsApp] Chat dueño ${businessId}: no se pudo contar el turno del día; se atiende: ${errorMessage(error)}`
    );
    return 1;
  }
}

/**
 * Conversación vigente del dueño con el Gestor: la guardada si tiene menos
 * de 30 días; si no, una nueva en Telnyx con los metadata del negocio y el
 * `system_prompt`. Devuelve null si Telnyx no la pudo crear.
 */
export async function conversacionDelDueno(input: {
  business: Pick<
    NegocioDelChatDueno,
    | "id"
    | "name"
    | "businessType"
    | "timezone"
    | "ownerConversationId"
    | "ownerConversationCreatedAt"
  >;
  ownerPhone: string;
  forzarNueva?: boolean;
}): Promise<{ conversationId: string; nueva: boolean } | null> {
  const { business } = input;
  if (
    !input.forzarNueva &&
    business.ownerConversationId &&
    business.ownerConversationCreatedAt &&
    business.ownerConversationCreatedAt.getTime() >
      Date.now() - ROTACION_CONVERSACION_DUENO_MS
  ) {
    return { conversationId: business.ownerConversationId, nueva: false };
  }

  let conversationId: string;
  try {
    const creada = await telnyxAiAdapter.createConversation({
      name: `whatsapp:gestor:${business.id}`,
      metadata: {
        business_id: business.id,
        role: "owner",
        channel: "whatsapp",
        owner_phone: input.ownerPhone,
      },
    });
    conversationId = creada.id;
    await telnyxAiAdapter.updateConversation(conversationId, {
      systemPrompt: systemPromptDelGestor(business),
    });
  } catch (error) {
    console.error(
      `[WhatsApp] Chat dueño ${business.id}: Telnyx no creó la conversación del Gestor: ${errorMessage(error)}`
    );
    return null;
  }

  await prisma.business.update({
    where: { id: business.id },
    data: {
      ownerConversationId: conversationId,
      ownerConversationCreatedAt: new Date(),
    },
  });
  console.log(
    `[WhatsApp] Chat dueño ${business.id}: conversación del Gestor ${conversationId}`
  );
  return { conversationId, nueva: true };
}

/** BAJA/STOP: la conversación del Gestor se cierra (rota con la siguiente). */
export async function cerrarConversacionDelDueno(
  ownerPhone: string
): Promise<void> {
  try {
    await prisma.business.updateMany({
      where: {
        ownerWhatsappNumber: ownerPhone,
        ownerConversationId: { not: null },
      },
      data: { ownerConversationId: null, ownerConversationCreatedAt: null },
    });
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo cerrar la conversación del Gestor de ${ownerPhone}: ${errorMessage(error)}`
    );
  }
}

function conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const plazo = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Telnyx no respondió al chat en ${ms} ms`)),
      ms
    );
  });
  return Promise.race([promesa, plazo]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function esConversacionInexistente(error: unknown): boolean {
  const status =
    typeof error === "object" && error !== null
      ? (error as { status?: unknown }).status
      : undefined;
  return status === 404;
}

async function anotarTurno(
  businessId: string,
  turno: { inboundMessageId: string; conversationId: string }
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(
      claveDelTurno(businessId),
      JSON.stringify(turno),
      "EX",
      TTL_TURNO_SEGUNDOS
    );
    await redis.del(claveDePropuesta(businessId));
  } catch (error) {
    console.error(
      `[WhatsApp] Chat dueño ${businessId}: no se pudo anotar el turno en curso (proponer_accion quedará sin botones): ${errorMessage(error)}`
    );
  }
}

/** Propuesta registrada por `proponer_accion` en este turno, si la hubo. */
async function propuestaDelTurno(businessId: string): Promise<string | null> {
  try {
    const redis = getRedis();
    const accionId = await redis.get(claveDePropuesta(businessId));
    await redis.del(claveDePropuesta(businessId));
    await redis.del(claveDelTurno(businessId));
    return accionId;
  } catch (error) {
    console.error(
      `[WhatsApp] Chat dueño ${businessId}: no se pudo leer la propuesta del turno: ${errorMessage(error)}`
    );
    return null;
  }
}

/**
 * Deja constancia en la conversación de Telnyx de lo que pasó fuera del
 * chat (el botón de una propuesta): así el siguiente turno del Gestor sabe
 * que la acción se hizo o se rechazó. Best-effort: nunca lanza.
 */
export async function anotarEnConversacionDelDueno(
  businessId: string,
  texto: string
): Promise<void> {
  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerConversationId: true },
    });
    if (!business?.ownerConversationId) return;
    await telnyxAiAdapter.addConversationMessage(business.ownerConversationId, {
      role: "system",
      content: texto,
    });
  } catch (error) {
    console.error(
      `[WhatsApp] Chat dueño ${businessId}: no se pudo anotar en la conversación del Gestor («${texto.slice(0, 60)}»): ${errorMessage(error)}`
    );
  }
}

/**
 * Tras el alta: si el Gestor está encendido y a la recepcionista le falta
 * algo (servicios, equipo u horario), la bienvenida ofrece dejarla lista
 * por chat (PLAN-CANAL-DUENO.md § 8, onboarding). Best-effort: en duda, no.
 */
export async function ofrecerPuestaEnMarcha(
  businessId: string
): Promise<boolean> {
  if (!chatDelDuenoActivo() || !gestorAssistantId()) return false;
  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        schedule: true,
        ownerChatEnabled: true,
        _count: {
          select: {
            services: { where: { active: true, deletedAt: null } },
            professionals: { where: { active: true, deletedAt: null } },
          },
        },
      },
    });
    if (!business || !business.ownerChatEnabled) return false;
    const sinHorario = !BusinessScheduleSchema.safeParse(business.schedule)
      .success;
    return (
      sinHorario ||
      business._count.services === 0 ||
      business._count.professionals === 0
    );
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo saber si al negocio ${businessId} le falta configuración: ${errorMessage(error)}`
    );
    return false;
  }
}

/**
 * Tras ejecutar (o rechazar) una propuesta, el Gestor no recibía turno: el
 * botón respondía «Hecho» y la puesta en marcha se paraba hasta que el dueño
 * escribiera otra vez. Este turno sintético le deja seguir (siguiente paso
 * del onboarding, o nada más si no toca). Best-effort: si el chat está
 * apagado o falla, el «Hecho» ya salió.
 */
/** Lo que recibe el Gestor en el turno sintético tras un botón; lo usan el
 * WhatsApp (`continuarTrasAccion`) y el panel. */
export const TEXTO_DE_SEGUIMIENTO: Record<
  "ejecutada" | "fallida" | "rechazada",
  string
> = {
  ejecutada:
    "(El dueño ha pulsado Confirmar y la acción ya está hecha; ya se le ha dicho «hecho». Si estabas guiando la puesta en marcha, sigue con el siguiente paso que falte, sin repetir lo hecho. Si no falta nada ni había más pasos, responde solo «Listo.»)",
  rechazada:
    "(El dueño ha pulsado Cancelar: no se ha hecho nada y ya se le ha dicho. Pregunta brevemente qué quiere cambiar, sin volver a proponer lo mismo.)",
  fallida:
    "(La acción confirmada no se ha podido hacer y ya se le ha dicho al dueño. Sugiere el panel o que lo vuelva a pedir más tarde, en una frase.)",
};

/** Respuesta del turno de seguimiento que significa «nada que añadir». */
export function esRespuestaVacia(texto: string): boolean {
  return /^listo\.?$/i.test(texto.trim());
}

export async function continuarTrasAccion(input: {
  message: InboundMessage;
  businessId: string;
  resultado: "ejecutada" | "fallida" | "rechazada";
}): Promise<void> {
  if (!chatDelDuenoActivo() || !gestorAssistantId()) return;
  try {
    const r = await conversarConGestor({
      message: input.message,
      businessId: input.businessId,
      texto: TEXTO_DE_SEGUIMIENTO[input.resultado],
      etiqueta: "chat:dueno:seguimiento",
    });
    if (!r.atendido) {
      console.log(
        `[WhatsApp] Chat dueño ${input.businessId}: sin turno de seguimiento tras la acción (${r.motivo})`
      );
    }
  } catch (error) {
    console.error(
      `[WhatsApp] Chat dueño ${input.businessId}: el turno de seguimiento tras la acción falló: ${errorMessage(error)}`
    );
  }
}

/** Los ids no cambian nunca (el enrutador decide por ellos); el título sí
 * puede («Sí, avísale» · «Le llamo yo» en las preguntas tras una acción). */
export function botonesDeAccion(
  accionId: string,
  titulos: { confirmar: string; cancelar: string } = {
    confirmar: "Confirmar",
    cancelar: "Cancelar",
  }
) {
  return [
    {
      id: `accion:${accionId}:confirmar`,
      title: titulos.confirmar.slice(0, 20),
    },
    { id: `accion:${accionId}:cancelar`, title: titulos.cancelar.slice(0, 20) },
  ];
}

/** Un turno del dueño con el Gestor. */
export async function conversarConGestor(input: {
  message: InboundMessage;
  businessId: string;
  texto: string;
  /** Sufijo del handler y del reclamo (por defecto `chat:dueno`). */
  etiqueta?: string;
}): Promise<ResultadoDelChatDueno> {
  const { message, businessId } = input;
  const from = message.fromNumber;
  const base = input.etiqueta ?? "chat:dueno";
  const texto = input.texto.trim();

  if (!chatDelDuenoActivo()) {
    return { atendido: false, motivo: "apagado" };
  }
  const assistantId = gestorAssistantId();
  if (!assistantId) {
    console.warn(
      "[WhatsApp] Chat dueño: TELNYX_OWNER_CHAT_ENABLED=true sin TELNYX_GESTOR_ASSISTANT_ID; respuesta fija"
    );
    return { atendido: false, motivo: "sin_gestor" };
  }
  if (!texto) {
    return { atendido: false, motivo: "sin_texto" };
  }

  const business = (await prisma.business.findUnique({
    where: { id: businessId },
    select: SELECT_NEGOCIO_DEL_CHAT_DUENO,
  })) as NegocioDelChatDueno | null;
  if (!business || !business.active) {
    return { atendido: false, motivo: "negocio_inactivo" };
  }
  if (
    business.subscriptionStatus &&
    ESTADOS_DE_SUSCRIPCION_BLOQUEADOS.has(business.subscriptionStatus)
  ) {
    console.warn(
      `[WhatsApp] Chat dueño ${business.id}/${from}: el negocio no puede chatear (suscripción ${business.subscriptionStatus})`
    );
    return { atendido: false, motivo: "negocio_inactivo" };
  }
  if (!business.ownerChatEnabled) {
    return { atendido: false, motivo: "apagado_negocio" };
  }
  // Solo el móvil dado de alta y con el consentimiento vigente habla con el
  // Gestor: un dueño en STOP o sin activar recibe la respuesta fija.
  if (business.ownerWhatsappNumber !== from || !activo(business)) {
    return { atendido: false, motivo: "dueno_no_activo" };
  }

  const negocio = nombreParaWhatsapp(business);
  const opciones = { businessId: business.id };

  const turno = await turnoDelGestor({
    business,
    ownerPhone: from,
    texto,
    inboundMessageId: message.id,
    contactName: message.contactName,
    etiqueta: `${business.id}/${from}`,
  });
  if (turno.estado === "limite") {
    return {
      atendido: true,
      resultado: resultado(
        `${base}:limite`,
        await responder(
          message,
          "chat-dueno-limite",
          mensajes.limiteDiarioDelGestor({ panelUrl: mensajes.panelUrl("/") }),
          { ...opciones, unaVezAlDia: true }
        )
      ),
    };
  }
  if (turno.estado === "ocupado") {
    console.warn(
      `[WhatsApp] Chat dueño ${business.id}/${from}: hilo ocupado ${LOCK_ESPERA_MS} ms; el entrante ${message.id} no se atiende`
    );
    return { atendido: true, resultado: { handler: `${base}:ocupado` } };
  }
  const { respuesta, motivoDeFallo, accionId } = turno;
  if (respuesta === null || respuesta.trim() === "") {
    console.error(
      `[WhatsApp] Chat dueño ${business.id}/${from}: sin respuesta del Gestor${motivoDeFallo ? ` (${motivoDeFallo})` : ""}; se responde que no está disponible`
    );
    return {
      atendido: true,
      resultado: resultado(
        `${base}:error`,
        await responder(
          message,
          "chat-dueno-no-disponible",
          mensajes.gestorNoDisponible({
            negocio,
            panelUrl: mensajes.panelUrl("/"),
          }),
          { ...opciones, unaVezAlDia: true }
        )
      ),
    };
  }
  const textoRespuesta = respuesta.trim();
  if (!accionId && esRespuestaVacia(textoRespuesta)) {
    // El turno de seguimiento no tenía nada que añadir.
    return { atendido: true, resultado: { handler: `${base}:nada` } };
  }
  if (accionId && textoRespuesta.length > MAX_CUERPO_INTERACTIVO) {
    // Meta limita el cuerpo de un interactivo a 1024 caracteres: una lista
    // larga de servicios no cabe con los botones. Va el texto entero y,
    // aparte, los botones con el resumen de la propuesta.
    const propuesta = await prisma.ownerPendingAction.findUnique({
      where: { id: accionId },
      select: { resumen: true },
    });
    await responder(message, "chat-dueno", textoRespuesta, opciones);
    const conBotones = await responder(
      message,
      "chat-dueno-botones",
      `¿Confirmas? ${propuesta?.resumen ?? ""}`.trim(),
      { ...opciones, botones: botonesDeAccion(accionId) }
    );
    return {
      atendido: true,
      resultado: resultado(`${base}:propuesta`, conBotones),
    };
  }
  const enviada = await responder(
    message,
    base === "chat:dueno" ? "chat-dueno" : "chat-dueno-seguimiento",
    textoRespuesta,
    {
      ...opciones,
      botones: accionId ? botonesDeAccion(accionId) : undefined,
    }
  );
  return {
    atendido: true,
    resultado: resultado(accionId ? `${base}:propuesta` : base, enviada),
  };
}

export type ResultadoDelTurno =
  | { estado: "limite" }
  | { estado: "ocupado" }
  | {
      estado: "ok";
      respuesta: string | null;
      motivoDeFallo: string | null;
      /** Propuesta registrada por `proponer_accion` en este turno. */
      accionId: string | null;
      turnos: number;
    };

/**
 * Un turno con el Gestor, sin canal: cuenta el turno del día, toma el lock
 * del hilo, asegura la conversación de Telnyx, manda el texto con el
 * marcador y recoge la propuesta del turno. Lo usan el WhatsApp del dueño
 * (`conversarConGestor`) y el chat del panel (modules/gestor/panel.ts).
 * `inboundMessageId` es el entrante de WhatsApp o un id sintético
 * `panel:<uuid>`: `proponer_accion` lo guarda en la propuesta.
 */
export async function turnoDelGestor(input: {
  business: Pick<
    NegocioDelChatDueno,
    | "id"
    | "name"
    | "businessType"
    | "timezone"
    | "ownerConversationId"
    | "ownerConversationCreatedAt"
  >;
  ownerPhone: string;
  texto: string;
  inboundMessageId: string;
  contactName?: string | null;
  /** Para los logs («<negocio>/<móvil>» o «<negocio>/panel»). */
  etiqueta: string;
}): Promise<ResultadoDelTurno> {
  const { business, etiqueta } = input;
  const assistantId = gestorAssistantId();
  if (!assistantId) {
    return {
      estado: "ok",
      respuesta: null,
      motivoDeFallo: "sin TELNYX_GESTOR_ASSISTANT_ID",
      accionId: null,
      turnos: 0,
    };
  }
  const texto = input.texto.trim();
  const turnos = await turnosDeHoy(business.id, business.timezone);
  if (turnos > TURNOS_POR_DUENO_Y_DIA) {
    console.warn(
      `[WhatsApp] Chat dueño ${etiqueta}: ${turnos} turnos hoy, límite ${TURNOS_POR_DUENO_Y_DIA}`
    );
    return { estado: "limite" };
  }

  const lockKey = `lock:whatsapp:chat:dueno:${business.id}`;
  const lockToken = await acquireLock(lockKey, LOCK_TTL_MS, LOCK_ESPERA_MS);
  if (!lockToken) {
    return { estado: "ocupado" };
  }

  try {
    let respuesta: string | null = null;
    let motivoDeFallo: string | null = null;
    let conversacion = await conversacionDelDueno({
      business,
      ownerPhone: input.ownerPhone,
    });
    for (let intento = 0; conversacion && intento < 2; intento++) {
      await anotarTurno(business.id, {
        inboundMessageId: input.inboundMessageId,
        conversationId: conversacion.conversationId,
      });
      const content = `${marcadorDelGestor({ timezone: business.timezone })} ${texto}`;
      const t0 = Date.now();
      try {
        respuesta = await conTimeout(
          telnyxAiAdapter.chatWithAssistant(assistantId, {
            content,
            conversationId: conversacion.conversationId,
            name: input.contactName ?? undefined,
          }),
          TIMEOUT_TURNO_DUENO_MS
        );
        console.log(
          `[WhatsApp] Chat dueño ${etiqueta}: turno ${turnos} en ${Date.now() - t0} ms (conversación ${conversacion.conversationId})`
        );
        break;
      } catch (error) {
        motivoDeFallo = errorMessage(error);
        if (
          intento === 0 &&
          !conversacion.nueva &&
          esConversacionInexistente(error)
        ) {
          console.warn(
            `[WhatsApp] Chat dueño ${etiqueta}: la conversación ${conversacion.conversationId} ya no existe en Telnyx; se abre otra`
          );
          conversacion = await conversacionDelDueno({
            business,
            ownerPhone: input.ownerPhone,
            forzarNueva: true,
          });
          continue;
        }
        break;
      }
    }
    const accionId = await propuestaDelTurno(business.id);
    return { estado: "ok", respuesta, motivoDeFallo, accionId, turnos };
  } finally {
    await releaseLock(lockKey, lockToken);
  }
}
