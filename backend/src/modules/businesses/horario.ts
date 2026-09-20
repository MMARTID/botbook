import { prisma } from "../../lib/prisma.js";
import { invalidarCacheDeVoz } from "../../lib/voiceConfigCache.js";
import { syncAgentToRetell } from "../../lib/agentBootstrap.js";
import { syncAgentToTelnyx } from "../../lib/telnyxAgentSync.js";
import { calendarService } from "../calendar/service.js";
import { errorMessage } from "../../lib/logUtils.js";
import type { BusinessSchedule } from "../../lib/businessSchedule.js";

/**
 * Guarda el horario del negocio y propaga el cambio exactamente como hace
 * `PATCH /business/me` con `schedule` (modules/businesses/routes.ts): el
 * prompt gestionado lleva el horario en un bloque estable (resync de la
 * recepcionista en Retell y Telnyx), las tools de calendario se vuelven a
 * registrar y la caché de voz se invalida para que la próxima llamada lea
 * el horario nuevo. Lo usa el Gestor (fase 2: `fijar_horario`, `cerrar_dia`);
 * el PATCH del panel mantiene su propio camino porque mezcla varios campos
 * en un único update.
 */
export async function guardarHorarioDelNegocio(
  businessId: string,
  schedule: BusinessSchedule
): Promise<{ sincronizado: boolean }> {
  await prisma.business.update({
    where: { id: businessId },
    data: { schedule },
  });
  // La caché de voz primero: es lo que lee la próxima llamada, y no depende
  // de ningún proveedor. Las sincronizaciones con Retell/Telnyx pueden
  // lanzar (syncAgentToRetell lo hace si la publicación falla); el horario
  // ya está guardado, así que se registra alto y el reconciliador lo repara.
  await invalidarCacheDeVoz(businessId);
  try {
    // Telnyx es el orquestador de todos los negocios: va primero, para que un
    // fallo de Retell (que lanza) no lo deje sin sincronizar.
    await syncAgentToTelnyx(businessId);
    await syncAgentToRetell(businessId);
    await calendarService.syncCalendarToolsToAgents(businessId);
    return { sincronizado: true };
  } catch (error) {
    console.error(
      `[Business] Horario del negocio ${businessId} guardado pero la recepcionista no se pudo sincronizar (lo repara el reconciliador): ${errorMessage(error)}`
    );
    return { sincronizado: false };
  }
}
