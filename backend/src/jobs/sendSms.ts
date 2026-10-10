import { telnyxAdapter } from "../adapters/telnyx/TelnyxAdapter.js";
import { SendSmsJob } from "../lib/jobTypes.js";
import {
  esFalloPermanentePorEstado,
  PermanentJobError,
} from "../lib/jobErrors.js";
import { errorMessage } from "../lib/logUtils.js";
import {
  marcarEnvioFallido,
  reclamarEnvio,
} from "../lib/messageIdempotency.js";

/**
 * Estado HTTP y código de Telnyx (`errors[0].code`, p. ej. "40305") de un
 * `APIError` del SDK, que guarda el cuerpo de la respuesta en `error`.
 */
function detalleDelRechazo(error: unknown): {
  status: number | undefined;
  codigo: string | undefined;
} {
  const e = error as {
    status?: unknown;
    error?: { errors?: Array<{ code?: unknown }> };
  };
  const status = typeof e?.status === "number" ? e.status : undefined;
  const code = e?.error?.errors?.[0]?.code;
  return {
    status,
    codigo:
      typeof code === "string" || typeof code === "number"
        ? String(code)
        : undefined,
  };
}

function etiquetaDelSms(data: SendSmsJob): string {
  return `SMS ${data.proposito ?? "sin propósito"} del negocio ${data.businessId ?? "desconocido"}`;
}

export async function processSendSmsJob(data: SendSmsJob): Promise<void> {
  const { fromNumber, toNumber, text, messagingProfileId } = data;
  const etiqueta = etiquetaDelSms(data);

  // Un SMS del número de Alhabla a sí mismo no le llega a nadie (pasaba con
  // el aviso al dueño cuando la línea de clientes ES el número de Alhabla) y
  // Telnyx lo rechaza siempre: se descarta antes de reclamar nada.
  if (fromNumber === toNumber) {
    console.error(
      `[Job] ${etiqueta} descartado (proveedor telnyx): el destino ${toNumber} es el propio remitente`
    );
    throw new PermanentJobError(
      `SMS a sí mismo descartado (${toNumber})`,
      "sms_a_si_mismo"
    );
  }

  // Una fila `failed` (Telnyx no lo aceptó) se vuelve a reclamar: es el
  // reintento de Cloud Tasks, no un duplicado (mismo criterio que sendEmail).
  if (
    !(await reclamarEnvio("sms", data.idempotencyKey, undefined, {
      reintentarFallidos: true,
    }))
  ) {
    return;
  }
  console.log(`[Job] Enviando ${etiqueta} a ${toNumber} desde ${fromNumber}`);

  try {
    await telnyxAdapter.sendSms({
      from: fromNumber,
      to: toNumber,
      text,
      messagingProfileId,
    });
  } catch (error) {
    await marcarEnvioFallido("sms", data.idempotencyKey, error);
    const { status, codigo } = detalleDelRechazo(error);
    // Un 4xx de Telnyx (40305 «Invalid 'from' address», destino inválido,
    // Sender ID sin aprobar…) no cambia por repetirlo: antes devolvía 500 y
    // Cloud Tasks lo reintentaba cuatro veces tras cada reserva.
    if (esFalloPermanentePorEstado(status)) {
      console.error(
        `[Job] ${etiqueta} rechazado por Telnyx de forma definitiva (HTTP ${status}, código ${codigo ?? "sin código"}) de ${fromNumber} a ${toNumber}; no se reintenta: ${errorMessage(error)}`
      );
      throw new PermanentJobError(
        `Telnyx rechazó el SMS (${status}${codigo ? ` ${codigo}` : ""}): ${errorMessage(error)}`,
        `telnyx_${codigo ?? status}`
      );
    }
    throw error;
  }
}
