import { whatsappAdapter } from "../adapters/whatsapp/WhatsAppAdapter.js";
import { SendWhatsappJob } from "../lib/jobTypes.js";

export async function processSendWhatsappJob(data: SendWhatsappJob): Promise<void> {
  const { toNumber, templateName, languageCode, bodyParams } = data;
  console.log(`[Job] Enviando WhatsApp (plantilla "${templateName}") a ${toNumber}`);

  await whatsappAdapter.sendTemplate({
    to: toNumber,
    templateName,
    languageCode,
    bodyParams,
  });
}
