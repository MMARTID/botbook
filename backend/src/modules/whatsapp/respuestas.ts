import type { InboundMessage } from "@prisma/client";
import type { WhatsappAudience } from "../../adapters/whatsapp/WhatsAppAdapter.js";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import { reclamarEnvio } from "../../lib/messageIdempotency.js";
import { enviarTexto } from "./service.js";

/**
 * Respuestas del enrutador de WhatsApp (movido tal cual de `router.ts` para
 * que los botones del cliente, `botonesCliente.ts`, respondan con las mismas
 * reglas): como mucho UNA respuesta por entrante, como texto desde el mismo
 * número al que escribió la persona (ventana abierta, 0,004 $), reclamada con
 * `reclamarEnvio` (`entrante:<id>:<tipo>`), techo de 20 respuestas por número
 * y hora, y una vez al día en las ramas informativas. Nunca lanza por un
 * fallo al responder: el motivo vuelve en `error` y queda en el log.
 */

export interface ResultadoEnrutado {
  /** Nombre del handler que atendió el mensaje (con sufijo `:silenciado` o `:baja`). */
  handler: string;
  /** Motivo si la respuesta no pudo salir; el estado ya está guardado. */
  error?: string;
}

export const HORA_MS = 60 * 60 * 1000;
export const DIA_MS = 24 * HORA_MS;
export const TECHO_RESPUESTAS_POR_HORA = 20;

export interface OpcionesRespuesta {
  /** Solo la confirmación del propio STOP: salta la guardia de baja. */
  permitirBaja?: boolean;
  /** Solo la confirmación del STOP: ignora el techo por hora una vez al día. */
  saltarTecho?: boolean;
  /** Ramas informativas: una respuesta de este tipo por número y día. */
  unaVezAlDia?: boolean;
  /** Negocio al que atribuir la respuesta (si no, el del entrante). */
  businessId?: string | null;
}

export interface Respuesta {
  /** "" | ":silenciado" | ":baja" */
  sufijo: string;
  error?: string;
}

export function esErrorDeBaja(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "WHATSAPP_OPT_OUT"
  );
}

/**
 * ¿Ya se envió una respuesta de este tipo a este número en 24 h? Una fila
 * reclamada cuyo envío falló (`failed`) no cuenta: si Telnyx cae en la
 * primera respuesta del día, la siguiente lo vuelve a intentar. Una fila
 * `suppressed` (el número pidió STOP) sí cuenta.
 */
export async function yaAvisadoHoy(
  inbound: InboundMessage,
  tipo: string
): Promise<boolean> {
  const count = await prisma.sentMessage.count({
    where: {
      toNumber: inbound.fromNumber,
      audience: inbound.audience ?? undefined,
      callbackData: `aviso:${tipo}`,
      sentAt: { gt: new Date(Date.now() - DIA_MS) },
      NOT: { deliveryStatus: "failed" },
    },
  });
  return count > 0;
}

/**
 * Responde al entrante con un texto desde el número al que escribió.
 * Devuelve el sufijo del handler y, si el envío falló, el motivo.
 */
export async function responder(
  inbound: InboundMessage,
  tipo: string,
  body: string,
  opciones: OpcionesRespuesta = {}
): Promise<Respuesta> {
  const audience = inbound.audience as WhatsappAudience;
  const from = inbound.fromNumber;
  const businessId = opciones.businessId ?? inbound.businessId ?? undefined;
  const callbackData = `aviso:${tipo}`;

  try {
    if (opciones.unaVezAlDia && (await yaAvisadoHoy(inbound, tipo))) {
      return { sufijo: ":silenciado" };
    }
    const enUltimaHora = await prisma.sentMessage.count({
      where: {
        toNumber: from,
        audience,
        sentAt: { gt: new Date(Date.now() - HORA_MS) },
      },
    });
    if (enUltimaHora >= TECHO_RESPUESTAS_POR_HORA) {
      const excepcion =
        opciones.saltarTecho === true && !(await yaAvisadoHoy(inbound, tipo));
      if (!excepcion) {
        console.warn(
          `[WhatsApp] Respuesta ${tipo} a ${from} silenciada: ${enUltimaHora} respuestas en la última hora desde el número de ${audience}`
        );
        return { sufijo: ":silenciado" };
      }
    }
  } catch (error) {
    // Sin contadores se responde igual: la idempotencia por entrante sigue.
    console.error(
      `[WhatsApp] No se pudieron leer los contadores de respuestas de ${from} (${tipo}); se responde: ${errorMessage(error)}`
    );
  }

  const idempotencyKey = `entrante:${inbound.id}:${tipo}`;
  const reclamado = await reclamarEnvio("whatsapp", idempotencyKey, {
    businessId: businessId ?? null,
    audience,
    toNumber: from,
    callbackData,
    kind: "text",
  });
  if (!reclamado) {
    return { sufijo: "" };
  }

  try {
    const result = await enviarTexto({
      audience,
      to: from,
      businessId,
      body,
      idempotencyKey,
      callbackData,
      permitirBaja: opciones.permitirBaja,
    });
    console.log(
      `[WhatsApp] Respuesta ${tipo} a ${from} (negocio ${businessId ?? "—"}): ${result.messageId}`
    );
    return { sufijo: "" };
  } catch (error) {
    if (esErrorDeBaja(error)) {
      // Caso correcto, no un fallo: el número pidió STOP.
      console.log(
        `[WhatsApp] Respuesta ${tipo} a ${from} omitida: el número pidió STOP`
      );
      await prisma.sentMessage
        .updateMany({
          where: { channel: "whatsapp", idempotencyKey },
          data: { deliveryStatus: "suppressed", errorCode: "OPT_OUT" },
        })
        .catch(() => undefined);
      return { sufijo: ":baja" };
    }
    const motivo = errorMessage(error);
    console.error(
      `[WhatsApp] No se pudo responder (${tipo}) a ${from} desde el número de ${audience} (negocio ${businessId ?? "—"}): ${motivo}`
    );
    // Que la fila reclamada no cuente como respuesta enviada (una vez al
    // día): el siguiente entrante lo vuelve a intentar.
    await prisma.sentMessage
      .updateMany({
        where: { channel: "whatsapp", idempotencyKey },
        data: {
          deliveryStatus: "failed",
          errorCode: "SEND_ERROR",
          errorDetail: motivo,
        },
      })
      .catch((marcaError: unknown) => {
        console.error(
          `[WhatsApp] No se pudo marcar como fallida la respuesta ${idempotencyKey} a ${from}; contará como enviada hoy: ${errorMessage(marcaError)}`
        );
      });
    return { sufijo: "", error: motivo };
  }
}

export function resultado(
  base: string,
  respuesta: Respuesta
): ResultadoEnrutado {
  return respuesta.error
    ? { handler: `${base}${respuesta.sufijo}`, error: respuesta.error }
    : { handler: `${base}${respuesta.sufijo}` };
}

/** Sin acentos, en mayúsculas, espacios colapsados: para comparar títulos de botón. */
export function normalizarTitulo(value: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}
