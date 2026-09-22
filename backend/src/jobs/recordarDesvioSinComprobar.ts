import { prisma } from "../lib/prisma.js";
import { errorMessage } from "../lib/logUtils.js";
import { esLineaDeClientesEspanola } from "../lib/phone.js";
import {
  alertarDesvioComprobado,
  alertarDesvioSinComprobar,
} from "../modules/whatsapp/alertas.js";

const HORA_MS = 60 * 60 * 1000;
/** El mensaje del día 1 se manda a las 24 h del alta del número… */
export const DESDE_HORAS = 24;
/** …y como muy tarde a las 48 h: pasado eso ya no es «el día 1». */
export const HASTA_HORAS = 48;

/** `voiceProvider` de las filas Call sintéticas del chat de WhatsApp: no
 * son llamadas y no prueban ningún desvío. */
const PROVEEDOR_WHATSAPP = "whatsapp";

/** `Business.phone` nace con este prefijo en el registro y lo conserva hasta
 * que el dueño guarda su línea de clientes (auth/routes.ts). */
const PREFIJO_DE_TELEFONO_PROVISIONAL = "TEMP-";

export interface ResultadoDelRecordatorio {
  /** Negocios que recibieron «aún no has comprobado el desvío» (por cualquier vía). */
  recordados: number;
  /** Negocios que recibieron «tu desvío está comprobado» (por cualquier vía). */
  confirmados: number;
  /** Candidatos que se saltaron (sin línea que desviar o que comprobar, ya
   * reclamados por otra instancia o sin ninguna vía de aviso). */
  omitidos: number;
}

/**
 * Mensaje del día 1 sobre el desvío (PLAN-TELEFONIA-UX.md § 5, fase 5), en
 * sus dos variantes. Cloud Scheduler lo invoca cada hora vía
 * POST /internal/jobs/recordar-desvio-sin-comprobar y barre los negocios que
 * compraron su número de Alhabla hace entre 24 y 48 h:
 *
 * - Si `OnboardingState.forwardingCheckedAt` ya está puesto: «tu desvío está
 *   comprobado» (`alertarDesvioComprobado`).
 * - Si sigue a null y no ha entrado ninguna llamada real: «aún no has
 *   comprobado el desvío» (`alertarDesvioSinComprobar`), el recordatorio.
 * - Si sigue a null pero ya entran llamadas: nada (el desvío funciona en la
 *   práctica; el recordatorio sobraría y la confirmación sería falsa).
 *
 * Los que usan el número de Alhabla como principal (`customerLineType =
 * "alhabla"`) no tienen desvío que comprobar. Y solo se escribe a quien
 * «Comprobar desvío» (`iniciarComprobacionDeDesvio`) le funcionaría, porque
 * el recordatorio promete «te llamamos y lo verificamos»: línea de clientes
 * guardada (no el `TEMP-` del registro), fijo o móvil español y número
 * enrutado al Call Control App de Telnyx (`voiceRoutingTarget = "telnyx"`).
 *
 * Idempotente: `Business.forwardingReminderSentAt` se reclama con un
 * updateMany condicional ANTES de avisar, así dos entregas del scheduler (o
 * dos instancias de Cloud Run) no pueden mandarlo dos veces. Si el aviso no
 * sale por ninguna vía, la marca se retira para que la siguiente pasada lo
 * reintente mientras dure la ventana; el recursoId del aviso lleva el
 * instante del intento (`ahora`), así el reintento no choca con la fila de
 * `sent_messages` del intento fallido.
 */
export async function recordarDesvioSinComprobarJob(
  ahora: Date = new Date()
): Promise<ResultadoDelRecordatorio> {
  const desde = new Date(ahora.getTime() - HASTA_HORAS * HORA_MS);
  const hasta = new Date(ahora.getTime() - DESDE_HORAS * HORA_MS);

  const sinComprobar = {
    OR: [
      { onboardingState: { is: null } },
      { onboardingState: { is: { forwardingCheckedAt: null } } },
    ],
  };

  const candidatos = await prisma.business.findMany({
    where: {
      active: true,
      telnyxPhoneNumber: { not: null },
      phoneNumberStatus: "active",
      telnyxPhoneNumberPurchasedAt: { gte: desde, lte: hasta },
      forwardingReminderSentAt: null,
      // Los mismos requisitos que «Comprobar desvío»: sin ellos el botón que
      // promete el recordatorio respondería con error.
      voiceRoutingTarget: "telnyx",
      NOT: { phone: { startsWith: PREFIJO_DE_TELEFONO_PROVISIONAL } },
      AND: [
        {
          OR: [
            { customerLineType: null },
            { customerLineType: { not: "alhabla" } },
          ],
        },
        {
          OR: [
            // Variante positiva: el desvío está comprobado.
            {
              onboardingState: {
                is: { forwardingCheckedAt: { not: null } },
              },
            },
            // Variante negativa: sin comprobar y sin ninguna llamada real
            // (las Call sintéticas del chat de WhatsApp no pasan por el
            // desvío).
            {
              AND: [
                sinComprobar,
                {
                  calls: {
                    none: { voiceProvider: { not: PROVEEDOR_WHATSAPP } },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      telnyxPhoneNumber: true,
      onboardingState: { select: { forwardingCheckedAt: true } },
    },
    orderBy: { telnyxPhoneNumberPurchasedAt: "asc" },
  });

  console.log(
    `[Desvío] Mensaje del día 1 sobre el desvío: ${candidatos.length} negocio(s) con número comprado entre ${desde.toISOString()} y ${hasta.toISOString()}`
  );

  const resultado: ResultadoDelRecordatorio = {
    recordados: 0,
    confirmados: 0,
    omitidos: 0,
  };

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

    // `Business.phone` admite cualquier E.164 del mundo, pero «Comprobar
    // desvío» solo llama a fijos y móviles españoles: a los demás no se les
    // promete una llamada que no saldría. Sin marcar: si el dueño corrige la
    // línea dentro de la ventana, la pasada siguiente le escribe.
    if (!esLineaDeClientesEspanola(negocio.phone)) {
      console.log(
        `[Desvío] Negocio ${negocio.id} (${negocio.name}): su línea de clientes ${negocio.phone} no es un fijo ni un móvil español; no se puede comprobar el desvío y no se le escribe`
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
        `[Desvío] Negocio ${negocio.id}: el mensaje del día 1 ya lo reclamó otra pasada; no se repite`
      );
      resultado.omitidos += 1;
      continue;
    }

    const comprobado = negocio.onboardingState?.forwardingCheckedAt != null;
    const variante = comprobado ? "desvío comprobado" : "desvío sin comprobar";
    const aviso = comprobado
      ? await alertarDesvioComprobado({
          businessId: negocio.id,
          intento: ahora,
        })
      : await alertarDesvioSinComprobar({
          businessId: negocio.id,
          intento: ahora,
        });
    if (aviso.via === "ninguna") {
      console.error(
        `[Desvío] Negocio ${negocio.id} (${negocio.name}): el mensaje del día 1 (${variante}) no salió por ninguna vía (${aviso.motivo ?? "sin motivo"}); se retira la marca para reintentarlo en la siguiente pasada`
      );
      try {
        await prisma.business.updateMany({
          where: { id: negocio.id, forwardingReminderSentAt: ahora },
          data: { forwardingReminderSentAt: null },
        });
      } catch (error) {
        console.error(
          `[Desvío] Negocio ${negocio.id}: no se pudo retirar la marca del mensaje del día 1; quedará como enviado sin haber salido: ${errorMessage(error)}`
        );
      }
      resultado.omitidos += 1;
      continue;
    }

    console.log(
      `[Desvío] Negocio ${negocio.id} (${negocio.name}): mensaje del día 1 (${variante}) enviado por ${aviso.via}${aviso.motivo ? ` (${aviso.motivo})` : ""}`
    );
    if (comprobado) {
      resultado.confirmados += 1;
    } else {
      resultado.recordados += 1;
    }
  }

  console.log(
    `[Desvío] Mensaje del día 1 sobre el desvío: ${resultado.recordados} recordatorio(s), ${resultado.confirmados} confirmación(es), ${resultado.omitidos} omitido(s)`
  );
  return resultado;
}
