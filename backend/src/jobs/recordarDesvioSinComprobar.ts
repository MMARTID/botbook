import { prisma } from "../lib/prisma.js";
import { errorMessage } from "../lib/logUtils.js";
import { alertarDesvioSinComprobar } from "../modules/whatsapp/alertas.js";

const HORA_MS = 60 * 60 * 1000;
/** El recordatorio se manda a las 24 h del alta del número… */
export const DESDE_HORAS = 24;
/** …y como muy tarde a las 48 h: pasado eso ya no es «el día 1». */
export const HASTA_HORAS = 48;

/** `voiceProvider` de las filas Call sintéticas del chat de WhatsApp: no
 * son llamadas y no prueban ningún desvío. */
const PROVEEDOR_WHATSAPP = "whatsapp";

export interface ResultadoDelRecordatorio {
  /** Negocios a los que se les mandó el recordatorio (por cualquier vía). */
  recordados: number;
  /** Candidatos que se saltaron (sin línea que desviar, ya reclamados por
   * otra instancia o sin ninguna vía de aviso). */
  omitidos: number;
}

/**
 * Recordatorio único «aún no has comprobado el desvío» (PLAN-TELEFONIA-UX.md
 * § 5, fase 5). Cloud Scheduler lo invoca cada hora vía
 * POST /internal/jobs/recordar-desvio-sin-comprobar y barre los negocios que
 * compraron su número de Alhabla hace entre 24 y 48 h y siguen sin haber
 * comprobado el desvío (`OnboardingState.forwardingCheckedAt` a null) ni
 * recibido ninguna llamada real. Los que usan el número de Alhabla como
 * principal (`customerLineType = "alhabla"`) no tienen desvío que comprobar.
 *
 * Idempotente: `Business.forwardingReminderSentAt` se reclama con un
 * updateMany condicional ANTES de avisar, así dos entregas del scheduler (o
 * dos instancias de Cloud Run) no pueden mandarlo dos veces. Si el aviso no
 * sale por ninguna vía, la marca se retira para que la siguiente pasada lo
 * reintente mientras dure la ventana.
 */
export async function recordarDesvioSinComprobarJob(
  ahora: Date = new Date()
): Promise<ResultadoDelRecordatorio> {
  const desde = new Date(ahora.getTime() - HASTA_HORAS * HORA_MS);
  const hasta = new Date(ahora.getTime() - DESDE_HORAS * HORA_MS);

  const candidatos = await prisma.business.findMany({
    where: {
      active: true,
      telnyxPhoneNumber: { not: null },
      phoneNumberStatus: "active",
      telnyxPhoneNumberPurchasedAt: { gte: desde, lte: hasta },
      forwardingReminderSentAt: null,
      // Ninguna llamada real: las Call sintéticas del chat de WhatsApp no
      // pasan por el desvío.
      calls: { none: { voiceProvider: { not: PROVEEDOR_WHATSAPP } } },
      AND: [
        {
          OR: [
            { customerLineType: null },
            { customerLineType: { not: "alhabla" } },
          ],
        },
        {
          OR: [
            { onboardingState: { is: null } },
            { onboardingState: { is: { forwardingCheckedAt: null } } },
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      telnyxPhoneNumber: true,
    },
    orderBy: { telnyxPhoneNumberPurchasedAt: "asc" },
  });

  console.log(
    `[Desvío] Recordatorio de desvío sin comprobar: ${candidatos.length} negocio(s) con número comprado entre ${desde.toISOString()} y ${hasta.toISOString()}`
  );

  const resultado: ResultadoDelRecordatorio = { recordados: 0, omitidos: 0 };

  for (const negocio of candidatos) {
    // Caso E sin la columna puesta: la línea publicada YA es el número de
    // Alhabla, no hay desvío que comprobar. Se deja sin marcar a propósito:
    // no se ha mandado nada.
    if (negocio.phone === negocio.telnyxPhoneNumber) {
      console.log(
        `[Desvío] Negocio ${negocio.id} (${negocio.name}): su línea de clientes es el propio número de Alhabla; no hay desvío que recordar`
      );
      resultado.omitidos += 1;
      continue;
    }

    const reclamado = await prisma.business.updateMany({
      where: { id: negocio.id, forwardingReminderSentAt: null },
      data: { forwardingReminderSentAt: ahora },
    });
    if (reclamado.count === 0) {
      console.log(
        `[Desvío] Negocio ${negocio.id}: el recordatorio ya lo reclamó otra pasada; no se repite`
      );
      resultado.omitidos += 1;
      continue;
    }

    const aviso = await alertarDesvioSinComprobar({ businessId: negocio.id });
    if (aviso.via === "ninguna") {
      console.error(
        `[Desvío] Negocio ${negocio.id} (${negocio.name}): el recordatorio de desvío sin comprobar no salió por ninguna vía (${aviso.motivo ?? "sin motivo"}); se retira la marca para reintentarlo en la siguiente pasada`
      );
      try {
        await prisma.business.updateMany({
          where: { id: negocio.id, forwardingReminderSentAt: ahora },
          data: { forwardingReminderSentAt: null },
        });
      } catch (error) {
        console.error(
          `[Desvío] Negocio ${negocio.id}: no se pudo retirar la marca del recordatorio; quedará como enviado sin haber salido: ${errorMessage(error)}`
        );
      }
      resultado.omitidos += 1;
      continue;
    }

    console.log(
      `[Desvío] Negocio ${negocio.id} (${negocio.name}): recordatorio de desvío sin comprobar enviado por ${aviso.via}${aviso.motivo ? ` (${aviso.motivo})` : ""}`
    );
    resultado.recordados += 1;
  }

  console.log(
    `[Desvío] Recordatorio de desvío sin comprobar: ${resultado.recordados} enviado(s), ${resultado.omitidos} omitido(s)`
  );
  return resultado;
}
