import { prisma } from "../lib/prisma.js";
import { deleteStorageObject } from "../lib/storage.js";
import { errorMessage } from "../lib/logUtils.js";

/**
 * Días que se conserva el audio de una llamada. El mismo valor que se le
 * pide a Retell (dataStorageRetentionDays) y a Telnyx, para que no haya un
 * sitio donde la grabación viva más de lo que el negocio y el cliente
 * esperan. RGPD: sin purga, el audio y su transcripción se quedaban en R2 y
 * en Postgres indefinidamente, incluso después de que el panel los "borrara"
 * (el borrado del panel solo marcaba deletedAt).
 */
export function diasDeRetencionDeAudio(): number {
  // Se lee en cada ejecución y se valida: un 0 o un negativo borraría de
  // golpe todo el audio de R2, y un valor que no es un número dejaba la fecha
  // límite en NaN y rompía la consulta. Mejor que el job falle y se vea.
  const configurado = process.env.RECORDING_RETENTION_DAYS;
  const dias = Number(configurado || 30);
  if (!Number.isInteger(dias) || dias < 1) {
    throw new Error(
      `RECORDING_RETENTION_DAYS no es un plazo válido: ${configurado}`
    );
  }
  return dias;
}
/** Un borrado lógico se purga antes: el negocio ya dijo que no lo quiere. */
const DELETED_GRACE_DAYS = 7;
const BATCH_SIZE = 100;

export async function purgeOldRecordingsJob(): Promise<{
  purged: number;
  failed: number;
}> {
  const retencion = diasDeRetencionDeAudio();
  const ahora = Date.now();
  const limitePorAntiguedad = new Date(ahora - retencion * 24 * 60 * 60 * 1000);
  const limitePorBorrado = new Date(ahora - DELETED_GRACE_DAYS * 24 * 60 * 60 * 1000);

  let purged = 0;
  let failed = 0;
  // Las que fallan se quedan fuera de los lotes siguientes de esta pasada: si
  // no, el mismo lote volvía a salir una y otra vez y, con R2 caído, el job no
  // terminaba nunca. Se reintentan en la próxima ejecución.
  const fallidas: string[] = [];

  for (;;) {
    const recordings = await prisma.recording.findMany({
      where: {
        storageKey: { not: null },
        ...(fallidas.length ? { id: { notIn: fallidas } } : {}),
        OR: [
          { createdAt: { lt: limitePorAntiguedad } },
          { deletedAt: { lt: limitePorBorrado } },
        ],
      },
      select: { id: true, callId: true, storageKey: true },
      take: BATCH_SIZE,
      orderBy: { createdAt: "asc" },
    });
    if (recordings.length === 0) break;

    let purgadasEnEsteLote = 0;
    for (const recording of recordings) {
      try {
        await deleteStorageObject(recording.storageKey!);
        // La fila se conserva (el historial de llamadas sigue teniendo
        // sentido sin el audio), pero sin rastro de dónde estaba el fichero
        // ni URL del proveedor: nada que permita recuperarlo.
        await prisma.recording.update({
          where: { id: recording.id },
          data: {
            storageKey: null,
            storageUrl: null,
            externalUrl: "",
            deletedAt: new Date(),
          },
        });
        purged += 1;
        purgadasEnEsteLote += 1;
      } catch (error) {
        failed += 1;
        fallidas.push(recording.id);
        console.error(
          `[Job] No se pudo purgar la grabación ${recording.id}: ${errorMessage(error)}`
        );
      }
    }

    if (recordings.length < BATCH_SIZE) break;
    // Un lote entero fallido apunta a R2 o a las credenciales, no a una
    // grabación concreta: no tiene sentido seguir.
    if (purgadasEnEsteLote === 0) break;
  }

  console.log(
    `[Job] Purga de grabaciones: ${purged} borradas, ${failed} con error (retención ${retencion} días)`
  );
  return { purged, failed };
}
