import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { WhatsappAudience } from "../../adapters/whatsapp/WhatsAppAdapter.js";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import { isUniqueConstraintError } from "../../lib/prismaErrors.js";
import {
  actualizarEstadoEnvio,
  audienciaDelNumero,
  type EstadoEntrega,
} from "./service.js";
import { enrutarEntrante } from "./router.js";

/**
 * Webhooks de WhatsApp que llegan a `/webhooks/telnyx` (PLAN-CANAL-DUENO.md
 * § 6 y § Resultados de la fase 0.1):
 *
 * - `whatsapp.messages` — del webhook del WABA, en formato Meta: trae
 *   `messages[]` (lo que escribe la gente) y/o `statuses[]` (entrega de lo
 *   que envía Alhabla). Solo llega si `webhook_events` del WABA incluye
 *   `messages`; sin eso se pierden en silencio.
 * - `message.sent` / `message.finalized` / `message.read` — los eventos
 *   clásicos de Telnyx para cada envío (con `errors[]` y `cost`).
 * - `whatsapp.template.*` — cambios de estado de plantilla en Meta.
 *
 * La firma Ed25519 y la idempotencia por id de evento las hace la ruta; aquí
 * solo se interpreta el payload. Los mensajes entrantes se guardan SIEMPRE
 * (`InboundMessage`, idempotente por `messages[].id`) antes de enrutarse.
 */

const MetaTextSchema = z.object({ body: z.string() });

const InboundMessageSchema = z
  .object({
    id: z.string(),
    foreign_id: z.string().optional(),
    from: z.string(),
    timestamp: z.string().optional(),
    type: z.string(),
    text: MetaTextSchema.optional(),
    interactive: z
      .object({
        type: z.string().optional(),
        button_reply: z
          .object({ id: z.string(), title: z.string().optional() })
          .optional(),
        list_reply: z
          .object({
            id: z.string(),
            title: z.string().optional(),
            description: z.string().optional(),
          })
          .optional(),
      })
      .passthrough()
      .optional(),
    // Botón de respuesta rápida de una PLANTILLA (formato de Meta; no
    // capturado todavía en la fase 0, solo interactivos).
    button: z
      .object({ payload: z.string().optional(), text: z.string().optional() })
      .optional(),
    context: z
      .object({ from: z.string().optional(), id: z.string().optional() })
      .optional(),
  })
  .passthrough();

const StatusSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    timestamp: z.string().optional(),
    recipient_id: z.string().optional(),
    biz_opaque_callback_data: z.string().optional(),
    errors: z
      .array(
        z
          .object({
            code: z.union([z.string(), z.number()]).optional(),
            title: z.string().optional(),
            message: z.string().optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

export const WhatsappMessagesEventSchema = z.object({
  data: z.object({
    id: z.string(),
    event_type: z.literal("whatsapp.messages"),
    occurred_at: z.string().optional(),
    payload: z
      .object({
        contacts: z
          .array(
            z.object({
              wa_id: z.string().optional(),
              profile: z.object({ name: z.string().optional() }).optional(),
            })
          )
          .optional(),
        messages: z.array(InboundMessageSchema).optional(),
        statuses: z.array(StatusSchema).optional(),
        metadata: z
          .object({
            display_phone_number: z.string().optional(),
            phone_number_id: z.string().optional(),
          })
          .optional(),
      })
      .passthrough(),
  }),
});

export const MessageStatusEventSchema = z.object({
  data: z.object({
    id: z.string(),
    event_type: z.enum(["message.sent", "message.finalized", "message.read"]),
    occurred_at: z.string().optional(),
    payload: z
      .object({
        id: z.string(),
        direction: z.string().optional(),
        from: z
          .object({ phone_number: z.string().optional() })
          .passthrough()
          .optional(),
        to: z
          .array(
            z
              .object({
                phone_number: z.string().optional(),
                status: z.string().optional(),
              })
              .passthrough()
          )
          .optional(),
        errors: z
          .array(
            z
              .object({
                code: z.union([z.string(), z.number()]).optional(),
                title: z.string().optional(),
                detail: z.string().optional(),
              })
              .passthrough()
          )
          .optional(),
        cost: z
          .object({
            amount: z.string().nullable().optional(),
            currency: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
        completed_at: z.string().nullable().optional(),
        sent_at: z.string().nullable().optional(),
      })
      .passthrough(),
  }),
});

export const TemplateStatusEventSchema = z.object({
  data: z.object({
    id: z.string(),
    event_type: z.string(),
    payload: z
      .object({
        template_id: z.string().optional(),
        template_name: z.string().optional(),
        language: z.string().optional(),
        status: z.string().optional(),
        reason: z.string().optional(),
        quality_rating: z.string().optional(),
      })
      .passthrough(),
  }),
});

export type EntranteKind =
  "text" | "button" | "keyword" | "audio" | "media" | "other";
export type EntranteRole = "owner" | "client" | "unknown";

/** Palabras que se tratan como comando y nunca pasan por el LLM (§ 6). */
export const PALABRAS_CLAVE = [
  "STOP",
  "BAJA",
  "ALTA",
  "AYUDA",
  "MAL",
  "AGENDA",
  "HOY",
  "MANANA",
  "PAUSA",
] as const;

export type PalabraClave = (typeof PALABRAS_CLAVE)[number];

/** Normaliza una palabra clave: sin acentos, sin barra, en mayúsculas. */
export function palabraClaveDe(text: string): PalabraClave | null {
  const normalized = text
    .trim()
    .replace(/^\//, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return (PALABRAS_CLAVE as readonly string[]).includes(normalized)
    ? (normalized as PalabraClave)
    : null;
}

/** Meta manda `display_phone_number` y `context.from` sin el `+`. */
export function aE164(value: string): string {
  const digits = value.trim();
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export interface EntranteClasificado {
  providerMessageId: string;
  foreignId: string | null;
  fromNumber: string;
  toNumber: string;
  kind: EntranteKind;
  text: string | null;
  buttonId: string | null;
  buttonTitle: string | null;
  contextMessageId: string | null;
  contactName: string | null;
  receivedAt: Date;
  payload: Prisma.InputJsonValue;
}

type InboundMessagePayload = z.infer<typeof InboundMessageSchema>;

/** Clasifica un `messages[]` de Meta en lo que el enrutador entiende. */
export function clasificarEntrante(
  message: InboundMessagePayload,
  input: { toNumber: string; contactName: string | null; occurredAt?: string }
): EntranteClasificado {
  const receivedAt = message.timestamp
    ? new Date(Number(message.timestamp) * 1000)
    : input.occurredAt
      ? new Date(input.occurredAt)
      : new Date();

  let kind: EntranteKind = "other";
  let text: string | null = null;
  let buttonId: string | null = null;
  let buttonTitle: string | null = null;

  switch (message.type) {
    case "text": {
      text = message.text?.body ?? "";
      kind = palabraClaveDe(text) ? "keyword" : "text";
      break;
    }
    case "interactive": {
      const reply =
        message.interactive?.button_reply ?? message.interactive?.list_reply;
      if (reply) {
        kind = "button";
        buttonId = reply.id;
        buttonTitle = reply.title ?? null;
      }
      break;
    }
    case "button": {
      kind = "button";
      buttonId = message.button?.payload ?? message.button?.text ?? null;
      buttonTitle = message.button?.text ?? null;
      break;
    }
    case "audio":
      kind = "audio";
      break;
    case "image":
    case "video":
    case "document":
    case "sticker":
    case "location":
    case "contacts":
      kind = "media";
      break;
    default:
      kind = "other";
  }

  return {
    providerMessageId: message.id,
    foreignId: message.foreign_id ?? null,
    fromNumber: aE164(message.from),
    toNumber: input.toNumber,
    kind,
    text,
    buttonId,
    buttonTitle,
    contextMessageId: message.context?.id ?? null,
    contactName: input.contactName,
    receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
    payload: message as Prisma.InputJsonValue,
  };
}

/**
 * Quién escribe, según el número de Alhabla al que escribe y la BD (§ 6.3):
 * en el número de negocios, un dueño dado de alta; en el de clientes, un
 * teléfono con reservas. Cualquier otra cosa es `unknown`.
 */
export async function identificarRemitente(
  fromNumber: string,
  audience: WhatsappAudience | null
): Promise<{ role: EntranteRole; businessId: string | null }> {
  if (audience === "owner" || audience === null) {
    const business = await prisma.business.findFirst({
      where: { ownerWhatsappNumber: fromNumber, active: true },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
    });
    if (business) {
      return { role: "owner", businessId: business.id };
    }
  }
  if (audience === "client" || audience === null) {
    const booking = await prisma.booking.findFirst({
      where: { OR: [{ clientPhone: fromNumber }, { call: { fromNumber } }] },
      select: { call: { select: { businessId: true } } },
      orderBy: { programedAt: "desc" },
    });
    if (booking) {
      return { role: "client", businessId: booking.call.businessId };
    }
  }
  return { role: "unknown", businessId: null };
}

/** Evento `whatsapp.messages`: guarda cada entrante y actualiza entregas. */
export async function handleWhatsappMessages(
  payload: unknown
): Promise<{ success: boolean }> {
  const parsed = WhatsappMessagesEventSchema.safeParse(payload);
  if (!parsed.success) {
    console.error(
      `[WhatsApp] Evento whatsapp.messages con forma inesperada: ${parsed.error.message}`
    );
    return { success: false };
  }
  const { data } = parsed.data;
  const toNumber = data.payload.metadata?.display_phone_number
    ? aE164(data.payload.metadata.display_phone_number)
    : null;
  const audience = toNumber ? await audienciaDelNumero(toNumber) : null;

  for (const status of data.payload.statuses ?? []) {
    const mapped = mapEstadoMeta(status.status);
    if (!mapped) {
      console.warn(
        `[WhatsApp] Estado de entrega desconocido "${status.status}" para ${status.id}`
      );
      continue;
    }
    const firstError = status.errors?.[0];
    await actualizarEstadoEnvio({
      providerMessageId: status.id,
      status: mapped,
      at: status.timestamp
        ? new Date(Number(status.timestamp) * 1000)
        : new Date(),
      errorCode:
        firstError?.code !== undefined ? String(firstError.code) : null,
      errorDetail: firstError?.message ?? firstError?.title ?? null,
      callbackData: status.biz_opaque_callback_data ?? null,
      from: toNumber,
      to: status.recipient_id ? aE164(status.recipient_id) : null,
    });
  }

  const contactNames = new Map<string, string>();
  for (const contact of data.payload.contacts ?? []) {
    if (contact.wa_id && contact.profile?.name) {
      contactNames.set(aE164(contact.wa_id), contact.profile.name);
    }
  }

  for (const message of data.payload.messages ?? []) {
    if (!toNumber) {
      console.error(
        `[WhatsApp] Entrante ${message.id} de ${message.from} sin display_phone_number en metadata; se guarda sin audiencia`
      );
    }
    const entrante = clasificarEntrante(message, {
      toNumber: toNumber ?? "",
      contactName: contactNames.get(aE164(message.from)) ?? null,
      occurredAt: data.occurred_at,
    });
    const { role, businessId } = await identificarRemitente(
      entrante.fromNumber,
      audience
    );

    let row;
    try {
      row = await prisma.inboundMessage.create({
        data: {
          providerMessageId: entrante.providerMessageId,
          foreignId: entrante.foreignId,
          eventId: data.id,
          fromNumber: entrante.fromNumber,
          toNumber: entrante.toNumber,
          audience,
          role,
          businessId,
          kind: entrante.kind,
          text: entrante.text,
          buttonId: entrante.buttonId,
          buttonTitle: entrante.buttonTitle,
          contextMessageId: entrante.contextMessageId,
          contactName: entrante.contactName,
          payload: entrante.payload,
          receivedAt: entrante.receivedAt,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        console.log(
          `[WhatsApp] Entrante ${entrante.providerMessageId} ya guardado, se ignora el reintento`
        );
        continue;
      }
      throw error;
    }

    console.log(
      `[WhatsApp] Entrante ${entrante.kind} de ${role} ${entrante.fromNumber} al número de ${audience ?? "?"} (negocio ${businessId ?? "—"})`
    );

    try {
      const outcome = await enrutarEntrante(row);
      await prisma.inboundMessage.update({
        where: { id: row.id },
        data: { handledAt: new Date(), handler: outcome.handler },
      });
    } catch (error) {
      const message = errorMessage(error);
      console.error(
        `[WhatsApp] Error enrutando el entrante ${entrante.providerMessageId} (${entrante.kind}, ${role}, negocio ${businessId ?? "—"}): ${message}`
      );
      await prisma.inboundMessage
        .update({ where: { id: row.id }, data: { error: message } })
        .catch(() => undefined);
    }
  }

  return { success: true };
}

function mapEstadoMeta(status: string): EstadoEntrega | null {
  switch (status) {
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

/** Eventos clásicos `message.sent` / `message.finalized` / `message.read`. */
export async function handleMessageStatusEvent(
  payload: unknown
): Promise<{ success: boolean }> {
  const parsed = MessageStatusEventSchema.safeParse(payload);
  if (!parsed.success) {
    console.error(
      `[WhatsApp] Evento de estado de mensaje con forma inesperada: ${parsed.error.message}`
    );
    return { success: false };
  }
  const { data } = parsed.data;
  if (data.payload.direction && data.payload.direction !== "outbound") {
    return { success: true };
  }
  const recipient = data.payload.to?.[0];
  const rawStatus =
    recipient?.status ?? (data.event_type === "message.read" ? "read" : null);
  const status = mapEstadoTelnyx(rawStatus);
  if (!status) {
    console.warn(
      `[WhatsApp] Estado "${rawStatus}" no reconocido en ${data.event_type} para ${data.payload.id}`
    );
    return { success: true };
  }
  const firstError = data.payload.errors?.[0];
  await actualizarEstadoEnvio({
    providerMessageId: data.payload.id,
    status,
    at: data.occurred_at ? new Date(data.occurred_at) : new Date(),
    errorCode: firstError?.code !== undefined ? String(firstError.code) : null,
    errorDetail: firstError?.detail ?? firstError?.title ?? null,
    costAmount: data.payload.cost?.amount ?? null,
    costCurrency: data.payload.cost?.currency ?? null,
    from: data.payload.from?.phone_number ?? null,
    to: recipient?.phone_number ?? null,
  });
  return { success: true };
}

function mapEstadoTelnyx(
  status: string | null | undefined
): EstadoEntrega | null {
  switch (status) {
    case "queued":
    case "sending":
      return "queued";
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "delivery_failed":
    case "sending_failed":
    case "failed":
    case "expired":
      return "failed";
    default:
      return null;
  }
}

/**
 * `whatsapp.template.approved` / `.rejected` / `.disabled` / `.paused`… —
 * el estado nuevo va en `payload.status`; si falta, se deduce del nombre del
 * evento. Una plantilla que no está en la tabla se ignora con aviso (la
 * sincroniza el script).
 */
export async function handleTemplateStatusEvent(
  payload: unknown
): Promise<{ success: boolean }> {
  const parsed = TemplateStatusEventSchema.safeParse(payload);
  if (!parsed.success) {
    console.error(
      `[WhatsApp] Evento de plantilla con forma inesperada: ${parsed.error.message}`
    );
    return { success: false };
  }
  const { data } = parsed.data;
  const status = (
    data.payload.status ??
    data.event_type.split(".").pop() ??
    ""
  ).toUpperCase();
  if (!status) {
    return { success: true };
  }
  const where = data.payload.template_id
    ? { telnyxTemplateId: data.payload.template_id }
    : data.payload.template_name && data.payload.language
      ? {
          name_language: {
            name: data.payload.template_name,
            language: data.payload.language,
          },
        }
      : null;
  if (!where) {
    console.warn(
      `[WhatsApp] ${data.event_type} sin template_id ni nombre+idioma; se ignora`
    );
    return { success: true };
  }
  const updated = await prisma.whatsappTemplate.updateMany({
    where,
    data: {
      status,
      rejectionReason: data.payload.reason ?? undefined,
      qualityRating: data.payload.quality_rating ?? undefined,
      lastSyncedAt: new Date(),
    },
  });
  if (updated.count === 0) {
    console.warn(
      `[WhatsApp] ${data.event_type} para una plantilla que no está en WhatsappTemplate (${JSON.stringify(where)}); ejecuta scripts/manual/sincronizarWhatsapp.mts`
    );
  } else {
    console.log(
      `[WhatsApp] Plantilla ${data.payload.template_name ?? data.payload.template_id} → ${status}`
    );
  }
  return { success: true };
}
