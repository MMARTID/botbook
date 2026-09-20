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
import { estaDadoDeBaja, WhatsappOptOutError } from "./bajas.js";
import {
  limpiarDuenoSinWhatsapp,
  marcarDuenoSinWhatsapp,
} from "./altaDueno.js";

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
  /** `components` de Meta tal como los guardó la sincronización (para
   * derivar, p. ej., el índice del botón URL). */
  components: unknown;
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
      components: row.components ?? null,
    };
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo leer WhatsappTemplate (${JSON.stringify(ref)}), se envía por nombre: ${errorMessage(error)}`
    );
    return null;
  }
}

const REFRESCO_PLANTILLA_MS = 24 * 60 * 60 * 1000;
/** Tras un fallo del WABA no se vuelve a intentar hasta pasado este tiempo. */
export const ENFRIAMIENTO_REFRESCO_FALLIDO_MS = 15 * 60 * 1000;
/**
 * Último intento fallido por plantilla, en memoria (por instancia): un
 * fallo no deja marca en la fila, y sin esto cada GET del panel dispararía
 * una llamada al WABA mientras Telnyx devuelva 429/5xx.
 */
const ultimoRefrescoFallido = new Map<string, number>();

/** Solo para tests: olvida los intentos fallidos. */
export function reiniciarEnfriamientoDePlantillas(): void {
  ultimoRefrescoFallido.clear();
}

/**
 * Red de seguridad para el estado de una plantilla: si su fila lleva más de
 * 24 h sin sincronizar (o nunca), se consulta el WABA y se actualiza. Cubre
 * el caso de que el evento `whatsapp.template.*` no llegue, o llegue con
 * otro nombre (no verificado en la fase 0). Nunca lanza, y tras un fallo
 * espera 15 min antes de volver a llamar al WABA.
 */
export async function refrescarPlantilla(key: string): Promise<void> {
  const wabaId = process.env.WHATSAPP_WABA_ID;
  if (!wabaId) {
    return;
  }
  const ultimoFallo = ultimoRefrescoFallido.get(key);
  if (
    ultimoFallo !== undefined &&
    Date.now() - ultimoFallo < ENFRIAMIENTO_REFRESCO_FALLIDO_MS
  ) {
    return;
  }
  try {
    const row = await prisma.whatsappTemplate.findUnique({ where: { key } });
    if (!row) {
      return;
    }
    if (
      row.lastSyncedAt &&
      Date.now() - row.lastSyncedAt.getTime() < REFRESCO_PLANTILLA_MS
    ) {
      return;
    }
    const templates = await whatsappAdapter.listTemplates(wabaId);
    ultimoRefrescoFallido.delete(key);
    const remota =
      templates.find((t) => t.telnyxTemplateId === row.telnyxTemplateId) ??
      templates.find((t) => t.name === row.name && t.language === row.language);
    if (!remota) {
      console.warn(
        `[WhatsApp] La plantilla ${key} (${row.name}/${row.language}) no aparece en el WABA; se deja como está`
      );
      await prisma.whatsappTemplate.update({
        where: { id: row.id },
        data: { lastSyncedAt: new Date() },
      });
      return;
    }
    await prisma.whatsappTemplate.update({
      where: { id: row.id },
      data: {
        status: remota.status,
        qualityRating: remota.qualityRating ?? undefined,
        rejectionReason: remota.rejectionReason ?? undefined,
        lastSyncedAt: new Date(),
      },
    });
    if (remota.status !== row.status) {
      console.log(
        `[WhatsApp] Plantilla ${key} refrescada desde el WABA: ${row.status} → ${remota.status}`
      );
      avisarCambioDeListaDeEspera(key, row.status, remota.status);
    }
  } catch (error) {
    ultimoRefrescoFallido.set(key, Date.now());
    console.error(
      `[WhatsApp] No se pudo refrescar el estado de ${key}; no se reintenta hasta dentro de ${ENFRIAMIENTO_REFRESCO_FALLIDO_MS / 60000} min: ${errorMessage(error)}`
    );
  }
}

/**
 * Barrido diario (telnyxReconciler): refresca en serie todas las filas con
 * `key`. Cada una respeta su propio enfriamiento (24 h / 15 min), así que
 * cuesta como mucho un puñado de llamadas al WABA al día. Nunca lanza.
 */
export async function refrescarPlantillasConClave(): Promise<void> {
  let filas: Array<{ key: string | null }>;
  try {
    filas = await prisma.whatsappTemplate.findMany({
      where: { key: { not: null } },
      select: { key: true },
    });
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudieron listar las plantillas con clave para refrescarlas: ${errorMessage(error)}`
    );
    return;
  }
  for (const fila of filas) {
    if (fila.key) {
      await refrescarPlantilla(fila.key);
    }
  }
}

/** Clave de la plantilla cuya aprobación activa la lista de espera. */
export const CLAVE_LISTA_DE_ESPERA = "hueco_libre";
const LISTA_DE_ESPERA_CACHE_TTL_MS = 60_000;

let listaDeEsperaCache: { at: number; value: boolean } | null = null;
let ultimoValorConocidoListaDeEspera: boolean | null = null;

/** Borra la caché del gate (no el último valor conocido). */
export function invalidarCacheListaDeEspera(): void {
  listaDeEsperaCache = null;
}

/**
 * Si la fila con `key === "hueco_libre"` cruza el estado APPROVED (hacia o
 * desde), el prompt de los assistants tiene que cambiar; aquí solo se
 * invalida la caché del gate y se deja en el log: la resincronización la
 * hace el reconciliador diario (o el script manual en dev).
 */
export function avisarCambioDeListaDeEspera(
  key: string | null,
  estadoAnterior: string | null | undefined,
  estadoNuevo: string
): void {
  if (key !== CLAVE_LISTA_DE_ESPERA) {
    return;
  }
  const antes = estadoAnterior === "APPROVED";
  const despues = estadoNuevo === "APPROVED";
  if (antes === despues) {
    return;
  }
  invalidarCacheListaDeEspera();
  console.log(
    `[WhatsApp] ${CLAVE_LISTA_DE_ESPERA} ${estadoNuevo}: la frase de la lista de espera cambia en los assistants en la próxima reconciliación diaria (o resincroniza a mano con scripts/manual/resyncToolsDev.mts en dev)`
  );
}

/**
 * Gate del prompt (managedAgentPrompt › listaDeEspera): true solo si
 * `hueco_libre` está APPROVED (`hora_disponible`, MARKETING y sin botones, no
 * cuenta). Se cachea 60 s. Ante un fallo de la base de datos devuelve el
 * último valor conocido SIN renovar la caché: un fallo transitorio durante
 * el reconciliador no puede reescribir todos los assistants sin la frase.
 */
export async function listaDeEsperaDisponible(): Promise<boolean> {
  const now = Date.now();
  if (
    listaDeEsperaCache &&
    now - listaDeEsperaCache.at < LISTA_DE_ESPERA_CACHE_TTL_MS
  ) {
    return listaDeEsperaCache.value;
  }
  await refrescarPlantilla(CLAVE_LISTA_DE_ESPERA);
  try {
    const row = await prisma.whatsappTemplate.findUnique({
      where: { key: CLAVE_LISTA_DE_ESPERA },
      select: { status: true },
    });
    const value = row?.status === "APPROVED";
    listaDeEsperaCache = { at: now, value };
    ultimoValorConocidoListaDeEspera = value;
    return value;
  } catch (error) {
    const valor = ultimoValorConocidoListaDeEspera ?? false;
    console.error(
      `[WhatsApp] No se pudo leer ${CLAVE_LISTA_DE_ESPERA} para el gate de la lista de espera; se mantiene ${valor}: ${errorMessage(error)}`
    );
    return valor;
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
  /**
   * Salta la guardia de baja (`WhatsappOptOut`). Solo para las confirmaciones
   * del propio STOP: cualquier otro envío a un número con baja se suprime.
   */
  permitirBaja?: boolean;
}

/**
 * Última capa antes del adaptador (PLAN-CANAL-DUENO.md § 6.1): un número con
 * baja vigente no recibe nada salvo la confirmación de su STOP. Si la fila
 * de `SentMessage` ya estaba reclamada (`idempotencyKey`), queda marcada
 * como suprimida para que el job no la reintente ni cuente como enviada.
 * Un fallo de la base de datos deja pasar el envío (fail-open, misma regla
 * que `reclamarEnvio`) y lo deja en el log.
 */
async function guardiaDeBaja(
  input: EnvioComun,
  kind: "template" | "text" | "interactive" | "contacts"
): Promise<void> {
  if (input.permitirBaja) {
    return;
  }
  let dadoDeBaja: boolean;
  try {
    dadoDeBaja = await estaDadoDeBaja(input.audience, input.to);
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo comprobar la baja de ${input.to} (${input.audience}, negocio ${input.businessId ?? "—"}) antes de enviar ${kind}; se envía: ${errorMessage(error)}`
    );
    return;
  }
  if (!dadoDeBaja) {
    return;
  }
  console.log(
    `[WhatsApp] Envío ${kind} a ${input.to} (${input.audience}, negocio ${input.businessId ?? "—"}) suprimido: el número pidió STOP`
  );
  if (input.idempotencyKey) {
    await marcarEnvioSuprimido(input.idempotencyKey);
  }
  throw new WhatsappOptOutError(input.audience, input.to);
}

/** Marca como suprimida la fila reclamada por `reclamarEnvio`. Nunca lanza. */
export async function marcarEnvioSuprimido(
  idempotencyKey: string
): Promise<void> {
  try {
    await prisma.sentMessage.updateMany({
      where: { channel: "whatsapp", idempotencyKey },
      data: { deliveryStatus: "suppressed", errorCode: "OPT_OUT" },
    });
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo marcar como suprimido el envío ${idempotencyKey}: ${errorMessage(error)}`
    );
  }
}

export type EnvioPlantilla = EnvioComun & {
  template:
    { key: string } | { name: string; language: string } | { id: string };
  bodyParams: Record<string, string>;
  buttonUrlParams?: Array<{ index: number; text: string }>;
  /** Solo con `template: { id }`: nombre e idioma de la fila para que
   * `SentMessage.templateName/templateLanguage` queden escritos. */
  templateName?: string;
  templateLanguage?: string;
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
    if (isUniqueConstraintError(error) && input.result.messageId) {
      // El `statuses[]` de Meta se adelantó al registro y
      // `actualizarEstadoEnvio` ya creó la fila `adhoc:<id>`: se fusiona
      // con lo que sabemos del envío (negocio, audiencia, destino,
      // callback) sin tocar el estado de entrega que ya trajo el webhook.
      await fusionarFilaAdhoc(input.result.messageId, data);
      return;
    }
    // Ya está enviado: no se puede fallar aquí. Pero sin la fila, el botón
    // que pulse el destinatario no se podrá correlacionar — que se vea.
    console.error(
      `[WhatsApp] Mensaje ${input.result.messageId} enviado a ${input.to} (${input.kind}, negocio ${input.businessId ?? "—"}) pero no se pudo registrar en SentMessage: ${errorMessage(error)}`
    );
  }
}

async function fusionarFilaAdhoc(
  providerMessageId: string,
  data: {
    businessId: string | null;
    audience: string;
    fromNumber: string;
    toNumber: string;
    kind: string;
    templateName: string | null;
    templateLanguage: string | null;
    callbackData: string | null;
  }
): Promise<void> {
  try {
    await prisma.sentMessage.updateMany({
      where: { providerMessageId },
      data: {
        businessId: data.businessId,
        audience: data.audience,
        fromNumber: data.fromNumber,
        toNumber: data.toNumber,
        kind: data.kind,
        templateName: data.templateName,
        templateLanguage: data.templateLanguage,
        callbackData: data.callbackData,
      },
    });
    console.log(
      `[WhatsApp] Mensaje ${providerMessageId} ya tenía fila adhoc; se fusiona (negocio ${data.businessId ?? "—"}, ${data.kind} a ${data.toNumber})`
    );
  } catch (error) {
    console.error(
      `[WhatsApp] Mensaje ${providerMessageId} (${data.kind} a ${data.toNumber}, negocio ${data.businessId ?? "—"}) no se pudo fusionar con su fila adhoc: ${errorMessage(error)}`
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
  await guardiaDeBaja(input, "template");
  const { phoneNumber: from } = await resolverRemitente(input.audience);

  let templateId: string | undefined;
  let templateName: string | undefined;
  let language: string | undefined;
  if ("id" in input.template) {
    templateId = input.template.id;
    templateName = input.templateName;
    language = input.templateLanguage;
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
  await guardiaDeBaja(input, "text");
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
  await guardiaDeBaja(input, "interactive");
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
  await guardiaDeBaja(input, "contacts");
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
  let existing: {
    id: string;
    idempotencyKey: string;
    deliveryStatus: string | null;
    audience: string | null;
    businessId: string | null;
    toNumber: string | null;
    callbackData: string | null;
    templateName: string | null;
  } | null = null;
  try {
    existing = await prisma.sentMessage.findUnique({
      where: { providerMessageId: input.providerMessageId },
      select: {
        id: true,
        idempotencyKey: true,
        deliveryStatus: true,
        audience: true,
        businessId: true,
        toNumber: true,
        callbackData: true,
        templateName: true,
      },
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
    } else {
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
    }
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      console.error(
        `[WhatsApp] No se pudo actualizar la entrega del mensaje ${input.providerMessageId} (${input.status}): ${errorMessage(error)}`
      );
    }
  }

  // Efectos sobre el dueño (PLAN-CANAL-DUENO.md § 12): el 131026 de Meta (el
  // número no tiene WhatsApp) llega en diferido como fallo de entrega, no en
  // la respuesta del envío; un delivered/read prueba que vuelve a llegar.
  // El `message.finalized` clásico no trae callback: se hereda de la fila.
  try {
    await aplicarEfectosDeEntrega({
      status: input.status,
      at: input.at,
      errorCode: input.errorCode ?? null,
      errorDetail: input.errorDetail ?? null,
      callbackData: input.callbackData ?? existing?.callbackData ?? null,
      toNumber: input.to ?? existing?.toNumber ?? null,
      audience: existing?.audience ?? null,
      businessId: existing?.businessId ?? null,
      idempotencyKey: existing?.idempotencyKey ?? null,
      templateName: existing?.templateName ?? null,
    });
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudieron aplicar los efectos de la entrega ${input.status} del mensaje ${input.providerMessageId} (${input.errorCode ?? "sin código"}): ${errorMessage(error)}`
    );
  }
}

/** Código de Meta: el destinatario no tiene cuenta de WhatsApp. */
export const CODIGO_SIN_WHATSAPP = "131026";

function negocioDelCallback(callbackData: string | null): string | null {
  return callbackData?.startsWith("alta:") ? callbackData.slice(5) : null;
}

/** Códigos de Meta por plantilla o parámetros mal formados (diferidos). */
const CODIGOS_DE_PLANTILLA: readonly string[] = [
  "132000",
  "132001",
  "132012",
  "132015",
  "132016",
];

async function aplicarEfectosDeEntrega(input: {
  status: EstadoEntrega;
  at: Date;
  errorCode: string | null;
  errorDetail: string | null;
  callbackData: string | null;
  toNumber: string | null;
  audience: string | null;
  businessId: string | null;
  idempotencyKey?: string | null;
  templateName?: string | null;
}): Promise<void> {
  const esActivacion = input.callbackData?.startsWith("alta:") ?? false;
  const businessId = input.businessId ?? negocioDelCallback(input.callbackData);
  const esDelDueno = input.audience === "owner" || esActivacion;

  if (input.status === "failed") {
    const sinWhatsapp =
      input.errorCode === CODIGO_SIN_WHATSAPP ||
      /\b131026\b/.test(input.errorDetail ?? "");
    if (input.callbackData?.startsWith("cliente:")) {
      await efectosDeFalloAlCliente({ ...input, businessId, sinWhatsapp });
      return;
    }
    if (!sinWhatsapp) {
      return;
    }
    if (esDelDueno && businessId && input.toNumber) {
      await marcarDuenoSinWhatsapp(businessId, input.toNumber, input.at);
      return;
    }
    console.log(
      `[WhatsApp] ${input.toNumber ?? "destino desconocido"} no tiene WhatsApp (131026, ${input.audience ?? "audiencia desconocida"}, negocio ${businessId ?? "—"}); sin efectos fuera del dueño`
    );
    return;
  }

  // Solo limpia si el envío iba al móvil actual (sin `to` no se sabe): un
  // `read` tardío de un envío al móvil antiguo no toca la marca del nuevo.
  if (
    (input.status === "delivered" || input.status === "read") &&
    input.audience === "owner" &&
    businessId &&
    input.toNumber
  ) {
    await limpiarDuenoSinWhatsapp(businessId, input.toNumber);
  }
}

/**
 * Un `statuses[].failed` sobre un envío al cliente (PR 4). Meta rechaza en
 * diferido los parámetros y plantillas mal formados (132xxx), el marketing
 * (131049) y el tier (130429/131048): el envío había afirmado un estado
 * (`clientNotifiedAt`, oferta del lead) que aquí se revierte. Best-effort:
 * el `catch` de `actualizarEstadoEnvio` envuelve cualquier fallo.
 */
async function efectosDeFalloAlCliente(input: {
  callbackData: string | null;
  toNumber: string | null;
  businessId: string | null;
  errorCode: string | null;
  errorDetail: string | null;
  idempotencyKey?: string | null;
  templateName?: string | null;
  at: Date;
  sinWhatsapp: boolean;
}): Promise<void> {
  const callback = input.callbackData ?? "";
  console.error(
    `[WhatsApp] Meta rechazó ${callback} (plantilla ${input.templateName ?? "?"}, negocio ${input.businessId ?? "—"}, destino ${input.toNumber ?? "?"}): ${input.errorCode ?? "sin código"} ${input.errorDetail ?? ""}`.trimEnd()
  );
  const partes = callback.split(":");
  const tipo = partes[1];
  const recursoId = partes.slice(2).join(":");
  if (!recursoId || !input.businessId) {
    return;
  }

  if (tipo === "confirmacion") {
    const reserva = await prisma.booking.findFirst({
      where: { id: recursoId, call: { businessId: input.businessId } },
      select: { id: true, programedAt: true },
    });
    if (!reserva) {
      return;
    }
    await prisma.booking.updateMany({
      where: { id: reserva.id },
      data: { clientNotifiedAt: null },
    });
    const esRespaldo = input.idempotencyKey?.endsWith("-respaldo") ?? false;
    if (
      input.errorCode &&
      CODIGOS_DE_PLANTILLA.includes(input.errorCode) &&
      !esRespaldo &&
      input.templateName === "confirmacion_cita_v2" &&
      input.idempotencyKey &&
      input.toNumber
    ) {
      // Import diferido: lib/cloudTasks importa los jobs, que importan este
      // servicio; el uso solo en tiempo de llamada evita el ciclo estático.
      const { enqueueWhatsappJob } = await import("../../lib/cloudTasks.js");
      await enqueueWhatsappJob(
        {
          proposito: "confirmacion",
          bookingId: reserva.id,
          programedAtMs: reserva.programedAt.getTime(),
          toNumber: input.toNumber,
          businessId: input.businessId,
          audience: "client",
          sinV2: true,
        },
        // El nombre de la tarea sale de la RESERVA, no de la clave de la
        // fila: si el `statuses[]` se adelantó al registro, la fila es
        // `adhoc:<wamid>` y Cloud Tasks rechaza los `:` del nombre
        // (solo admite [A-Za-z0-9_-]); el cliente se quedaría sin respaldo.
        {
          taskId: `booking-${reserva.id}-confirmacion-${Math.floor(reserva.programedAt.getTime() / 1000)}-respaldo`,
        }
      );
      console.log(
        `[WhatsApp] Confirmación de la reserva ${reserva.id} (negocio ${input.businessId}): la v2 fue rechazada por Meta; se encola el respaldo con confirmacion_cita`
      );
    }
    return;
  }

  if (tipo === "hueco") {
    const lead = await prisma.lead.findFirst({
      where: {
        id: recursoId,
        type: "availability_watch",
        call: { businessId: input.businessId },
      },
      select: { id: true, data: true },
    });
    if (!lead) {
      return;
    }
    const data = (lead.data as Record<string, unknown> | null) ?? {};
    if (typeof data.resolvedBy === "string") {
      // Ya respondió (reservado / ya_no / …): el rechazo llegó tarde.
      return;
    }
    if (input.sinWhatsapp) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          resolvedAt: input.at,
          data: { ...data, resolvedBy: "sin_whatsapp" },
        },
      });
      return;
    }
    // Se reabre (también el cerrado por hora_disponible): el siguiente
    // disparo lo vuelve a ofrecer con clave nueva.
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        resolvedAt: null,
        notifiedAt: null,
        notifiedVia: `ninguna:meta:${input.errorCode ?? "desconocido"}`,
      },
    });
    return;
  }
  // recordatorio / contacto / cambio / cancelacion: solo el log.
}
