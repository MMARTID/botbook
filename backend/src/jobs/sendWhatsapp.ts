import { whatsappAdapter } from "../adapters/whatsapp/WhatsAppAdapter.js";
import { SendWhatsappJob } from "../lib/jobTypes.js";
import { reclamarEnvio } from "../lib/messageIdempotency.js";

export async function processSendWhatsappJob(data: SendWhatsappJob): Promise<void> {
  const { toNumber, templateName, languageCode, bodyParams } = data;
  if (!(await reclamarEnvio("whatsapp", data.idempotencyKey))) {
    return;
  }
  console.log(`[Job] Enviando WhatsApp (plantilla "${templateName}") a ${toNumber}`);

  await whatsappAdapter.sendTemplate({
    to: toNumber,
    templateName,
    languageCode,
    bodyParams,
  });
}
