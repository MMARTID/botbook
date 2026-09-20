import crypto from "node:crypto";
import type { Business, SubscriptionStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import { isUniqueConstraintError } from "../../lib/prismaErrors.js";
import { reclamarEnvio } from "../../lib/messageIdempotency.js";
import {
  bajaVigente,
  registrarBaja,
  revocarBaja,
  type BajaVigente,
} from "./bajas.js";
import {
  audienciaDelNumero,
  enviarPlantilla,
  refrescarPlantilla,
  resolverPlantilla,
  resolverRemitente,
} from "./service.js";

/**
 * Alta del dueño por WhatsApp (PLAN-CANAL-DUENO.md § 2, § 6 y § 12): el
 * móvil que el negocio guarda en el panel, el código de «ALTA <código>», la
 * plantilla `bienvenida_negocio` con el botón «Activar avisos», el estado
 * que ve Ajustes y los cambios de estado que disparan el enrutador (opt-in,
 * STOP, reactivación) y las entregas (131026).
 *
 * Reglas: cualquier opt-in consume el código; `ALTA` a secas solo reactiva
 * a un móvil que ya había consentido; toda escritura de estado lleva el
 * número en el `where` (nunca se activa un negocio para un móvil distinto
 * del remitente).
 */

/** Sin 0/O/1/I para que se pueda dictar y teclear sin confusiones. */
export const ALFABETO_CODIGO_ALTA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LONGITUD_CODIGO_ALTA = 6;
export const CODIGO_ALTA_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const FRENO_ACTIVACION_MS = 5 * 60 * 1000;
export const TOPE_ACTIVACIONES_POR_DESTINO_24H = 2;
export const PLANTILLA_BIENVENIDA_NEGOCIO = "bienvenida_negocio";
const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_INTENTOS_CODIGO = 3;

export type EstadoWhatsappDueno =
  "sin_numero" | "pendiente" | "activo" | "sin_whatsapp" | "baja";

export type ViaDeOptIn = "boton_plantilla" | "alta_codigo" | "alta_palabra";

/** Ha dado el consentimiento desde este móvil alguna vez. */
export function consintio(b: { ownerWhatsappOptInAt: Date | null }): boolean {
  return b.ownerWhatsappOptInAt !== null;
}

/** Consentido, sin STOP y sin 131026: recibe avisos. */
export function activo(b: {
  ownerWhatsappOptInAt: Date | null;
  ownerWhatsappOptOutAt: Date | null;
  ownerWhatsappUnreachableAt: Date | null;
}): boolean {
  return (
    consintio(b) &&
    b.ownerWhatsappOptOutAt === null &&
    b.ownerWhatsappUnreachableAt === null
  );
}

/** Seis símbolos con `crypto.randomBytes` y rechazo de sesgo. */
export function generarCodigoAlta(): string {
  const alfabeto = ALFABETO_CODIGO_ALTA;
  const tope = 256 - (256 % alfabeto.length);
  let codigo = "";
  while (codigo.length < LONGITUD_CODIGO_ALTA) {
    const bytes = crypto.randomBytes(LONGITUD_CODIGO_ALTA);
    for (const byte of bytes) {
      if (byte >= tope) continue;
      codigo += alfabeto[byte % alfabeto.length];
      if (codigo.length === LONGITUD_CODIGO_ALTA) break;
    }
  }
  return codigo;
}

/** «7kp3mq», «7KP-3MQ» → «7KP3MQ»; null si no es un código del alfabeto. */
export function normalizarCodigoAlta(texto: string): string | null {
  const limpio = texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (limpio.length !== LONGITUD_CODIGO_ALTA) {
    return null;
  }
  for (const simbolo of limpio) {
    if (!ALFABETO_CODIGO_ALTA.includes(simbolo)) {
      return null;
    }
  }
  return limpio;
}

/** Enlace `wa.me` al número de negocios con «ALTA <código>» ya escrito. */
export function construirEnlaceAlta(
  numeroAlhabla: string,
  codigo: string
): string {
  const digitos = numeroAlhabla.replace(/^\+/, "");
  return `https://wa.me/${digitos}?text=${encodeURIComponent(`ALTA ${codigo}`)}`;
}

/**
 * Nombre del negocio tal como puede viajar en `{{negocio_nombre}}` y en las
 * respuestas: sin saltos ni espacios seguidos (Meta rechaza el parámetro),
 * máximo 60 caracteres, y nunca el email del usuario (el registro pone
 * «Negocio de <email>» por defecto).
 */
export function nombreParaWhatsapp(business: { name: string }): string {
  const limpio = business.name.replace(/\s+/g, " ").trim();
  if (!limpio || limpio.startsWith("Negocio de ") || limpio.includes("@")) {
    return "tu negocio";
  }
  return limpio.length > 60 ? limpio.slice(0, 60).trimEnd() : limpio;
}

type NegocioParaEstado = Pick<
  Business,
  | "ownerWhatsappNumber"
  | "ownerWhatsappOptInAt"
  | "ownerWhatsappOptOutAt"
  | "ownerWhatsappUnreachableAt"
>;

/** Estado que ve el panel. Pura: el que llama trae la baja global. */
export function estadoWhatsappDelDueno(
  b: NegocioParaEstado,
  bajaGlobal: { optedOutAt: Date } | null
): EstadoWhatsappDueno {
  if (!b.ownerWhatsappNumber) return "sin_numero";
  if (b.ownerWhatsappOptOutAt || bajaGlobal) return "baja";
  if (b.ownerWhatsappUnreachableAt) return "sin_whatsapp";
  if (b.ownerWhatsappOptInAt) return "activo";
  return "pendiente";
}

/** Regla que hereda el PR 3: ningún aviso a un móvil que no esté `activo`. */
export function puedeRecibirAvisos(
  b: NegocioParaEstado,
  bajaGlobal: { optedOutAt: Date } | null
): boolean {
  return estadoWhatsappDelDueno(b, bajaGlobal) === "activo";
}

/** Un número de Alhabla (clientes o negocios) no puede ser el del dueño. */
export async function esNumeroDeAlhabla(numero: string): Promise<boolean> {
  return (await audienciaDelNumero(numero)) !== null;
}

export class NumeroDeAlhablaError extends Error {
  readonly code = "OWNER_WHATSAPP_IS_ALHABLA";

  constructor() {
    super("Ese número es el de Alhabla. Escribe tu propio móvil.");
    this.name = "NumeroDeAlhablaError";
  }
}

function tienePlanActivo(status: SubscriptionStatus | null): boolean {
  return status === "ACTIVE" || status === "TRIALING";
}

const REINICIO_DE_ESTADO = {
  ownerWhatsappOptInAt: null,
  ownerWhatsappOptInVia: null,
  ownerWhatsappOptInMessageId: null,
  ownerWhatsappOptOutAt: null,
  ownerWhatsappUnreachableAt: null,
  ownerWhatsappActivationSentAt: null,
  ownerWindowOpenUntil: null,
} as const;

/**
 * Cambia el móvil del dueño desde el panel. Solo escribe si el número es
 * distinto del guardado (el `where` también casa la columna a NULL: en SQL
 * `NULL <> x` no selecciona nada, y con `NOT: { ownerWhatsappNumber }` a
 * secas el primer móvil nunca se guardaba). Cambiarlo reinicia el
 * consentimiento, la baja, el 131026, la ventana, el freno y el código.
 * No envía nada. Devuelve `count` 0 cuando era el mismo número.
 */
export async function cambiarMovilDelDueno(
  businessId: string,
  numero: string | null
): Promise<{ count: number }> {
  if (numero !== null && (await esNumeroDeAlhabla(numero))) {
    throw new NumeroDeAlhablaError();
  }
  const where =
    numero === null
      ? { id: businessId, ownerWhatsappNumber: { not: null } }
      : {
          id: businessId,
          OR: [
            { ownerWhatsappNumber: null },
            { ownerWhatsappNumber: { not: numero } },
          ],
        };
  for (let intento = 1; ; intento++) {
    try {
      const result = await prisma.business.updateMany({
        where,
        data: {
          ownerWhatsappNumber: numero,
          ...REINICIO_DE_ESTADO,
          ownerAltaCode: numero === null ? null : generarCodigoAlta(),
          ownerAltaCodeExpiresAt:
            numero === null ? null : new Date(Date.now() + CODIGO_ALTA_TTL_MS),
        },
      });
      if (result.count === 1) {
        console.log(
          `[Business] ownerWhatsappNumber del negocio ${businessId} cambiado; estado de WhatsApp reiniciado`
        );
      }
      return { count: result.count };
    } catch (error) {
      if (isUniqueConstraintError(error) && intento < MAX_INTENTOS_CODIGO) {
        continue;
      }
      throw error;
    }
  }
}

/** Garantiza un código vigente; con uno válido no escribe nada. */
export async function asegurarCodigoAlta(
  businessId: string
): Promise<{ code: string; expiresAt: Date }> {
  const actual = await prisma.business.findUnique({
    where: { id: businessId },
    select: { ownerAltaCode: true, ownerAltaCodeExpiresAt: true },
  });
  if (
    actual?.ownerAltaCode &&
    actual.ownerAltaCodeExpiresAt &&
    actual.ownerAltaCodeExpiresAt.getTime() > Date.now()
  ) {
    return {
      code: actual.ownerAltaCode,
      expiresAt: actual.ownerAltaCodeExpiresAt,
    };
  }
  for (let intento = 1; ; intento++) {
    const code = generarCodigoAlta();
    const expiresAt = new Date(Date.now() + CODIGO_ALTA_TTL_MS);
    try {
      await prisma.business.update({
        where: { id: businessId },
        data: { ownerAltaCode: code, ownerAltaCodeExpiresAt: expiresAt },
      });
      return { code, expiresAt };
    } catch (error) {
      if (isUniqueConstraintError(error) && intento < MAX_INTENTOS_CODIGO) {
        continue;
      }
      throw error;
    }
  }
}

/**
 * Consentimiento del dueño. `updateMany` condicional: en `alta_codigo` el
 * `where` lleva el código (dos códigos concurrentes solo activan uno) y es
 * la única vía que puede vincular un móvil distinto del tecleado; con el
 * botón el `where` lleva el móvil del remitente, para que un PATCH que
 * cambie el número entre la comprobación del enrutador y esta escritura no
 * quede pisado (`count 0` ⇒ «era para otro móvil»). Cualquier opt-in
 * consume el código y limpia baja y 131026. La fila de `InboundMessage`
 * que consintió pasa a `role: owner` con el negocio.
 */
export async function activarAvisosDelDueno(input: {
  businessId: string;
  from: string;
  via: ViaDeOptIn;
  inboundMessageId: string;
  codigo?: string;
}): Promise<{ count: number; numeroAnterior: string | null }> {
  const anterior = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: { ownerWhatsappNumber: true },
  });
  const numeroAnterior = anterior?.ownerWhatsappNumber ?? null;
  const now = new Date();
  const result = await prisma.business.updateMany({
    where: {
      id: input.businessId,
      active: true,
      ...(input.via === "alta_codigo"
        ? { ownerAltaCode: input.codigo }
        : { ownerWhatsappNumber: input.from }),
    },
    data: {
      ownerWhatsappNumber: input.from,
      ownerWhatsappOptInAt: now,
      ownerWhatsappOptInVia: input.via,
      ownerWhatsappOptInMessageId: input.inboundMessageId,
      ownerWhatsappOptOutAt: null,
      ownerWhatsappUnreachableAt: null,
      ownerWindowOpenUntil: new Date(now.getTime() + DIA_MS),
      ownerAltaCode: null,
      ownerAltaCodeExpiresAt: null,
    },
  });
  if (result.count === 0) {
    return { count: 0, numeroAnterior };
  }
  await revocarBaja({
    phoneNumber: input.from,
    audience: "owner",
    inboundMessageId: input.inboundMessageId,
  });
  await prisma.inboundMessage.update({
    where: { id: input.inboundMessageId },
    data: { role: "owner", businessId: input.businessId },
  });
  console.log(
    `[WhatsApp] Dueño del negocio ${input.businessId} activado desde ${input.from} vía ${input.via} (entrante ${input.inboundMessageId})`
  );
  if (numeroAnterior !== null && numeroAnterior !== input.from) {
    avisarCambioDeMovil(input.businessId, numeroAnterior, input.from);
  }
  return { count: result.count, numeroAnterior };
}

/**
 * STOP/BAJA del dueño en el número de negocios: todos los negocios con ese
 * móvil quedan de baja y se registra la fila global de la audiencia.
 */
export async function darDeBajaDueno(input: {
  from: string;
  keyword: string;
  inboundMessageId: string;
  businessId?: string | null;
}): Promise<{ count: number }> {
  const result = await prisma.business.updateMany({
    where: { ownerWhatsappNumber: input.from, active: true },
    data: { ownerWhatsappOptOutAt: new Date() },
  });
  await registrarBaja({
    phoneNumber: input.from,
    audience: "owner",
    keyword: input.keyword,
    inboundMessageId: input.inboundMessageId,
    businessId: input.businessId ?? null,
  });
  console.log(
    `[WhatsApp] Baja del dueño ${input.from} (${input.keyword}, entrante ${input.inboundMessageId}): ${result.count} negocio(s)`
  );
  return { count: result.count };
}

/**
 * `ALTA` a secas tras un STOP: vuelve a poner un consentimiento que ese
 * móvil ya había dado. Solo negocios con `ownerWhatsappOptInAt` puesto y
 * `ownerWhatsappOptOutAt` puesto; los que nunca consintieron no se tocan.
 * También consume el código.
 */
export async function reactivarDueno(input: {
  from: string;
  inboundMessageId: string;
}): Promise<{ count: number }> {
  const now = new Date();
  const result = await prisma.business.updateMany({
    where: {
      ownerWhatsappNumber: input.from,
      active: true,
      ownerWhatsappOptInAt: { not: null },
      ownerWhatsappOptOutAt: { not: null },
    },
    data: {
      ownerWhatsappOptInAt: now,
      ownerWhatsappOptInVia: "alta_palabra",
      ownerWhatsappOptInMessageId: input.inboundMessageId,
      ownerWhatsappOptOutAt: null,
      ownerWhatsappUnreachableAt: null,
      ownerWindowOpenUntil: new Date(now.getTime() + DIA_MS),
      ownerAltaCode: null,
      ownerAltaCodeExpiresAt: null,
    },
  });
  await revocarBaja({
    phoneNumber: input.from,
    audience: "owner",
    inboundMessageId: input.inboundMessageId,
  });
  console.log(
    `[WhatsApp] Avisos reactivados para ${input.from} (entrante ${input.inboundMessageId}): ${result.count} negocio(s)`
  );
  return { count: result.count };
}

/** 131026 sobre el móvil actual del negocio: queda «sin WhatsApp». */
export async function marcarDuenoSinWhatsapp(
  businessId: string,
  toNumber: string,
  at: Date
): Promise<void> {
  const result = await prisma.business.updateMany({
    where: { id: businessId, ownerWhatsappNumber: toNumber },
    data: { ownerWhatsappUnreachableAt: at },
  });
  if (result.count === 1) {
    console.warn(
      `[WhatsApp] El móvil ${toNumber} del negocio ${businessId} no tiene WhatsApp (131026); el panel pedirá otro móvil`
    );
    avisarDuenoSinWhatsapp(businessId);
    return;
  }
  console.log(
    `[WhatsApp] 131026 para ${toNumber} del negocio ${businessId}, pero ya usa otro número; se ignora`
  );
}

/**
 * Un delivered/read prueba que el móvil vuelve a llegar. Solo si el envío
 * iba al móvil ACTUAL del negocio: un `read` tardío de un mensaje al móvil
 * antiguo (llegan cuando la persona abre el chat, días después) no puede
 * limpiar el 131026 del móvil nuevo.
 */
export async function limpiarDuenoSinWhatsapp(
  businessId: string,
  toNumber: string
): Promise<void> {
  const result = await prisma.business.updateMany({
    where: {
      id: businessId,
      ownerWhatsappNumber: toNumber,
      ownerWhatsappUnreachableAt: { not: null },
    },
    data: { ownerWhatsappUnreachableAt: null },
  });
  if (result.count === 1) {
    console.log(
      `[WhatsApp] El móvil ${toNumber} del negocio ${businessId} vuelve a ser alcanzable por WhatsApp (había un 131026)`
    );
  }
}

/** Gancho: el email de respaldo al dueño llega en el PR 3. Hoy solo log. */
export function avisarDuenoSinWhatsapp(businessId: string): void {
  console.log(
    `[WhatsApp] Aviso al dueño del negocio ${businessId} de que su móvil no tiene WhatsApp: pendiente (PR 3, email de respaldo)`
  );
}

/** Gancho: el email al usuario de la cuenta llega en el PR 3. Hoy solo log. */
export function avisarCambioDeMovil(
  businessId: string,
  numeroAnterior: string,
  from: string
): void {
  console.warn(
    `[WhatsApp] El negocio ${businessId} se activó desde ${from}, distinto del móvil tecleado ${numeroAnterior}; el email al dueño llega en el PR 3`
  );
}

const SELECT_ESTADO_DUENO = {
  id: true,
  name: true,
  active: true,
  subscriptionStatus: true,
  ownerWhatsappNumber: true,
  ownerWhatsappOptInAt: true,
  ownerWhatsappOptInVia: true,
  ownerWhatsappOptOutAt: true,
  ownerWhatsappUnreachableAt: true,
  ownerWhatsappActivationSentAt: true,
  ownerAltaCode: true,
  ownerAltaCodeExpiresAt: true,
} as const;

async function leerNegocioParaWhatsapp(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: SELECT_ESTADO_DUENO,
  });
  if (!business) {
    return null;
  }
  const bajaGlobal: BajaVigente | null = business.ownerWhatsappNumber
    ? await bajaVigente("owner", business.ownerWhatsappNumber)
    : null;
  return {
    business,
    bajaGlobal,
    status: estadoWhatsappDelDueno(business, bajaGlobal),
  };
}

export type ResultadoActivacion =
  | { outcome: "sin_negocio" }
  | { outcome: "sin_numero" }
  | { outcome: "ya_activo" }
  | { outcome: "baja" }
  | { outcome: "limite_destino" }
  | { outcome: "demasiado_pronto"; retryAfterSeconds: number }
  | { outcome: "plantilla_pendiente"; sent: "link" }
  | { outcome: "sin_plan"; sent: "link" }
  | { outcome: "envio_fallido"; sent: "link" }
  | { outcome: "enviada"; sent: "template" };

/**
 * «Guardar y activar» / «Reenviar activación» del panel. Garantiza el
 * código (el enlace/QR siempre vale) y, solo con la plantilla aprobada y
 * plan activo o en prueba, envía `bienvenida_negocio`: tope de 2 plantillas
 * por móvil destino cada 24 h entre todas las cuentas, y freno de 5 min por
 * negocio reclamado ANTES de enviar con un `updateMany` condicional (dos
 * POST concurrentes ⇒ una plantilla). Nunca lanza por Telnyx.
 */
export async function iniciarActivacionDelDueno(
  businessId: string
): Promise<ResultadoActivacion> {
  const leido = await leerNegocioParaWhatsapp(businessId);
  if (!leido) {
    return { outcome: "sin_negocio" };
  }
  const { business, status } = leido;
  if (status === "sin_numero" || !business.ownerWhatsappNumber) {
    return { outcome: "sin_numero" };
  }
  if (status === "activo") {
    return { outcome: "ya_activo" };
  }
  if (status === "baja") {
    return { outcome: "baja" };
  }
  await asegurarCodigoAlta(businessId);

  const plantilla = await resolverPlantilla({
    key: PLANTILLA_BIENVENIDA_NEGOCIO,
  });
  if (!plantilla) {
    return { outcome: "plantilla_pendiente", sent: "link" };
  }
  if (!tienePlanActivo(business.subscriptionStatus)) {
    return { outcome: "sin_plan", sent: "link" };
  }

  const to = business.ownerWhatsappNumber;
  const now = new Date();
  // Solo cuentan las que salieron: la fila que reclama `reclamarEnvio` nace
  // antes de llamar a Telnyx y, si el adaptador falla, queda `failed` (ver
  // el catch de abajo). Dos caídas de Telnyx no pueden agotar el tope.
  const activacionesAlDestino = await prisma.sentMessage.count({
    where: {
      toNumber: to,
      callbackData: { startsWith: "alta:" },
      sentAt: { gt: new Date(now.getTime() - DIA_MS) },
      NOT: { deliveryStatus: { in: ["failed", "suppressed"] } },
    },
  });
  if (activacionesAlDestino >= TOPE_ACTIVACIONES_POR_DESTINO_24H) {
    console.warn(
      `[WhatsApp] Activación del negocio ${businessId} a ${to} rechazada: ${activacionesAlDestino} plantillas de activación a ese móvil en 24 h`
    );
    return { outcome: "limite_destino" };
  }

  const frenoAnterior = business.ownerWhatsappActivationSentAt;
  const freno = await prisma.business.updateMany({
    where: {
      id: businessId,
      OR: [
        { ownerWhatsappActivationSentAt: null },
        {
          ownerWhatsappActivationSentAt: {
            lt: new Date(now.getTime() - FRENO_ACTIVACION_MS),
          },
        },
      ],
    },
    data: { ownerWhatsappActivationSentAt: now },
  });
  if (freno.count === 0) {
    const desde = frenoAnterior?.getTime() ?? now.getTime();
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((desde + FRENO_ACTIVACION_MS - now.getTime()) / 1000)
    );
    return { outcome: "demasiado_pronto", retryAfterSeconds };
  }

  const callbackData = `alta:${businessId}`;
  const idempotencyKey = `alta:${businessId}:${now.getTime()}`;
  await reclamarEnvio("whatsapp", idempotencyKey, {
    businessId,
    audience: "owner",
    toNumber: to,
    callbackData,
    kind: "template",
  });
  try {
    const result = await enviarPlantilla({
      audience: "owner",
      to,
      template: { key: PLANTILLA_BIENVENIDA_NEGOCIO },
      bodyParams: { negocio_nombre: nombreParaWhatsapp(business) },
      businessId,
      idempotencyKey,
      callbackData,
    });
    await prisma.business.updateMany({
      where: { id: businessId },
      data: { ownerWhatsappUnreachableAt: null },
    });
    console.log(
      `[WhatsApp] bienvenida_negocio enviada al negocio ${businessId} a ${to}: ${result.messageId} (${idempotencyKey})`
    );
    return { outcome: "enviada", sent: "template" };
  } catch (error) {
    const motivo = errorMessage(error);
    console.error(
      `[WhatsApp] No se pudo enviar bienvenida_negocio al negocio ${businessId} (${to}): ${motivo}`
    );
    // La fila reclamada no salió: que no cuente en el tope por destino ni
    // en el respaldo del botón.
    try {
      await prisma.sentMessage.updateMany({
        where: { channel: "whatsapp", idempotencyKey },
        data: {
          deliveryStatus: "failed",
          errorCode: "SEND_ERROR",
          errorDetail: motivo,
        },
      });
    } catch (marcaError) {
      console.error(
        `[WhatsApp] No se pudo marcar como fallida la activación ${idempotencyKey} del negocio ${businessId}; contará en el tope por destino: ${errorMessage(marcaError)}`
      );
    }
    try {
      await prisma.business.updateMany({
        where: { id: businessId, ownerWhatsappActivationSentAt: now },
        data: { ownerWhatsappActivationSentAt: frenoAnterior },
      });
    } catch (revertError) {
      console.error(
        `[WhatsApp] No se pudo revertir el freno de activación del negocio ${businessId}; el dueño tendrá que esperar cinco minutos: ${errorMessage(revertError)}`
      );
    }
    return { outcome: "envio_fallido", sent: "link" };
  }
}

export interface ResumenWhatsappDueno {
  ownerWhatsappNumber: string | null;
  status: EstadoWhatsappDueno;
  optInAt: string | null;
  optInVia: ViaDeOptIn | null;
  optOutAt: string | null;
  unreachableAt: string | null;
  activationSentAt: string | null;
  templateApproved: boolean;
  canSendTemplate: boolean;
  alhablaNumber: string;
  alta: {
    code: string;
    text: string;
    link: string;
    expiresAt: string;
  } | null;
}

/** Lo que devuelve `GET /business/me/whatsapp`; null si el negocio no existe. */
export async function resumenWhatsappDelDueno(
  businessId: string
): Promise<ResumenWhatsappDueno | null> {
  const leido = await leerNegocioParaWhatsapp(businessId);
  if (!leido) {
    return null;
  }
  const { business, bajaGlobal, status } = leido;

  let templateApproved =
    (await resolverPlantilla({ key: PLANTILLA_BIENVENIDA_NEGOCIO })) !== null;
  if (!templateApproved) {
    // Red de seguridad por si el evento whatsapp.template.* no llega con
    // ese nombre: como mucho una consulta al WABA cada 24 h.
    await refrescarPlantilla(PLANTILLA_BIENVENIDA_NEGOCIO);
    templateApproved =
      (await resolverPlantilla({ key: PLANTILLA_BIENVENIDA_NEGOCIO })) !== null;
  }
  const { phoneNumber: alhablaNumber } = await resolverRemitente("owner");

  let alta: ResumenWhatsappDueno["alta"] = null;
  if (status !== "activo") {
    const { code, expiresAt } = await asegurarCodigoAlta(businessId);
    alta = {
      code,
      text: `ALTA ${code}`,
      link: construirEnlaceAlta(alhablaNumber, code),
      expiresAt: expiresAt.toISOString(),
    };
  }

  const optOutAt = business.ownerWhatsappOptOutAt ?? bajaGlobal?.optedOutAt;
  return {
    ownerWhatsappNumber: business.ownerWhatsappNumber,
    status,
    optInAt: business.ownerWhatsappOptInAt?.toISOString() ?? null,
    optInVia: (business.ownerWhatsappOptInVia as ViaDeOptIn | null) ?? null,
    optOutAt: optOutAt?.toISOString() ?? null,
    unreachableAt: business.ownerWhatsappUnreachableAt?.toISOString() ?? null,
    activationSentAt:
      business.ownerWhatsappActivationSentAt?.toISOString() ?? null,
    templateApproved,
    canSendTemplate:
      templateApproved && tienePlanActivo(business.subscriptionStatus),
    alhablaNumber,
    alta,
  };
}
