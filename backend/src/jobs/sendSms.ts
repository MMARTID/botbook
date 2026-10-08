import { telnyxAdapter } from "../adapters/telnyx/TelnyxAdapter.js";
import { SendSmsJob } from "../lib/jobTypes.js";
import { marcarEnvioFallido, reclamarEnvio } from "../lib/messageIdempotency.js";

export async function processSendSmsJob(data: SendSmsJob): Promise<void> {
  const { fromNumber, toNumber, text, messagingProfileId } = data;
  // Una fila `failed` (Telnyx no lo aceptó) se vuelve a reclamar: es el
  // reintento de Cloud Tasks, no un duplicado.
  if (
    !(await reclamarEnvio("sms", data.idempotencyKey, undefined, {
      reintentarFallidos: true,
    }))
  ) {
    return;
  }
  console.log(`[Job] Enviando SMS a ${toNumber} desde ${fromNumber}`);

  try {
    await telnyxAdapter.sendSms({
      from: fromNumber,
      to: toNumber,
      text,
      messagingProfileId,
    });
  } catch (error) {
    await marcarEnvioFallido("sms", data.idempotencyKey, error);
    throw error;
  }
}
