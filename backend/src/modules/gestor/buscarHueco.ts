import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import {
  checkAvailability,
  computeAvailabilityLookaheadMs,
} from "../../lib/availability.js";
import { checkBusinessHours } from "../../lib/businessSchedule.js";
import { calendarService } from "../calendar/service.js";
import {
  SELECT_CONEXION_DE_CALENDARIO,
  conexionOperativa,
  origenDeCalendario,
  resolverConexionDeCalendario,
  usaCalendarioExterno,
} from "../calendar/conexion.js";
import { formatearCita } from "../whatsapp/avisosNegocio.js";
import { instanteLocal } from "./accionesAgenda.js";

/**
 * Tool `buscar_hueco` del Gestor (fase 2 / PR 4): «¿a qué hora tiene hueco
 * Laura el jueves?». Comprueba la hora pedida con la misma disponibilidad
 * real que la recepcionista (horario, citas, calendario conectado,
 * ausencias) y, si no está libre, devuelve el hueco más cercano. Solo lee:
 * apuntar la cita sigue siendo una propuesta (`añadir_cita`).
 */
export async function buscarHueco(
  businessId: string,
  params: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      timezone: true,
      schedule: true,
      bookingCapacity: true,
      ...SELECT_CONEXION_DE_CALENDARIO,
    },
  });
  if (!business) {
    return { status: 404, body: { error: "Negocio no encontrado" } };
  }
  const timezone = business.timezone || "Europe/Madrid";
  const fechaHora =
    typeof params.fechaHora === "string" ? params.fechaHora.trim() : "";
  const m = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(fechaHora);
  if (!m) {
    return {
      status: 200,
      body: {
        error:
          'fechaHora no válida: usa "AAAA-MM-DDTHH:MM" en hora local del negocio.',
      },
    };
  }
  const start = instanteLocal(timezone, m[1], `${m[2]}:${m[3]}`);
  const duracionPedida = Number(params.duracionMinutos);
  const durationMinutes =
    Number.isFinite(duracionPedida) && duracionPedida >= 5
      ? Math.min(480, Math.round(duracionPedida))
      : 30;
  const professionalId =
    typeof params.profesionalId === "string" && params.profesionalId.trim()
      ? params.profesionalId.trim()
      : null;
  const serviceIds = Array.isArray(params.servicioIds)
    ? params.servicioIds.filter((x): x is string => typeof x === "string")
    : [];

  const horario = checkBusinessHours(
    business.schedule,
    timezone,
    start.toISOString(),
    durationMinutes
  );
  if (!horario.success) {
    return {
      status: 200,
      body: { libre: false, motivo: "El horario semanal no está fijado." },
    };
  }
  const conexion = resolverConexionDeCalendario(business);
  let externalBusyIntervals = undefined;
  let calendarAvailabilityKnown = false;
  if (conexionOperativa(conexion) && usaCalendarioExterno(conexion)) {
    try {
      const result = await calendarService.getBusyIntervals({
        conexion,
        timeMin: start,
        timeMax: new Date(
          start.getTime() + computeAvailabilityLookaheadMs(durationMinutes)
        ),
      });
      if (!Array.isArray(result)) {
        externalBusyIntervals = result.intervals;
        calendarAvailabilityKnown = result.calendarAvailabilityKnown;
      }
    } catch (error) {
      console.error(
        `[Gestor] buscar_hueco del negocio ${businessId}: no se pudo leer el calendario ${conexion.provider}: ${errorMessage(error)}`
      );
    }
  }
  const r = await checkAvailability({
    businessId,
    schedule: business.schedule,
    timezone,
    bookingCapacity: business.bookingCapacity,
    startDateTime: start.toISOString(),
    durationMinutes,
    serviceIds,
    professionalId,
    externalBusyIntervals,
    calendarAvailabilityKnown,
    calendarOrigin: origenDeCalendario(conexion),
  });
  const calendarioLeido =
    !usaCalendarioExterno(conexion) || calendarAvailabilityKnown;
  if (r.available) {
    return {
      status: 200,
      body: {
        libre: true,
        cuando: formatearCita(start, timezone),
        profesionalesLibres: r.availableProfessionals.map((p) => ({
          profesionalId: p.id,
          nombre: p.name,
        })),
        calendarioComprobado: calendarioLeido,
      },
    };
  }
  const siguiente = "suggestedNextSlot" in r ? r.suggestedNextSlot : null;
  return {
    status: 200,
    body: {
      libre: false,
      motivo: r.message,
      huecoMasCercano: siguiente
        ? {
            fechaHora: fechaHoraLocal(
              new Date(siguiente.startDateTime),
              timezone
            ),
            cuando: formatearCita(new Date(siguiente.startDateTime), timezone),
            profesionalesLibres: siguiente.availableProfessionals.map((p) => ({
              profesionalId: p.id,
              nombre: p.name,
            })),
          }
        : null,
      calendarioComprobado: calendarioLeido,
    },
  };
}

/** «AAAA-MM-DDTHH:MM» en la zona del negocio, para volver a pasarla a
 * `añadir_cita` tal cual. */
function fechaHoraLocal(fecha: Date, timezone: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(fecha);
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "00";
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour") === "24" ? "00" : v("hour")}:${v("minute")}`;
}
