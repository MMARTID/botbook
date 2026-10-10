import { getRedis } from "./redis.js";

/** Clave Redis de la configuración de voz de un negocio
 * (voiceTools/service.ts la cachea hasta 1h). Única definición: antes había
 * cuatro copias del literal repartidas por calendar, voiceTools, el job de
 * reintentos y businesses/routes. */
export function claveDeCacheDeVoz(businessId: string): string {
  return `voice_config:${businessId}`;
}

/** voice_config:<businessId> cachea calendarProvider y las credenciales de
 * calendario hasta 1h — sin invalidar aquí, una llamada de voz dentro de esa
 * hora sigue usando el proveedor o la cuenta anteriores aunque el panel ya
 * muestre la nueva conexión (hallazgo #8 de la auditoría). Se llama tras
 * cualquier escritura que toque calendarProvider/refreshToken/calendarId o
 * cualquier otro campo cacheado de un negocio. Best-effort: un fallo de
 * Redis nunca tumba la operación que la invocó.
 *
 * Es el único sitio que BORRA la clave (también lo usan bookings, phone y
 * getCachedVoiceConfig de voiceTools al descartar una entrada rota). La
 * lectura y la escritura siguen en voiceTools/service.ts
 * (getCachedVoiceConfig/setCachedVoiceConfig); cuando se retire Redis, la
 * caché desaparece entera y la voz leerá siempre de la BD.
 *
 * `prefijoDeLog` es el módulo que firma el log si el borrado falla: phone,
 * bookings y voiceTools pasan el suyo para que su fallo se siga buscando
 * por el prefijo de siempre. */
export async function invalidarCacheDeVoz(
  businessId: string,
  prefijoDeLog = "[Calendar]"
): Promise<void> {
  try {
    await getRedis().del(claveDeCacheDeVoz(businessId));
  } catch (err) {
    console.error(
      `${prefijoDeLog} No se pudo invalidar la caché de configuración de voz para ${businessId}:`,
      err
    );
  }
}
