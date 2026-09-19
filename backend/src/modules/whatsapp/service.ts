import { Prisma } from "@prisma/client";
import {
  whatsappAdapter,
  type WhatsappAudience,
  type WhatsAppButton,
  type WhatsAppContactCard,
  type WhatsAppSendResult,
} from "../../adapters/whatsapp/WhatsAppAdapter.js";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import { isUniqueConstraintError } from "../../lib/prismaErrors.js";

/**
 * Servicio de WhatsApp (PLAN-CANAL-DUENO.md § 1, § 9 y § SentMessage): decide
 * desde qué número de Alhabla sale cada mensaje, con qué plantilla, y deja
 * constancia del envío en `SentMessage` para que los webhooks de entrega y
 * las respuestas a botones (`context.id`) puedan correlacionarse.
 *
 * El adaptador solo habla con la API; aquí está la política.
 */

const SENDER_CACHE_TTL_MS = 60_000;

interface RemitenteResuelto {
  phoneNumber: string;
  /** De dónde salió: la tabla `WhatsappSender` o la variable de entorno. */
  source: "db" | "env";
}

let senderCache: {
  at: number;
  byAudience: Map<WhatsappAudience, string>;
} | null = null;

function isAudience(value: string): value is WhatsappAudience {
  return value === "client" || value === "owner";
}

async function cargarRemitentes(): Promise<Map<WhatsappAudience, string>> {
  const now = Date.now();
  if (senderCache && now - senderCache.at < SENDER_CACHE_TTL_MS) {
    return senderCache.byAudience;
  }
  const byAudience = new Map<WhatsappAudience, string>();
  try {
    const rows = await prisma.whatsappSender.findMany({
      where: { status: "CONNECTED" },
      select: { audience: true, phoneNumber: true },
    });
    for (const row of rows) {
      if (isAudience(row.audience)) {
        byAudience.set(row.audience, row.phoneNumber);
      }
    }
    senderCache = { at: now, byAudience };
  } catch (error) {
    // Sin BD se sigue con la variable de entorno: un fallo de lectura no
    // puede dejar a un cliente sin su confirmación.
    console.error(
      `[WhatsApp] No se pudieron leer los remitentes de WhatsappSender, se usa WHATSAPP_TELNYX_FROM_NUMBER: ${errorMessage(error)}`
    );
  }
  return byAudience;
}

/** Vacía la caché de remitentes (tests y script de sincronización). */
export function invalidarCacheRemitentes(): void {
  senderCache = null;
}

/**
 * Número de Alhabla para una audiencia. El de `owner` es también el respaldo
 * del de `client` (por si el número de clientes no está `CONNECTED`), y la
 * variable `WHATSAPP_TELNYX_FROM_NUMBER` es el respaldo de todo.
 */
export async function resolverRemitente(
  audience: WhatsappAudience
): Promise<RemitenteResuelto> {
  const byAudience = await cargarRemitentes();
  const fromDb = byAudience.get(audience) ?? byAudience.get("owner");
  if (fromDb) {
    return { phoneNumber: fromDb, source: "db" };
  }
  const fromEnv = process.env.WHATSAPP_TELNYX_FROM_NUMBER;
  if (!fromEnv) {
    throw new Error(
      `No hay remitente de WhatsApp para la audiencia "${audience}": WhatsappSender vacía y WHATSAPP_TELNYX_FROM_NUMBER sin configurar`
    );
  }
  return { phoneNumber: fromEnv, source: "env" };
}

/** Qué número de Alhabla es (cliente o negocio); null si no es ninguno. */
export async function audienciaDelNumero(
  phoneNumber: string
): Promise<WhatsappAudience | null> {
  const byAudience = await cargarRemitentes();
  for (const [audience, number] of byAudience) {
    if (number === phoneNumber) return audience;
  }
  // Sin tabla: el número de la variable de entorno es el de negocios.
  if (
    byAudience.size === 0 &&
    process.env.WHATSAPP_TELNYX_FROM_NUMBER === phoneNumber
  ) {
    return "owner";
  }
  return null;
}

export interface PlantillaResuelta {
  telnyxTemplateId: string;
  name: string;
  language: string;
}

/**
 * Plantilla aprobada para un uso (`key`) o por nombre + idioma. Devuelve null
 * si no está en la tabla o no está aprobada: el llamador decide si envía por
 * nombre (respaldo con las variables `WHATSAPP_TEMPLATE_*_NAME`) o no envía.
 */
export async function resolverPlantilla(
  ref: { key: string } | { name: string; language: string }
): Promise<PlantillaResuelta | null> {
  try {
    const row =
      "key" in ref
        ? await prisma.whatsappTemplate.findUnique({ where: { key: ref.key } })
        : await prisma.whatsappTemplate.findUnique({
            where: {
              name_language: { name: ref.name, language: ref.language },
            },
          });
    if (!row || row.status !== "APPROVED") {
      return null;
    }
    return {
      telnyxTemplateId: row.telnyxTemplateId,
      name: row.name,
      language: row.language,
    };
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo leer WhatsappTemplate (${JSON.stringify(ref)}), se envía por nombre: ${errorMessage(error)}`
    );
    return null;
  }
}

interface EnvioComun {
  audience: WhatsappAudience;
  to: string;
  businessId?: string;
  /** Clave del job (la fila de SentMessage ya existe, creada por `reclamarEnvio`). */
  idempotencyKey?: string;
  /** Vuelve en cada `statuses[]` de Meta; correlación adicional a `providerMessageId`. */
  callbackData?: string;
}

export type EnvioPlantilla = EnvioComun & {
  template:
    { key: string } | { name: string; language: string } | { id: string };
  bodyParams: Record<string, string>;
  buttonUrlParams?: Array<{ index: number; text: string }>;
};

export interface EnvioRegistrado extends WhatsAppSendResult {
  from: string;
}

async function registrarEnvio(input: {
  result: WhatsAppSendResult;
  from: string;
  to: string;
  audience: WhatsappAudience;
  kind: "template" | "text" | "interactive" | "contacts";
  businessId?: string;
  idempotencyKey?: string;
  callbackData?: string;
  templateName?: string;
  templateLanguage?: string;
}): Promise<void> {
  const data = {
    providerMessageId: input.result.messageId || null,
    businessId: input.businessId ?? null,
    audience: input.audience,
    fromNumber: input.from,
    toNumber: input.to,
    kind: input.kind,
    templateName: input.templateName ?? null,
    templateLanguage: input.templateLanguage ?? null,
    callbackData: input.callbackData ?? null,
    deliveryStatus: input.result.status ?? "queued",
  };
  try {
    if (input.idempotencyKey) {
      // La fila la creó `reclamarEnvio` antes de enviar; si por lo que sea no
      // existe (envío sin job), se crea con la misma clave.
      await prisma.sentMessage.upsert({
        where: {
          channel_idempotencyKey: {
            channel: "whatsapp",
            idempotencyKey: input.idempotencyKey,
          },
        },
        create: {
          channel: "whatsapp",
          idempotencyKey: input.idempotencyKey,
          ...data,
        },
        update: data,
      });
      return;
    }
    if (!input.result.messageId) {
      return;
    }
    await prisma.sentMessage.create({
      data: {
        channel: "whatsapp",
        idempotencyKey: `adhoc:${input.result.messageId}`,
        ...data,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return;
    }
    // Ya está enviado: no se puede fallar aquí. Pero sin la fila, el botón
    // que pulse el destinatario no se podrá correlacionar — que se vea.
    console.error(
      `[WhatsApp] Mensaje ${input.result.messageId} enviado a ${input.to} (${input.kind}, negocio ${input.businessId ?? "—"}) pero no se pudo registrar en SentMessage: ${errorMessage(error)}`
    );
  }
}

/**
 * Plantilla: por `template_id` siempre que la tabla la tenga aprobada; por
 * nombre + idioma solo como respaldo (funciona con `es`, no con `es_ES`).
 */
export async function enviarPlantilla(
  input: EnvioPlantilla
): Promise<EnvioRegistrado> {
  const { phoneNumber: from } = await resolverRemitente(input.audience);

  let templateId: string | undefined;
  let templateName: string | undefined;
  let language: string | undefined;
  if ("id" in input.template) {
    templateId = input.template.id;
  } else {
    const resolved = await resolverPlantilla(input.template);
    if (resolved) {
      templateId = resolved.telnyxTemplateId;
      templateName = resolved.name;
      language = resolved.language;
    } else if ("name" in input.template) {
      templateName = input.template.name;
      language = input.template.language;
    } else {
      throw new Error(
        `La plantilla de WhatsApp "${input.template.key}" no está en WhatsappTemplate o no está aprobada`
      );
    }
  }

  const result = await whatsappAdapter.sendTemplate({
    from,
    to: input.to,
    templateId,
    templateName: templateId ? undefined : templateName,
    languageCode: templateId ? undefined : language,
    bodyParams: input.bodyParams,
    buttonUrlParams: input.buttonUrlParams,
    callbackData: input.callbackData,
  });
  await registrarEnvio({
    result,
    from,
    to: input.to,
    audience: input.audience,
    kind: "template",
    businessId: input.businessId,
    idempotencyKey: input.idempotencyKey,
    callbackData: input.callbackData,
    templateName,
    templateLanguage: language,
  });
  return { ...result, from };
}

/** Texto libre (solo dentro de la ventana de 24 h). */
export async function enviarTexto(
  input: EnvioComun & { body: string; previewUrl?: boolean }
): Promise<EnvioRegistrado> {
  const { phoneNumber: from } = await resolverRemitente(input.audience);
  const result = await whatsappAdapter.sendText({
    from,
    to: input.to,
    body: input.body,
    previewUrl: input.previewUrl,
    callbackData: input.callbackData,
  });
  await registrarEnvio({
    result,
    from,
    to: input.to,
    audience: input.audience,
    kind: "text",
    businessId: input.businessId,
    idempotencyKey: input.idempotencyKey,
    callbackData: input.callbackData,
  });
  return { ...result, from };
}

/** Mensaje con botones de respuesta rápida (solo dentro de la ventana). */
export async function enviarBotones(
  input: EnvioComun & {
    body: string;
    buttons: WhatsAppButton[];
    header?: string;
    footer?: string;
  }
): Promise<EnvioRegistrado> {
  const { phoneNumber: from } = await resolverRemitente(input.audience);
  const result = await whatsappAdapter.sendInteractiveButtons({
    from,
    to: input.to,
    body: input.body,
    buttons: input.buttons,
    header: input.header,
    footer: input.footer,
    callbackData: input.callbackData,
  });
  await registrarEnvio({
    result,
    from,
    to: input.to,
    audience: input.audience,
    kind: "interactive",
    businessId: input.businessId,
    idempotencyKey: input.idempotencyKey,
    callbackData: input.callbackData,
  });
  return { ...result, from };
}

/** Tarjeta de contacto de Alhabla (solo dentro de la ventana). */
export async function enviarContacto(
  input: EnvioComun & { contact: WhatsAppContactCard }
): Promise<EnvioRegistrado> {
  const { phoneNumber: from } = await resolverRemitente(input.audience);
  const result = await whatsappAdapter.sendContacts({
    from,
    to: input.to,
    contacts: [input.contact],
    callbackData: input.callbackData,
  });
  await registrarEnvio({
    result,
    from,
    to: input.to,
    audience: input.audience,
    kind: "contacts",
    businessId: input.businessId,
    idempotencyKey: input.idempotencyKey,
    callbackData: input.callbackData,
  });
  return { ...result, from };
}

/**
 * ¿Está abierta la ventana de 24 h con este destinatario desde el número de
 * la audiencia? Dentro ⇒ interactivo/texto (0,004 $); fuera ⇒ plantilla.
 * Ante un fallo de la API se asume cerrada (la plantilla siempre llega).
 */
export async function ventanaAbierta(
  audience: WhatsappAudience,
  to: string
): Promise<boolean> {
  const { phoneNumber: from } = await resolverRemitente(audience);
  try {
    const window = await whatsappAdapter.getConversationWindow(from, to);
    return window.active;
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo consultar la ventana de ${from} con ${to}, se asume cerrada: ${errorMessage(error)}`
    );
    return false;
  }
}

export type EstadoEntrega = "queued" | "sent" | "delivered" | "read" | "failed";

/**
 * Actualiza la entrega de un mensaje enviado a partir de un webhook (los
 * `statuses[]` de Meta o los `message.sent/finalized/read` clásicos de
 * Telnyx). Si el mensaje no se registró (envío manual desde un script) se
 * crea la fila para no perder el coste. Nunca lanza.
 */
export async function actualizarEstadoEnvio(input: {
  providerMessageId: string;
  status: EstadoEntrega;
  at: Date;
  errorCode?: string | null;
  errorDetail?: string | null;
  costAmount?: string | number | null;
  costCurrency?: string | null;
  callbackData?: string | null;
  from?: string | null;
  to?: string | null;
}): Promise<void> {
  const progression: Record<EstadoEntrega, number> = {
    queued: 0,
    sent: 1,
    delivered: 2,
    read: 3,
    failed: 4,
  };
  try {
    const existing = await prisma.sentMessage.findUnique({
      where: { providerMessageId: input.providerMessageId },
      select: { id: true, deliveryStatus: true },
    });
    const current = existing?.deliveryStatus as
      EstadoEntrega | null | undefined;
    // Los webhooks no llegan en orden: un "delivered" tardío no debe pisar
    // un "read" ya guardado. El fallo siempre gana.
    const advances =
      !current ||
      input.status === "failed" ||
      progression[input.status] > (progression[current] ?? -1);
    const cost =
      input.costAmount !== null &&
      input.costAmount !== undefined &&
      input.costAmount !== ""
        ? new Prisma.Decimal(input.costAmount)
        : undefined;
    const data: Prisma.SentMessageUpdateInput = {
      ...(advances ? { deliveryStatus: input.status } : {}),
      ...(input.status === "delivered" ? { deliveredAt: input.at } : {}),
      ...(input.status === "read"
        ? { readAt: input.at, deliveredAt: existing ? undefined : input.at }
        : {}),
      ...(input.status === "failed"
        ? {
            failedAt: input.at,
            errorCode: input.errorCode ?? null,
            errorDetail: input.errorDetail ?? null,
          }
        : {}),
      ...(cost
        ? { costAmount: cost, costCurrency: input.costCurrency ?? "USD" }
        : {}),
      ...(input.callbackData ? { callbackData: input.callbackData } : {}),
    };
    if (existing) {
      await prisma.sentMessage.update({ where: { id: existing.id }, data });
      return;
    }
    await prisma.sentMessage.create({
      data: {
        channel: "whatsapp",
        idempotencyKey: `adhoc:${input.providerMessageId}`,
        providerMessageId: input.providerMessageId,
        fromNumber: input.from ?? null,
        toNumber: input.to ?? null,
        deliveryStatus: input.status,
        ...(input.status === "delivered" || input.status === "read"
          ? { deliveredAt: input.at }
          : {}),
        ...(input.status === "read" ? { readAt: input.at } : {}),
        ...(input.status === "failed"
          ? {
              failedAt: input.at,
              errorCode: input.errorCode ?? null,
              errorDetail: input.errorDetail ?? null,
            }
          : {}),
        ...(cost
          ? { costAmount: cost, costCurrency: input.costCurrency ?? "USD" }
          : {}),
        callbackData: input.callbackData ?? null,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return;
    }
    console.error(
      `[WhatsApp] No se pudo actualizar la entrega del mensaje ${input.providerMessageId} (${input.status}): ${errorMessage(error)}`
    );
  }
}
