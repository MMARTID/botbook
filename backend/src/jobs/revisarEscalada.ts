import type { RevisarEscaladaJob } from "../lib/jobTypes.js";
import { revisarEscaladaSinRecado } from "../modules/whatsapp/recados.js";

/** Revisión diferida de una escalada por fallo técnico sin recado (ver
 * revisarEscaladaSinRecado). Lanza si hay que reintentarla. */
export async function processRevisarEscaladaJob(
  data: RevisarEscaladaJob
): Promise<void> {
  await revisarEscaladaSinRecado(data.callId, data.intento ?? 1);
}
