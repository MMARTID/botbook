import { esJobPorProposito, type SendWhatsappJob } from "../lib/jobTypes.js";
import { reclamarEnvio } from "../lib/messageIdempotency.js";
import { errorMessage } from "../lib/logUtils.js";
import { prisma } from "../lib/prisma.js";
import { enviarPlantilla } from "../modules/whatsapp/service.js";
import { WhatsappOptOutError } from "../modules/whatsapp/bajas.js";
import { enviarMensajeAlCliente } from "../modules/whatsapp/mensajesCliente.js";

export async function processSendWhatsappJob(
  data: SendWhatsappJob
): Promise<void> {
  // Forma por propósito (PR 4): el job relee la reserva o el lead y elige
  // la plantilla aprobada en el momento del envío.
  if (esJobPorProposito(data)) {
    return enviarMensajeAlCliente(data);
  }

  const { toNumber, templateName, languageCode, bodyParams } = data;
  // Una fila `failed` que Telnyx nunca aceptó se vuelve a reclamar: si no,
  // el reintento de Cloud Tasks encontraba la clave y no reenviaba nada.
  if (
    !(await reclamarEnvio("whatsapp", data.idempotencyKey, undefined, {
      reintentarFallidos: true,
    }))
  ) {
    return;
  }
  console.log(
    `[Job] Enviando WhatsApp (plantilla "${templateName}") a ${toNumber}`
  );

  // Sale por el número de la audiencia (clientes por defecto) y, si la
  // plantilla está en WhatsappTemplate aprobada, por template_id; si no,
  // por nombre + idioma como hasta ahora.
  try {
    await enviarPlantilla({
      audience: data.audience ?? "client",
      to: toNumber,
      template: { name: templateName, language: languageCode },
      bodyParams,
      businessId: data.businessId,
      idempotencyKey: data.idempotencyKey,
    });
  } catch (error) {
    // El número pidió la baja: no es un fallo que reintentar. La fila
    // reclamada ya quedó marcada como suprimida por el servicio.
    if (
      error instanceof WhatsappOptOutError ||
      (error as { code?: unknown })?.code === "WHATSAPP_OPT_OUT"
    ) {
      console.log(
        `[Job] WhatsApp a ${toNumber} descartado: el número pidió la baja (${data.audience ?? "client"})`
      );
      return;
    }
    if (data.idempotencyKey) {
      await prisma.sentMessage
        .updateMany({
          where: {
            channel: "whatsapp",
            idempotencyKey: data.idempotencyKey,
            providerMessageId: null,
          },
          data: {
            deliveryStatus: "failed",
            errorCode: "SEND_ERROR",
            errorDetail: errorMessage(error),
          },
        })
        .catch((marcaError: unknown) => {
          console.error(
            `[Job] No se pudo marcar como fallido el WhatsApp ${data.idempotencyKey}: ${errorMessage(marcaError)}`
          );
        });
    }
    throw error;
  }
}
