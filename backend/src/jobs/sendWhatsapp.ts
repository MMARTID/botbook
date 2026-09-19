import { SendWhatsappJob } from "../lib/jobTypes.js";
import { reclamarEnvio } from "../lib/messageIdempotency.js";
import { enviarPlantilla } from "../modules/whatsapp/service.js";

export async function processSendWhatsappJob(
  data: SendWhatsappJob
): Promise<void> {
  const { toNumber, templateName, languageCode, bodyParams } = data;
  if (!(await reclamarEnvio("whatsapp", data.idempotencyKey))) {
    return;
  }
  console.log(
    `[Job] Enviando WhatsApp (plantilla "${templateName}") a ${toNumber}`
  );

  // Sale por el número de la audiencia (clientes por defecto) y, si la
  // plantilla está en WhatsappTemplate aprobada, por template_id; si no,
  // por nombre + idioma como hasta ahora.
  await enviarPlantilla({
    audience: data.audience ?? "client",
    to: toNumber,
    template: { name: templateName, language: languageCode },
    bodyParams,
    businessId: data.businessId,
    idempotencyKey: data.idempotencyKey,
  });
}
