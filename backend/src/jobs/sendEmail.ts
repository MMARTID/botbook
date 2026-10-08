import { sendZohoMail } from "../lib/zohoMail.js";
import { SendEmailJob } from "../lib/jobTypes.js";
import { marcarEnvioFallido, reclamarEnvio } from "../lib/messageIdempotency.js";

const FROM_ADDRESS: Record<SendEmailJob["fromAlias"], string> = {
  welcome: "welcome@alhabla.ai",
  support: "support@alhabla.ai",
};

export async function processSendEmailJob(data: SendEmailJob): Promise<void> {
  const { fromAlias, toAddress, subject, html } = data;
  // Una fila `failed` (Zoho no lo aceptó) se vuelve a reclamar: es el
  // reintento de Cloud Tasks, no un duplicado.
  if (
    !(await reclamarEnvio("email", data.idempotencyKey, undefined, {
      reintentarFallidos: true,
    }))
  ) {
    return;
  }
  console.log(`[Job] Enviando email "${subject}" a ${toAddress} desde ${fromAlias}@`);

  try {
    await sendZohoMail({
      fromAddress: FROM_ADDRESS[fromAlias],
      toAddress,
      subject,
      html,
    });
  } catch (error) {
    await marcarEnvioFallido("email", data.idempotencyKey, error);
    throw error;
  }
}
