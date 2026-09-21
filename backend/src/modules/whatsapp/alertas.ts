import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import { enqueueEmailJob } from "../../lib/cloudTasks.js";
import { operationalAlertEmail } from "../../lib/emailTemplates.js";
import {
  avisarAlerta,
  RUTA_DE_ALERTA,
  type CausaDeAlerta,
  type ResultadoAviso,
} from "./avisosNegocio.js";
import * as mensajes from "./mensajes.js";

/**
 * Las cinco alertas operativas del plan (PLAN-CANAL-DUENO.md § 4, fila 5 y
 * § 12): calendario desconectado, número no activo, prueba que termina,
 * 80 % de minutos y pago fallido. Cada una se dispara desde el sitio donde
 * ocurre el hecho (calendar/conexion.ts, phone/service.ts, billing/
 * service.ts, jobs/processUsageReport.ts) y nunca lanza: una alerta que no
 * sale no puede romper lo que la origina. El email de facturación de
 * siempre (pago fallido, 80 % de minutos) se sigue mandando aparte; aquí el
 * email solo es el respaldo para dueños sin WhatsApp activo.
 */

/** «20 de septiembre de 2026» en la zona del negocio. */
function fechaLarga(fecha: Date, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone || "Europe/Madrid",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(fecha);
}

function diaDeHoy(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replace(/-/g, "");
}

async function emailDeAlerta(input: {
  businessId: string;
  businessName: string;
  causa: CausaDeAlerta;
  texto: string;
  recursoId: string;
}): Promise<void> {
  const usuario = await prisma.user.findFirst({
    where: { businessId: input.businessId },
    select: { email: true },
    orderBy: { createdAt: "asc" },
  });
  if (!usuario?.email) {
    throw new Error("el negocio no tiene ningún correo");
  }
  const { subject, html } = operationalAlertEmail({
    businessName: input.businessName,
    texto: input.texto,
    panelUrl: mensajes.panelUrl(`/ajustes/${RUTA_DE_ALERTA[input.causa]}`),
  });
  await enqueueEmailJob(
    { fromAlias: "support", toAddress: usuario.email, subject, html },
    `alerta-${input.recursoId.replace(/[^A-Za-z0-9_-]/g, "-")}`
  );
}

type Negocio = { name: string; timezone: string };

async function alertar(input: {
  businessId: string;
  causa: CausaDeAlerta;
  recursoId: (negocio: Negocio) => string;
  texto: (negocio: Negocio) => string;
  /** Las alertas de facturación ya tienen su email: no hace falta respaldo. */
  conEmailDeRespaldo: boolean;
}): Promise<ResultadoAviso> {
  let recursoId = `${input.causa}:${input.businessId}`;
  try {
    const negocio = await prisma.business.findUnique({
      where: { id: input.businessId },
      select: { name: true, timezone: true },
    });
    if (!negocio) {
      return { via: "ninguna", motivo: "negocio inexistente" };
    }
    recursoId = input.recursoId(negocio);
    const texto = input.texto(negocio);
    return await avisarAlerta({
      businessId: input.businessId,
      businessName: negocio.name,
      causa: input.causa,
      texto,
      recursoId,
      email: input.conEmailDeRespaldo
        ? () =>
            emailDeAlerta({
              businessId: input.businessId,
              businessName: negocio.name,
              causa: input.causa,
              texto,
              recursoId,
            })
        : undefined,
    });
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo enviar la alerta ${input.causa} (${recursoId}) del negocio ${input.businessId}: ${errorMessage(error)}`
    );
    return { via: "ninguna", motivo: errorMessage(error) };
  }
}

/** Calendario desconectado: una vez al día por proveedor. */
export async function alertarCalendarioDesconectado(input: {
  businessId: string;
  proveedor: string;
  providerId: string;
}): Promise<ResultadoAviso> {
  return alertar({
    businessId: input.businessId,
    causa: "calendario",
    recursoId: (negocio) =>
      `calendario:${input.businessId}:${input.providerId}:${diaDeHoy(negocio.timezone)}`,
    texto: () => mensajes.alertaCalendario({ proveedor: input.proveedor }),
    conEmailDeRespaldo: true,
  });
}

/** La compra o activación del número falló: una vez al día. */
export async function alertarNumeroNoActivo(input: {
  businessId: string;
}): Promise<ResultadoAviso> {
  return alertar({
    businessId: input.businessId,
    causa: "telefono",
    recursoId: (negocio) =>
      `telefono:${input.businessId}:${diaDeHoy(negocio.timezone)}`,
    texto: () => mensajes.alertaTelefono(),
    conEmailDeRespaldo: true,
  });
}

/**
 * Recordatorio único «aún no has comprobado el desvío» (PLAN-TELEFONIA-UX.md
 * § 5, fase 5), que manda jobs/recordarDesvioSinComprobar.ts entre 24 y 48 h
 * después de comprar el número. La idempotencia de verdad está en
 * `Business.forwardingReminderSentAt`; el recursoId sin fecha solo evita que
 * una doble entrega del job repita el mensaje.
 */
export async function alertarDesvioSinComprobar(input: {
  businessId: string;
}): Promise<ResultadoAviso> {
  return alertar({
    businessId: input.businessId,
    causa: "telefono",
    recursoId: () => `desvio:${input.businessId}`,
    texto: () => mensajes.alertaDesvioSinComprobar(),
    conEmailDeRespaldo: true,
  });
}

/** Stripe avisa tres días antes de que termine la prueba. */
export async function alertarPruebaTermina(input: {
  businessId: string;
  subscriptionId: string;
  trialEnd: Date;
}): Promise<ResultadoAviso> {
  return alertar({
    businessId: input.businessId,
    causa: "prueba",
    recursoId: () => `prueba:${input.subscriptionId}`,
    texto: (negocio) =>
      mensajes.alertaPruebaTermina({
        fecha: fechaLarga(input.trialEnd, negocio.timezone),
      }),
    conEmailDeRespaldo: true,
  });
}

/** 80 % de los minutos del plan consumidos (el email ya sale aparte). */
export async function alertarMinutos(input: {
  businessId: string;
  periodId: string;
  consumidos: number;
  incluidos: number;
  extraMinuteCents: number;
}): Promise<ResultadoAviso> {
  return alertar({
    businessId: input.businessId,
    causa: "minutos",
    recursoId: () => `minutos:${input.periodId}`,
    texto: () =>
      mensajes.alertaMinutos({
        consumidos: input.consumidos,
        incluidos: input.incluidos,
        precioExtra: `${(input.extraMinuteCents / 100).toFixed(2).replace(".", ",")} €`,
      }),
    conEmailDeRespaldo: false,
  });
}

/** Cobro fallido (el email ya sale aparte). */
export async function alertarPagoFallido(input: {
  businessId: string;
  invoiceId: string;
  suspensionAt: Date;
}): Promise<ResultadoAviso> {
  return alertar({
    businessId: input.businessId,
    causa: "pago",
    recursoId: () => `pago:${input.invoiceId}`,
    texto: (negocio) =>
      mensajes.alertaPagoFallido({
        fecha: fechaLarga(input.suspensionAt, negocio.timezone),
      }),
    conEmailDeRespaldo: false,
  });
}
