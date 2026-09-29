import { prisma } from "../../lib/prisma.js";
import { invalidarCacheDeVoz } from "../../lib/voiceConfigCache.js";
import { syncAgentToRetell } from "../../lib/agentBootstrap.js";
import { syncAgentToTelnyx } from "../../lib/telnyxAgentSync.js";
import { errorMessage } from "../../lib/logUtils.js";

/**
 * Guarda la «Información del negocio» (`businessDetails`: lo que la
 * recepcionista usa para dudas de pagos, cómo llegar o políticas) y la
 * propaga como `PATCH /business/me` con `businessDetails`
 * (modules/businesses/routes.ts): va en el prompt gestionado, así que se
 * resincroniza la recepcionista en Telnyx y Retell, y se invalida la caché
 * de voz. Lo usa el Gestor (`actualizar_informacion`); el PATCH del panel
 * mantiene su propio camino porque mezcla varios campos en un único update.
 *
 * Escritura optimista: solo guarda si el texto sigue siendo `esperado` (el
 * que se leyó para calcular el nuevo). Si el dueño lo ha cambiado desde el
 * panel entretanto, devuelve `guardado: false` sin pisar nada.
 */
export async function guardarInformacionDelNegocio(
  businessId: string,
  cambio: { esperado: string | null; nuevo: string | null }
): Promise<{ guardado: boolean; sincronizado: boolean }> {
  const escrito = await prisma.business.updateMany({
    where: { id: businessId, businessDetails: cambio.esperado },
    data: { businessDetails: cambio.nuevo },
  });
  if (escrito.count === 0) {
    return { guardado: false, sincronizado: false };
  }
  // Como en guardarHorarioDelNegocio: la caché primero, porque no depende de
  // ningún proveedor; syncAgentToRetell lanza si la publicación falla, y el
  // texto ya está guardado, así que se registra alto y el reconciliador lo
  // repara.
  await invalidarCacheDeVoz(businessId);
  try {
    // Telnyx es el orquestador de todos los negocios: va primero, para que un
    // fallo de Retell (que lanza) no lo deje sin sincronizar.
    await syncAgentToTelnyx(businessId);
    await syncAgentToRetell(businessId);
    return { guardado: true, sincronizado: true };
  } catch (error) {
    console.error(
      `[Business] Información del negocio ${businessId} guardada pero la recepcionista no se pudo sincronizar (lo repara el reconciliador): ${errorMessage(error)}`
    );
    return { guardado: true, sincronizado: false };
  }
}
