import { prisma } from "../lib/prisma.js";
import { errorMessage } from "../lib/logUtils.js";
import type { RecordarRecadoJob } from "../lib/jobTypes.js";
import { avisarRecado } from "../modules/whatsapp/avisosNegocio.js";

/** Como mucho tres recordatorios por recado: después queda solo en el panel. */
const MAX_RECORDATORIOS = 3;

/**
 * «Recuérdamelo mañana» (aviso #2, PLAN-CANAL-DUENO.md § 4): a la hora
 * programada vuelve a avisar del recado si sigue sin atender. Sin email de
 * respaldo (el dueño ya pidió el recordatorio por WhatsApp; si no es posible,
 * el recado sigue en el panel). Nunca lanza por un aviso que no sale.
 */
export async function processRecordarRecadoJob(
  data: RecordarRecadoJob
): Promise<void> {
  const intento = data.intento ?? 1;
  const lead = await prisma.lead.findUnique({
    where: { id: data.leadId },
    select: {
      id: true,
      type: true,
      resolvedAt: true,
      data: true,
      call: { select: { business: { select: { id: true, name: true } } } },
    },
  });
  if (!lead || lead.type !== "message") {
    console.log(
      `[Job] Recordatorio del recado ${data.leadId}: no existe; se ignora`
    );
    return;
  }
  if (lead.resolvedAt) {
    console.log(
      `[Job] Recordatorio del recado ${lead.id}: ya atendido; se ignora`
    );
    return;
  }
  if (intento > MAX_RECORDATORIOS) {
    console.log(
      `[Job] Recordatorio del recado ${lead.id}: tope de ${MAX_RECORDATORIOS} alcanzado`
    );
    return;
  }
  const datos = (lead.data ?? {}) as {
    clientName?: string | null;
    clientPhone?: string | null;
    motivo?: string;
    quiereQueLeLlamen?: boolean;
  };
  try {
    const resultado = await avisarRecado({
      businessId: lead.call.business.id,
      businessName: lead.call.business.name,
      leadId: lead.id,
      clientName: datos.clientName ?? null,
      clientPhone: datos.clientPhone ?? null,
      motivo: datos.motivo ?? "",
      quiereQueLeLlamen: datos.quiereQueLeLlamen === true,
      intento,
    });
    console.log(
      `[Job] Recordatorio ${intento} del recado ${lead.id} (negocio ${lead.call.business.id}): ${resultado.via}${resultado.motivo ? ` (${resultado.motivo})` : ""}`
    );
  } catch (error) {
    console.error(
      `[Job] Recordatorio del recado ${lead.id} falló: ${errorMessage(error)}`
    );
  }
}
