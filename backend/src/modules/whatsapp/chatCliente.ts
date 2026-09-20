import { randomUUID } from "node:crypto";
import type { InboundMessage } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { getRedis } from "../../lib/redis.js";
import { errorMessage } from "../../lib/logUtils.js";
import { acquireLock, releaseLock } from "../../lib/bookingLock.js";
import { ESTADOS_DE_SUSCRIPCION_BLOQUEADOS } from "../../lib/planFeatures.js";
import { telnyxAiAdapter } from "../../adapters/telnyx/TelnyxAiAdapter.js";
import { nombreParaCliente, telefonoDeContacto } from "./mensajesCliente.js";
import {
  DIA_MS,
  responder,
  resultado,
  type ResultadoEnrutado,
} from "./respuestas.js";
import * as mensajes from "./mensajes.js";

/**
 * La recepcionista por chat (PLAN-CANAL-DUENO.md § 7, fase 2 / PR 1): el
 * texto libre de un cliente en el número de clientes va, por
 * `ai.assistants.chat`, al MISMO assistant de Telnyx que atiende la llamada
 * de su negocio, con sus tools de siempre. No hay assistant de cliente.
 *
 * Cómo funcionan las tools en chat (verificado en dev el 2026-09-20 contra
 * la recepcionista de Peluquería Alhambra): la conversación de Telnyx se
 * crea con `metadata.call_control_id = "whatsapp:chat:<id>"` y Telnyx lo
 * templa en la cabecera `X-Alhabla-Call-Control-Id: {{call_control_id}}`
 * de las tools, igual que en una llamada; el backend resuelve esa Call
 * sintética (`voiceProvider: "whatsapp"`, `fromNumber` = móvil del
 * cliente) y todo (`get_catalog`, `find_my_appointment`, `book_appointment`,
 * `informar_al_negocio`…) funciona sin tocar ningún assistant.
 *
 * Lo que el LLM no ve en chat: `{{telnyx_end_user_target}}` no resuelve y
 * `{{telnyx_current_time}}` resuelve en UTC, así que el marcador que
 * antepone el backend a cada mensaje lleva el móvil del cliente y la fecha
 * y hora en la zona del negocio; el bloque «Chat por WhatsApp» del prompt
 * (managedAgentPrompt.ts) le dice que use eso.
 *
 * Reglas: interruptor global (TELNYX_CLIENT_CHAT_ENABLED) y por negocio
 * (`clientChatEnabled`); 20 turnos por cliente, negocio y día; un turno a
 * la vez por hilo (lock); coletilla Beta con el teléfono del negocio; nunca
 * lanza — si el chat no puede atender, devuelve `atendido: false` y el
 * enrutador responde lo de siempre.
 */

export const TURNOS_POR_CLIENTE_Y_DIA = 20;
export const ROTACION_CONVERSACION_MS = 30 * DIA_MS;
export const TIMEOUT_TURNO_MS = 30_000;
const LOCK_TTL_MS = 60_000;
const LOCK_ESPERA_MS = 25_000;

export function chatDeClientesActivo(): boolean {
  return process.env.TELNYX_CLIENT_CHAT_ENABLED === "true";
}

export function callIdDeChat(conversationId: string): string {
  return `whatsapp:chat:${conversationId}`;
}

export type ResultadoDelChat =
  | { atendido: false; motivo: MotivoNoAtendido }
  | { atendido: true; resultado: ResultadoEnrutado };

export type MotivoNoAtendido =
  | "apagado"
  | "apagado_negocio"
  | "negocio_inactivo"
  | "sin_recepcionista"
  | "sin_texto";

interface NegocioDelChat {
  id: string;
  name: string;
  phone: string;
  telnyxPhoneNumber: string | null;
  timezone: string;
  active: boolean;
  clientChatEnabled: boolean;
  subscriptionStatus: string | null;
  agents: Array<{ id: string; telnyxAssistantId: string | null }>;
}

const SELECT_NEGOCIO_DEL_CHAT = {
  id: true,
  name: true,
  phone: true,
  telnyxPhoneNumber: true,
  timezone: true,
  active: true,
  clientChatEnabled: true,
  subscriptionStatus: true,
  agents: {
    where: { active: true, deletedAt: null, telnyxAssistantId: { not: null } },
    orderBy: { createdAt: "asc" as const },
    take: 1,
    select: { id: true, telnyxAssistantId: true },
  },
} as const;

/** Fecha y hora legibles en la zona del negocio, para el marcador. */
export function formatearMomento(fecha: Date, timezone: string): string {
  const zona = timezone || "Europe/Madrid";
  const texto = new Intl.DateTimeFormat("es-ES", {
    timeZone: zona,
    dateStyle: "full",
    timeStyle: "short",
  }).format(fecha);
  return `${texto} (${zona})`;
}

/**
 * Marcador que ve el LLM delante de cada mensaje del cliente: canal, móvil
 * y momento actual en la zona del negocio.
 */
export function marcadorDeChat(input: {
  clientPhone: string;
  timezone: string;
  ahora?: Date;
}): string {
  return `[WhatsApp · ${input.clientPhone} · ${formatearMomento(input.ahora ?? new Date(), input.timezone)}]`;
}

/** Coletilla Beta de cada respuesta de texto libre (§ 7). */
export function coletillaBeta(negocio: {
  name: string;
  phone: string;
  telnyxPhoneNumber: string | null;
}): string {
  const nombre = nombreParaCliente(negocio);
  const telefono = telefonoDeContacto(negocio);
  return telefono
    ? `_Beta · si prefieres, llama a ${nombre}: ${telefono}_`
    : `_Beta · si prefieres, llama a ${nombre}_`;
}

function claveDelDia(
  businessId: string,
  from: string,
  timezone: string
): string {
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return `whatsapp:chat:cliente:${businessId}:${from}:${dia}`;
}

/**
 * Turnos de hoy (en la zona del negocio) de este cliente con este negocio,
 * contando el actual. Si Redis falla se deja pasar: el techo de 20
 * respuestas por hora de `responder` sigue vigente.
 */
async function turnosDeHoy(
  businessId: string,
  from: string,
  timezone: string
): Promise<number> {
  try {
    const clave = claveDelDia(businessId, from, timezone);
    const turnos = await getRedis().incr(clave);
    if (turnos === 1) {
      await getRedis().expire(clave, 2 * 24 * 60 * 60);
    }
    return turnos;
  } catch (error) {
    console.error(
      `[WhatsApp] Chat cliente ${businessId}/${from}: no se pudo contar el turno del día; se atiende: ${errorMessage(error)}`
    );
    return 1;
  }
}

/**
 * Conversación vigente del cliente con el negocio: la guardada si tiene
 * menos de 30 días; si no, una nueva en Telnyx (con `call_control_id` en
 * los metadata) y su Call sintética, en una transacción. Devuelve null si
 * Telnyx no la pudo crear.
 */
export async function conversacionVigente(input: {
  business: Pick<NegocioDelChat, "id" | "name" | "timezone">;
  agentId: string;
  clientPhone: string;
  forzarNueva?: boolean;
}): Promise<{ conversationId: string; callId: string; nueva: boolean } | null> {
  const { business, clientPhone } = input;
  const guardada = input.forzarNueva
    ? null
    : await prisma.clientConversation.findUnique({
        where: {
          businessId_clientPhone: { businessId: business.id, clientPhone },
        },
        select: { conversationId: true, callId: true, startedAt: true },
      });
  if (
    guardada &&
    guardada.startedAt.getTime() > Date.now() - ROTACION_CONVERSACION_MS
  ) {
    return {
      conversationId: guardada.conversationId,
      callId: guardada.callId,
      nueva: false,
    };
  }

  // El id de la Call sintética tiene que existir antes de crear la
  // conversación (va en sus metadata), así que se genera aquí.
  const semilla = randomUUID();
  const callId = callIdDeChat(semilla);
  let conversationId: string;
  try {
    const creada = await telnyxAiAdapter.createConversation({
      name: `whatsapp:cliente:${business.id}:${clientPhone}`,
      metadata: {
        business_id: business.id,
        client_phone: clientPhone,
        role: "client",
        channel: "whatsapp",
        call_control_id: callId,
      },
    });
    conversationId = creada.id;
  } catch (error) {
    console.error(
      `[WhatsApp] Chat cliente ${business.id}/${clientPhone}: Telnyx no creó la conversación: ${errorMessage(error)}`
    );
    return null;
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.call.create({
      data: {
        callId,
        voiceProvider: "whatsapp",
        providerCallId: callId,
        providerConversationId: conversationId,
        businessId: business.id,
        agentId: input.agentId,
        fromNumber: clientPhone,
        // Un chat no tiene principio ni fin como una llamada: se guarda
        // cerrada para que ni el barrido de llamadas zombi ni el panel la
        // traten como una llamada en curso.
        status: "COMPLETED",
        startedAt: now,
        endedAt: now,
      },
    });
    await tx.clientConversation.upsert({
      where: {
        businessId_clientPhone: { businessId: business.id, clientPhone },
      },
      create: {
        businessId: business.id,
        clientPhone,
        conversationId,
        callId,
        startedAt: now,
      },
      update: { conversationId, callId, startedAt: now, turns: 0 },
    });
  });
  console.log(
    `[WhatsApp] Chat cliente ${business.id}/${clientPhone}: conversación ${conversationId} (Call ${callId})`
  );
  return { conversationId, callId, nueva: true };
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

/**
 * Un turno del cliente con la recepcionista de su negocio. `texto` es lo
 * que ve el LLM tras el marcador (el mensaje del cliente, o el texto que
 * sintetiza un botón como «Cambiar»).
 */
export async function conversarConRecepcionista(input: {
  message: InboundMessage;
  businessId: string;
  texto: string;
  /** Sufijo del handler (por defecto `chat:cliente`). */
  etiqueta?: string;
}): Promise<ResultadoDelChat> {
  const { message, businessId } = input;
  const from = message.fromNumber;
  const base = input.etiqueta ?? "chat:cliente";
  const texto = input.texto.trim();

  if (!chatDeClientesActivo()) {
    return { atendido: false, motivo: "apagado" };
  }
  if (!texto) {
    return { atendido: false, motivo: "sin_texto" };
  }

  const business = (await prisma.business.findUnique({
    where: { id: businessId },
    select: SELECT_NEGOCIO_DEL_CHAT,
  })) as NegocioDelChat | null;
  if (!business || !business.active) {
    return { atendido: false, motivo: "negocio_inactivo" };
  }
  if (
    business.subscriptionStatus &&
    ESTADOS_DE_SUSCRIPCION_BLOQUEADOS.has(business.subscriptionStatus)
  ) {
    console.warn(
      `[WhatsApp] Chat cliente ${business.id}/${from}: el negocio no puede atender (suscripción ${business.subscriptionStatus})`
    );
    return { atendido: false, motivo: "negocio_inactivo" };
  }
  if (!business.clientChatEnabled) {
    return { atendido: false, motivo: "apagado_negocio" };
  }
  const agent = business.agents[0];
  if (!agent?.telnyxAssistantId) {
    console.warn(
      `[WhatsApp] Chat cliente ${business.id}/${from}: el negocio no tiene recepcionista en Telnyx; respuesta fija`
    );
    return { atendido: false, motivo: "sin_recepcionista" };
  }

  const negocio = nombreParaCliente(business);
  const telefono = telefonoDeContacto(business);
  const opciones = { businessId: business.id };

  const turnos = await turnosDeHoy(business.id, from, business.timezone);
  if (turnos > TURNOS_POR_CLIENTE_Y_DIA) {
    console.warn(
      `[WhatsApp] Chat cliente ${business.id}/${from}: ${turnos} turnos hoy, límite ${TURNOS_POR_CLIENTE_Y_DIA}`
    );
    return {
      atendido: true,
      resultado: resultado(
        `${base}:limite`,
        await responder(
          message,
          "chat-limite",
          mensajes.limiteDiarioDelChat({ negocio, telefono }),
          { ...opciones, unaVezAlDia: true }
        )
      ),
    };
  }

  // Un turno a la vez por hilo: dos mensajes seguidos del cliente se
  // atienden en orden, no entrelazados en la misma conversación.
  const lockKey = `lock:whatsapp:chat:${business.id}:${from}`;
  const lockToken = await acquireLock(lockKey, LOCK_TTL_MS, LOCK_ESPERA_MS);
  if (!lockToken) {
    console.warn(
      `[WhatsApp] Chat cliente ${business.id}/${from}: hilo ocupado ${LOCK_ESPERA_MS} ms; el entrante ${message.id} no se atiende`
    );
    return { atendido: true, resultado: { handler: `${base}:ocupado` } };
  }

  try {
    let respuesta: string | null = null;
    let motivoDeFallo: string | null = null;
    let conversacion = await conversacionVigente({
      business,
      agentId: agent.id,
      clientPhone: from,
    });
    for (let intento = 0; conversacion && intento < 2; intento++) {
      const content = `${marcadorDeChat({ clientPhone: from, timezone: business.timezone })} ${texto}`;
      const t0 = Date.now();
      try {
        respuesta = await conTimeout(
          telnyxAiAdapter.chatWithAssistant(agent.telnyxAssistantId, {
            content,
            conversationId: conversacion.conversationId,
            name: message.contactName ?? undefined,
          }),
          TIMEOUT_TURNO_MS
        );
        console.log(
          `[WhatsApp] Chat cliente ${business.id}/${from}: turno ${turnos} en ${Date.now() - t0} ms (conversación ${conversacion.conversationId})`
        );
        break;
      } catch (error) {
        motivoDeFallo = errorMessage(error);
        if (
          intento === 0 &&
          !conversacion.nueva &&
          esConversacionInexistente(error)
        ) {
          // Telnyx ya no tiene el hilo (retención): se abre otro y se
          // repite el turno una sola vez.
          console.warn(
            `[WhatsApp] Chat cliente ${business.id}/${from}: la conversación ${conversacion.conversationId} ya no existe en Telnyx; se abre otra`
          );
          conversacion = await conversacionVigente({
            business,
            agentId: agent.id,
            clientPhone: from,
            forzarNueva: true,
          });
          continue;
        }
        break;
      }
    }

    if (respuesta === null || respuesta.trim() === "") {
      console.error(
        `[WhatsApp] Chat cliente ${business.id}/${from}: sin respuesta de la recepcionista${motivoDeFallo ? ` (${motivoDeFallo})` : ""}; se responde que no está disponible`
      );
      return {
        atendido: true,
        resultado: resultado(
          `${base}:error`,
          await responder(
            message,
            "chat-no-disponible",
            mensajes.chatNoDisponible({ negocio, telefono }),
            { ...opciones, unaVezAlDia: true }
          )
        ),
      };
    }

    const enviada = await responder(
      message,
      "chat",
      `${respuesta.trim()}\n\n${coletillaBeta(business)}`,
      opciones
    );
    if (conversacion) {
      const now = new Date();
      await prisma.clientConversation
        .update({
          where: { conversationId: conversacion.conversationId },
          data: {
            lastInboundAt: message.receivedAt ?? now,
            lastOutboundAt: enviada.error ? undefined : now,
            turns: { increment: 1 },
          },
        })
        .catch((error: unknown) => {
          console.error(
            `[WhatsApp] Chat cliente ${business.id}/${from}: no se pudo anotar el turno: ${errorMessage(error)}`
          );
        });
    }
    return { atendido: true, resultado: resultado(base, enviada) };
  } finally {
    await releaseLock(lockKey, lockToken);
  }
}
