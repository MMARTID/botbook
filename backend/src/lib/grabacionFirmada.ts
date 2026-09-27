import { getSignedRecordingUrl } from "./storage.js";

/**
 * El bucket de R2 es privado — el storageUrl guardado en BD es una URL de API
 * S3 sin firmar, no reproducible. Antes de responder al frontend lo
 * sustituimos por una URL firmada temporal generada a partir de storageKey.
 * Si falla la firma, no rompemos la respuesta: cae a null, y el frontend ya
 * sabe usar externalUrl como alternativa.
 *
 * Compartido por recordings/routes.ts y calls/routes.ts (hallazgo #15 de la
 * auditoría: sin firmar, el audio dejaba de reproducirse en cuanto la
 * grabación ya estaba copiada a R2).
 */
export async function conUrlDeGrabacionFirmada<
  T extends { storageKey: string | null; storageUrl: string | null },
>(grabacion: T, modulo: string): Promise<T> {
  if (!grabacion.storageKey) {
    return grabacion;
  }
  try {
    const storageUrl = await getSignedRecordingUrl(grabacion.storageKey);
    return { ...grabacion, storageUrl };
  } catch (error) {
    console.error(
      `[${modulo}] No se pudo generar la URL firmada de la grabación:`,
      error
    );
    return { ...grabacion, storageUrl: null };
  }
}
