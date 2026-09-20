import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import { isValidE164Phone } from "../../lib/phone.js";
import { ESTADOS_DE_SUSCRIPCION_BLOQUEADOS } from "../../lib/planFeatures.js";
import {
  acquireBookingLock,
  releaseBookingLock,
} from "../../lib/bookingLock.js";
import { buildCalendarIdempotencyKey } from "../../lib/calendarIdempotency.js";
import {
  checkAvailability,
  computeAvailabilityLookaheadMs,
  type AvailabilityResult,
  type ExternalBusyInterval,
} from "../../lib/availability.js";
import {
  BusinessScheduleSchema,
  checkBookingRestrictions,
  checkBusinessHours,
  type BusinessSchedule,
} from "../../lib/businessSchedule.js";
import { timezoneOffsetMinutes } from "../../lib/voiceDateTime.js";
import { calendarService } from "../calendar/service.js";
import {
  SELECT_CONEXION_DE_CALENDARIO,
  conexionOperativa,
  marcarCalendarioDesconectado,
  origenDeCalendario,
  resolverConexionDeCalendario,
  usaCalendarioExterno,
  type ConexionResuelta,
} from "../calendar/conexion.js";
import { proveedorDesdeErrorDeReconexion } from "../../adapters/calendar/errors.js";
import { normalizarProveedorDeCalendario } from "../../adapters/calendar/CalendarProvider.js";
import { cancelarReserva } from "../bookings/cancelacion.js";
import { estaDadoDeBaja } from "../whatsapp/bajas.js";
import { guardarHorarioDelNegocio } from "../businesses/horario.js";
import { formatearCita, nombreDeServicios } from "../whatsapp/avisosNegocio.js";
import {
  programarAvisoAlCliente,
  programarMensajesAlCliente,
  sanearNombre,
} from "../whatsapp/mensajesCliente.js";
import type {
  AccionDelGestor,
  ContextoDeAccion,
  ResultadoDeComprobacion,
  ResultadoDeEjecucion,
} from "./acciones.js";

/**
 * Acciones de agenda del Gestor (PLAN-CANAL-DUENO.md § 8, «Gestión de la
 * agenda»), fase 2 / PR 4: añadir, mover y cancelar citas en nombre de un
 * cliente, avisarle por WhatsApp, marcar ausencias de una persona del equipo
 * y bloquear tramos del negocio. Mismo registro que el catálogo: el LLM
 * PROPONE con `proponer_accion`, el botón «Confirmar» ejecuta.
 *
 * Una cita creada desde aquí cuelga de una Call sintética
 * (`whatsapp:gestor:<accionId>`, `voiceProvider: "whatsapp"`), como las de la
 * lista de espera, y sigue el mismo camino que cualquier reserva: evento en
 * el calendario conectado (nunca a ciegas), `Booking` con `createdVia:
 * "owner_chat"`, recordatorio al cliente si el plan lo admite. La
 * confirmación al cliente NO sale sola: tras «Hecho», el sistema pregunta al
 * dueño «¿Le mando la confirmación?» con botones (`siguiente` del
 * resultado), que es otra propuesta (`avisar_cliente`).
 *
 * Los cierres del negocio entero no son una tabla nueva: `bloquear_franja`
 * escribe una excepción del horario con horario especial para ese día (lo
 * que el panel ya sabe pintar y `checkBusinessHours`, `get_catalog` y la
 * sincronización de la recepcionista ya respetan). Las ausencias sí son
 * tabla (`ProfessionalAbsence`): son de una persona, no del negocio.
 */

const Id = z.string().trim().min(1).max(80);
const Nombre = z.string().trim().min(1).max(80);
/** Hora local del negocio, sin zona: el LLM no la tiene que convertir. */
const FechaHoraLocal = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/,
    'Fecha y hora en formato "AAAA-MM-DDTHH:MM" (hora local del negocio)'
  );
const Fecha = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe usar el formato AAAA-MM-DD")
  .refine((f) => fechaExiste(f), "Esa fecha no existe");
const Hora = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora en formato HH:MM");
const Telefono = z
  .string()
  .trim()
  .transform((t) => t.replace(/[\s.-]/g, ""))
  .refine(
    (t) => isValidE164Phone(t),
    "Teléfono en formato internacional (+34…)"
  );
const Duracion = z.number().int().min(5).max(480);

const MAX_DIAS_DE_AUSENCIA = 62;
const MAX_EXCEPCIONES = 120;

function fechaExiste(f: string): boolean {
  const [y, m, d] = f.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** Instante UTC de una hora de pared en la zona del negocio (dos pasadas
 * por el cambio de hora, como `wallTimeToInstant` en voiceDateTime.ts). */
export function instanteLocal(
  timezone: string,
  fecha: string,
  hora: string
): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  const zona = timezone || "Europe/Madrid";
  const supuesto = Date.UTC(y, m - 1, d, hh, mm);
  const primero =
    supuesto - timezoneOffsetMinutes(new Date(supuesto), zona) * 60_000;
  const segundo = timezoneOffsetMinutes(new Date(primero), zona);
  return new Date(
    segundo === timezoneOffsetMinutes(new Date(supuesto), zona)
      ? primero
      : supuesto - segundo * 60_000
  );
}

function fechaLocal(fecha: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

function diasEntre(desde: string, hasta: string): number {
  const a = new Date(`${desde}T00:00:00Z`).getTime();
  const b = new Date(`${hasta}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function fechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function listar(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Al dueño solo le llega texto humano; el error crudo va al log. */
function mensajeDeError(
  error: unknown,
  accion: string,
  businessId: string
): string {
  console.error(
    `[Gestor] ${accion} del negocio ${businessId} falló: ${errorMessage(error)}`
  );
  return "ha fallado algo por nuestra parte; inténtalo en un rato o hazlo desde el panel";
}

// ---------------------------------------------------------------------------
// Resolución de servicios, profesionales y citas
// ---------------------------------------------------------------------------

function buscar<T extends { id: string; name: string }>(
  candidatos: T[],
  referencia: string
): { encontrado: T | null; ambiguo: boolean } {
  const ref = referencia.trim();
  const porId = candidatos.find((c) => c.id === ref);
  if (porId) return { encontrado: porId, ambiguo: false };
  const objetivo = normalizar(ref);
  const porNombre = candidatos.filter((c) => normalizar(c.name) === objetivo);
  if (porNombre.length === 1)
    return { encontrado: porNombre[0], ambiguo: false };
  return { encontrado: null, ambiguo: porNombre.length > 1 };
}

function motivoNoEncontrado(
  tipo: "servicio" | "profesional",
  referencia: string,
  ambiguo: boolean
): string {
  if (ambiguo) {
    return tipo === "servicio"
      ? `Hay más de un servicio llamado «${referencia}»: usa su id de contexto_negocio para saber cuál.`
      : `Hay más de una persona llamada «${referencia}» en el equipo: usa su id de contexto_negocio para saber cuál.`;
  }
  return tipo === "servicio"
    ? `No encuentro el servicio «${referencia}» en este negocio.`
    : `No encuentro a «${referencia}» en el equipo.`;
}

async function serviciosActivos(businessId: string) {
  return prisma.service.findMany({
    where: { businessId, active: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, durationMinutes: true },
  });
}

async function profesionalesActivos(businessId: string) {
  return prisma.professional.findMany({
    where: { businessId, active: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

async function resolverServicios(
  businessId: string,
  referencias: string[]
): Promise<
  | {
      ok: true;
      servicios: Array<{ id: string; name: string; durationMinutes: number }>;
    }
  | { ok: false; motivo: string }
> {
  const activos = await serviciosActivos(businessId);
  const servicios: Array<{
    id: string;
    name: string;
    durationMinutes: number;
  }> = [];
  for (const ref of referencias) {
    const { encontrado, ambiguo } = buscar(activos, ref);
    if (!encontrado) {
      return {
        ok: false,
        motivo: motivoNoEncontrado("servicio", ref, ambiguo),
      };
    }
    if (!servicios.some((s) => s.id === encontrado.id)) {
      servicios.push(encontrado);
    }
  }
  return { ok: true, servicios };
}

async function resolverProfesional(
  businessId: string,
  referencia: string
): Promise<
  | { ok: true; profesional: { id: string; name: string } }
  | { ok: false; motivo: string }
> {
  const { encontrado, ambiguo } = buscar(
    await profesionalesActivos(businessId),
    referencia
  );
  return encontrado
    ? { ok: true, profesional: encontrado }
    : {
        ok: false,
        motivo: motivoNoEncontrado("profesional", referencia, ambiguo),
      };
}

const SELECT_CITA = {
  id: true,
  callId: true,
  programedAt: true,
  durationMinutes: true,
  clientName: true,
  clientPhone: true,
  serviceIds: true,
  professionalId: true,
  isCancelled: true,
  smsConsent: true,
  externalEventId: true,
  externalCalendarProvider: true,
  externalCalendarId: true,
  professional: { select: { id: true, name: true } },
  call: { select: { fromNumber: true } },
} as const;

type Cita = Prisma.BookingGetPayload<{ select: typeof SELECT_CITA }>;

async function citaDelNegocio(
  businessId: string,
  citaId: string
): Promise<Cita | null> {
  return prisma.booking.findFirst({
    where: { id: citaId, call: { businessId } },
    select: SELECT_CITA,
  });
}

function telefonoDeLaCita(cita: Cita): string | null {
  return cita.clientPhone ?? cita.call.fromNumber;
}

async function describirCita(cita: Cita, timezone: string): Promise<string> {
  const cliente = cita.clientName?.trim() || "un cliente";
  const servicios = await nombreDeServicios(cita.serviceIds);
  const servicio = servicios.length ? ` (${listar(servicios)})` : "";
  const con = cita.professional ? ` con ${cita.professional.name}` : "";
  return `la cita de ${cliente} del ${formatearCita(cita.programedAt, timezone)}${servicio}${con}`;
}

// ---------------------------------------------------------------------------
// Negocio, calendario y disponibilidad (misma receta que la lista de espera)
// ---------------------------------------------------------------------------

const SELECT_NEGOCIO_AGENDA = {
  name: true,
  schedule: true,
  timezone: true,
  bookingCapacity: true,
  minAdvanceBookingMinutes: true,
  maxAppointmentDurationMinutes: true,
  subscriptionStatus: true,
  active: true,
  ...SELECT_CONEXION_DE_CALENDARIO,
} as const satisfies Prisma.BusinessSelect;

type NegocioAgenda = Prisma.BusinessGetPayload<{
  select: typeof SELECT_NEGOCIO_AGENDA;
}>;

async function negocioParaReservar(
  businessId: string
): Promise<
  | { ok: true; business: NegocioAgenda; conexion: ConexionResuelta }
  | { ok: false; motivo: string }
> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: SELECT_NEGOCIO_AGENDA,
  });
  if (!business || !business.active) {
    return { ok: false, motivo: "El negocio no está activo." };
  }
  if (
    business.subscriptionStatus &&
    ESTADOS_DE_SUSCRIPCION_BLOQUEADOS.has(business.subscriptionStatus)
  ) {
    return {
      ok: false,
      motivo:
        "La suscripción no está al día: hasta que se regularice desde el panel no se pueden apuntar citas.",
    };
  }
  const conexion = resolverConexionDeCalendario(business);
  if (!conexionOperativa(conexion)) {
    // Nunca se reserva a ciegas (auditoría de septiembre): sin calendario
    // operativo, la cita se hace desde el panel cuando esté conectado.
    return {
      ok: false,
      motivo:
        "El calendario no está conectado (o hay que volver a conectarlo): sin él no puedo apuntar citas. Se conecta desde el panel, con el enlace de contexto_negocio.",
    };
  }
  return { ok: true, business, conexion };
}

async function ocupacionExterna(
  conexion: ConexionResuelta,
  start: Date,
  durationMinutes: number
): Promise<{
  intervals: ExternalBusyInterval[];
  calendarAvailabilityKnown: boolean;
}> {
  const result = await calendarService.getBusyIntervals({
    conexion,
    timeMin: start,
    timeMax: new Date(
      start.getTime() + computeAvailabilityLookaheadMs(durationMinutes)
    ),
  });
  return Array.isArray(result)
    ? { intervals: result, calendarAvailabilityKnown: false }
    : result;
}

/** Horario, restricciones y disponibilidad real para una hora concreta.
 * Devuelve el motivo en palabras del dueño (con la alternativa más cercana
 * si la hay) o la disponibilidad. */
async function comprobarHueco(input: {
  business: NegocioAgenda;
  conexion: ConexionResuelta;
  start: Date;
  durationMinutes: number;
  serviceIds: string[];
  professionalId: string | null;
  excluir?: { bookingId: string; externalEventId: string | null } | null;
}): Promise<
  | {
      ok: true;
      disponibilidad: Extract<AvailabilityResult, { available: true }>;
    }
  | { ok: false; motivo: string }
> {
  const { business, conexion, start, durationMinutes } = input;
  const timezone = business.timezone || "Europe/Madrid";
  const iso = start.toISOString();
  const horario = checkBusinessHours(
    business.schedule,
    timezone,
    iso,
    durationMinutes
  );
  if (!horario.success) {
    return { ok: false, motivo: "Primero hay que fijar el horario semanal." };
  }
  if (!horario.isOpen) {
    return {
      ok: false,
      motivo: `El negocio está cerrado el ${formatearCita(start, timezone)}${horario.message ? ` (${horario.message})` : ""}.`,
    };
  }
  const restricciones = checkBookingRestrictions(
    business,
    iso,
    durationMinutes
  );
  if (!restricciones.success) {
    return { ok: false, motivo: restricciones.message };
  }
  const externo = await ocupacionExterna(conexion, start, durationMinutes);
  if (usaCalendarioExterno(conexion) && !externo.calendarAvailabilityKnown) {
    return {
      ok: false,
      motivo:
        "Ahora mismo no puedo leer el calendario del negocio; sin verlo no apunto nada. Inténtalo en un rato.",
    };
  }
  const disponibilidad = await checkAvailability({
    businessId: business.id,
    schedule: business.schedule,
    timezone,
    bookingCapacity: business.bookingCapacity,
    startDateTime: iso,
    durationMinutes,
    serviceIds: input.serviceIds,
    professionalId: input.professionalId,
    externalBusyIntervals: externo.intervals,
    calendarAvailabilityKnown: externo.calendarAvailabilityKnown,
    calendarOrigin: origenDeCalendario(conexion),
    excluir: input.excluir ?? null,
  });
  if (disponibilidad.available) {
    return { ok: true, disponibilidad };
  }
  const alternativa =
    "suggestedNextSlot" in disponibilidad && disponibilidad.suggestedNextSlot
      ? ` El hueco libre más cercano es el ${formatearCita(new Date(disponibilidad.suggestedNextSlot.startDateTime), timezone)}${
          disponibilidad.suggestedNextSlot.availableProfessionals[0]
            ? ` con ${disponibilidad.suggestedNextSlot.availableProfessionals[0].name}`
            : ""
        }.`
      : "";
  return { ok: false, motivo: `${disponibilidad.message}${alternativa}` };
}

function callIdSintetico(accionId: string): string {
  return `whatsapp:gestor:${accionId}`;
}

// ---------------------------------------------------------------------------
// añadir_cita
// ---------------------------------------------------------------------------

const AnadirCitaParams = z
  .object({
    cliente: Nombre,
    telefono: Telefono.optional(),
    fechaHora: FechaHoraLocal,
    servicios: z.array(Id).min(1).max(5),
    profesional: Id.optional(),
    duracionMinutos: Duracion.optional(),
  })
  .strict();

type AnadirCita = z.infer<typeof AnadirCitaParams>;

function inicioDe(params: { fechaHora: string }, timezone: string): Date {
  const [fecha, hora] = params.fechaHora.split("T");
  return instanteLocal(timezone, fecha, hora);
}

async function prepararCita(
  ctx: ContextoDeAccion,
  params: Pick<AnadirCita, "servicios" | "profesional" | "duracionMinutos">
): Promise<
  | {
      ok: true;
      servicios: Array<{ id: string; name: string; durationMinutes: number }>;
      profesional: { id: string; name: string } | null;
      duracion: number;
    }
  | { ok: false; motivo: string }
> {
  const servicios = await resolverServicios(ctx.businessId, params.servicios);
  if (!servicios.ok) return servicios;
  let profesional: { id: string; name: string } | null = null;
  if (params.profesional) {
    const r = await resolverProfesional(ctx.businessId, params.profesional);
    if (!r.ok) return r;
    profesional = r.profesional;
  }
  const duracion =
    params.duracionMinutos ??
    servicios.servicios.reduce((total, s) => total + s.durationMinutes, 0);
  return { ok: true, servicios: servicios.servicios, profesional, duracion };
}

const anadirCita: AccionDelGestor<AnadirCita> = {
  schema: AnadirCitaParams,
  async comprobar(ctx, params): Promise<ResultadoDeComprobacion<AnadirCita>> {
    const negocio = await negocioParaReservar(ctx.businessId);
    if (!negocio.ok) return negocio;
    const prep = await prepararCita(ctx, params);
    if (!prep.ok) return prep;
    const start = inicioDe(params, ctx.timezone);
    if (start.getTime() < Date.now()) {
      return { ok: false, motivo: "Esa hora ya ha pasado." };
    }
    const hueco = await comprobarHueco({
      business: negocio.business,
      conexion: negocio.conexion,
      start,
      durationMinutes: prep.duracion,
      serviceIds: prep.servicios.map((s) => s.id),
      professionalId: prep.profesional?.id ?? null,
    });
    if (!hueco.ok) return hueco;
    const asignado =
      prep.profesional ??
      hueco.disponibilidad.availableProfessionals[0] ??
      null;
    return {
      ok: true,
      descripcion: `apuntar a ${params.cliente} el ${formatearCita(start, ctx.timezone)}, ${listar(prep.servicios.map((s) => s.name))} (${prep.duracion} min)${asignado ? ` con ${asignado.name}` : ""}`,
      parametros: {
        ...params,
        servicios: prep.servicios.map((s) => s.id),
        ...(prep.profesional ? { profesional: prep.profesional.id } : {}),
        duracionMinutos: prep.duracion,
      },
    };
  },
  async ejecutar(ctx, params, meta): Promise<ResultadoDeEjecucion> {
    const etiqueta = `añadir_cita ${meta.accionId}`;
    const negocio = await negocioParaReservar(ctx.businessId);
    if (!negocio.ok) return { ok: false, mensaje: negocio.motivo };
    const { business, conexion } = negocio;
    const prep = await prepararCita(ctx, params);
    if (!prep.ok) return { ok: false, mensaje: prep.motivo };
    const start = inicioDe(params, ctx.timezone);
    if (start.getTime() < Date.now()) {
      return { ok: false, mensaje: "Esa hora ya ha pasado." };
    }

    const lockToken = await acquireBookingLock(business.id);
    if (!lockToken) {
      return {
        ok: false,
        mensaje:
          "La agenda está ocupada ahora mismo con otra reserva. Espera un momento y vuelve a pedírmelo.",
      };
    }
    let eventoCreado: string | undefined;
    try {
      // La Call sintética es por acción: un segundo «Confirmar» sobre la
      // misma propuesta no llega aquí (reclamo atómico en decidirPropuesta).
      const previa = await prisma.call.findUnique({
        where: { callId: callIdSintetico(meta.accionId) },
        select: { booking: { select: { id: true, isCancelled: true } } },
      });
      if (previa?.booking && !previa.booking.isCancelled) {
        return { ok: false, mensaje: "Esa cita ya estaba apuntada." };
      }
      const hueco = await comprobarHueco({
        business,
        conexion,
        start,
        durationMinutes: prep.duracion,
        serviceIds: prep.servicios.map((s) => s.id),
        professionalId: prep.profesional?.id ?? null,
      });
      if (!hueco.ok) {
        return {
          ok: false,
          mensaje: `No he podido apuntarla: ${hueco.motivo}`,
        };
      }
      const asignado =
        prep.profesional ??
        hueco.disponibilidad.availableProfessionals[0] ??
        null;
      const serviceNames = prep.servicios.map((s) => s.name);
      const clientName = sanearNombre(params.cliente) ?? params.cliente;

      try {
        const evento = (await calendarService.bookAppointment({
          conexion,
          clientName,
          startDateTime: start.toISOString(),
          durationMinutes: prep.duracion,
          clientPhone: params.telefono ?? null,
          serviceNames,
          professionalName: asignado?.name,
          timezone: ctx.timezone,
          idempotencyKey: buildCalendarIdempotencyKey({
            callId: callIdSintetico(meta.accionId),
            startDateTime: start.toISOString(),
            durationMinutes: prep.duracion,
            distintivo: meta.inboundMessageId,
          }),
        })) as { id?: string } | undefined;
        eventoCreado = evento?.id;
      } catch (error) {
        const proveedorRoto = proveedorDesdeErrorDeReconexion(error);
        if (proveedorRoto) {
          await marcarCalendarioDesconectado(
            business.id,
            proveedorRoto,
            { modo: "revocar" },
            { prefijo: "[Gestor]" }
          );
          return {
            ok: false,
            mensaje:
              "El calendario ha dejado de responder y hay que volver a conectarlo desde el panel; no he apuntado la cita.",
          };
        }
        console.error(
          `[Gestor] ${etiqueta}: el calendario ${conexion.provider} del negocio ${business.id} no aceptó la cita: ${errorMessage(error)}`
        );
        return {
          ok: false,
          mensaje:
            "El calendario no ha aceptado la cita ahora mismo; no la he apuntado. Inténtalo en un rato.",
        };
      }

      const now = new Date();
      let bookingId: string;
      try {
        bookingId = await prisma.$transaction(async (tx) => {
          const llamada = await tx.call.upsert({
            where: { callId: callIdSintetico(meta.accionId) },
            create: {
              callId: callIdSintetico(meta.accionId),
              voiceProvider: "whatsapp",
              providerCallId: meta.accionId,
              businessId: business.id,
              fromNumber: params.telefono ?? null,
              status: "COMPLETED",
              outcome: "RESOLVED",
              successful: true,
              startedAt: now,
              endedAt: now,
              durationSecs: 0,
              costCents: 0,
              summary: "Cita apuntada por el dueño desde el chat del Gestor",
            },
            update: {},
            select: { id: true },
          });
          const reserva = await tx.booking.upsert({
            where: { callId: llamada.id },
            create: {
              callId: llamada.id,
              programedAt: start,
              durationMinutes: prep.duracion,
              numberPeople: 1,
              professionalId: asignado?.id,
              serviceIds: prep.servicios.map((s) => s.id),
              clientName,
              clientPhone: params.telefono ?? null,
              // El dueño decide después si se le avisa («¿Le mando la
              // confirmación?»): hasta entonces no hay consentimiento.
              smsConsent: false,
              createdVia: "owner_chat",
              externalEventId: eventoCreado ?? undefined,
              externalCalendarProvider: conexion.provider,
              externalCalendarId: conexion.calendarId,
            },
            update: {
              programedAt: start,
              durationMinutes: prep.duracion,
              professionalId: asignado?.id,
              serviceIds: prep.servicios.map((s) => s.id),
              clientName,
              clientPhone: params.telefono ?? null,
              externalEventId: eventoCreado ?? undefined,
              externalCalendarProvider: conexion.provider,
              externalCalendarId: conexion.calendarId,
              isCancelled: false,
              cancelledAt: null,
              cancelledBy: null,
            },
            select: { id: true },
          });
          return reserva.id;
        });
      } catch (error) {
        console.error(
          `[Gestor] ${etiqueta}: la cita del negocio ${business.id} no se pudo guardar tras crear el evento ${eventoCreado ?? "—"}: ${errorMessage(error)}`
        );
        if (eventoCreado) {
          try {
            await calendarService.cancelAppointment({
              conexion,
              eventId: eventoCreado,
            });
          } catch (errorAlBorrar) {
            console.error(
              `[Gestor] ${etiqueta}: no se pudo deshacer el evento ${eventoCreado}: ${errorMessage(errorAlBorrar)}`
            );
          }
        }
        return {
          ok: false,
          mensaje: `No he podido apuntar la cita: ${mensajeDeError(error, "añadir_cita", business.id)}`,
        };
      }

      console.log(
        `[Gestor] ${etiqueta}: cita ${bookingId} apuntada por el dueño del negocio ${business.id} (${formatearCita(start, ctx.timezone)})`
      );
      const cuando = formatearCita(start, ctx.timezone);
      const con = asignado ? ` con ${asignado.name}` : "";
      return {
        ok: true,
        mensaje: `Hecho: ${clientName} queda apuntado el ${cuando}, ${listar(serviceNames)}${con}. Ya está en tu calendario.`,
        nota: `Cita ${bookingId} creada: ${clientName}, ${cuando}, ${listar(serviceNames)}${con}${params.telefono ? `, móvil ${params.telefono}` : ", sin móvil"}.`,
        siguiente: params.telefono
          ? {
              tipo: "avisar_cliente",
              parametros: { cita: bookingId, tipo: "confirmacion" },
              resumen: `Le mando a ${clientName} la confirmación de la cita por WhatsApp al ${params.telefono}.`,
              pregunta: `¿Le mando a ${clientName} la confirmación por WhatsApp al ${params.telefono}?`,
              botones: { confirmar: "Sí, mándasela", cancelar: "No" },
            }
          : undefined,
      };
    } finally {
      await releaseBookingLock(business.id, lockToken);
    }
  },
};

// ---------------------------------------------------------------------------
// mover_cita
// ---------------------------------------------------------------------------

const MoverCitaParams = z
  .object({
    cita: Id,
    fechaHora: FechaHoraLocal,
    profesional: Id.optional(),
  })
  .strict();

type MoverCita = z.infer<typeof MoverCitaParams>;

const moverCita: AccionDelGestor<MoverCita> = {
  schema: MoverCitaParams,
  async comprobar(ctx, params): Promise<ResultadoDeComprobacion<MoverCita>> {
    const cita = await citaDelNegocio(ctx.businessId, params.cita);
    if (!cita)
      return { ok: false, motivo: "No encuentro esa cita en este negocio." };
    if (cita.isCancelled)
      return { ok: false, motivo: "Esa cita está cancelada." };
    const negocio = await negocioParaReservar(ctx.businessId);
    if (!negocio.ok) return negocio;
    let profesional: { id: string; name: string } | null = null;
    if (params.profesional) {
      const r = await resolverProfesional(ctx.businessId, params.profesional);
      if (!r.ok) return r;
      profesional = r.profesional;
    }
    const start = inicioDe(params, ctx.timezone);
    if (start.getTime() < Date.now()) {
      return { ok: false, motivo: "Esa hora ya ha pasado." };
    }
    if (start.getTime() === cita.programedAt.getTime() && !profesional) {
      return { ok: false, motivo: "La cita ya está a esa hora." };
    }
    const hueco = await comprobarHueco({
      business: negocio.business,
      conexion: negocio.conexion,
      start,
      durationMinutes: cita.durationMinutes,
      serviceIds: cita.serviceIds,
      professionalId: profesional?.id ?? cita.professionalId,
      excluir: { bookingId: cita.id, externalEventId: cita.externalEventId },
    });
    if (!hueco.ok) return hueco;
    const asignado =
      profesional ??
      cita.professional ??
      hueco.disponibilidad.availableProfessionals[0] ??
      null;
    const telefono = telefonoDeLaCita(cita);
    return {
      ok: true,
      descripcion: `mover ${await describirCita(cita, ctx.timezone)} al ${formatearCita(start, ctx.timezone)}${asignado ? ` con ${asignado.name}` : ""}${telefono ? ` (móvil del cliente: ${telefono}, por si prefieres llamarle antes; la propuesta sigue vigente 24 h)` : ""}`,
      parametros: {
        ...params,
        ...(profesional ? { profesional: profesional.id } : {}),
      },
    };
  },
  async ejecutar(ctx, params, meta): Promise<ResultadoDeEjecucion> {
    const etiqueta = `mover_cita ${meta.accionId}`;
    const cita = await citaDelNegocio(ctx.businessId, params.cita);
    if (!cita) return { ok: false, mensaje: "Esa cita ya no existe." };
    if (cita.isCancelled)
      return { ok: false, mensaje: "Esa cita está cancelada." };
    const negocio = await negocioParaReservar(ctx.businessId);
    if (!negocio.ok) return { ok: false, mensaje: negocio.motivo };
    const { business, conexion } = negocio;
    let profesional: { id: string; name: string } | null = null;
    if (params.profesional) {
      const r = await resolverProfesional(ctx.businessId, params.profesional);
      if (!r.ok) return { ok: false, mensaje: r.motivo };
      profesional = r.profesional;
    }
    const start = inicioDe(params, ctx.timezone);
    if (start.getTime() < Date.now()) {
      return { ok: false, mensaje: "Esa hora ya ha pasado." };
    }
    const descripcionAntes = await describirCita(cita, ctx.timezone);

    const lockToken = await acquireBookingLock(business.id);
    if (!lockToken) {
      return {
        ok: false,
        mensaje:
          "La agenda está ocupada ahora mismo con otra reserva. Espera un momento y vuelve a pedírmelo.",
      };
    }
    let eventoNuevo: string | undefined;
    try {
      const hueco = await comprobarHueco({
        business,
        conexion,
        start,
        durationMinutes: cita.durationMinutes,
        serviceIds: cita.serviceIds,
        professionalId: profesional?.id ?? cita.professionalId,
        excluir: { bookingId: cita.id, externalEventId: cita.externalEventId },
      });
      if (!hueco.ok) {
        return { ok: false, mensaje: `No he podido moverla: ${hueco.motivo}` };
      }
      const asignado =
        profesional ??
        cita.professional ??
        hueco.disponibilidad.availableProfessionals[0] ??
        null;
      const serviceNames = await nombreDeServicios(cita.serviceIds);
      const clientName = cita.clientName?.trim() || "Cliente";

      // Evento nuevo primero, reserva después, evento viejo al final: si
      // algo falla a medias, el calendario tiene una cita de más (visible)
      // y nunca una de menos.
      try {
        const evento = (await calendarService.bookAppointment({
          conexion,
          clientName,
          startDateTime: start.toISOString(),
          durationMinutes: cita.durationMinutes,
          clientPhone: telefonoDeLaCita(cita),
          serviceNames,
          professionalName: asignado?.name,
          timezone: ctx.timezone,
          idempotencyKey: buildCalendarIdempotencyKey({
            callId: callIdSintetico(meta.accionId),
            startDateTime: start.toISOString(),
            durationMinutes: cita.durationMinutes,
            distintivo: meta.inboundMessageId,
          }),
        })) as { id?: string } | undefined;
        eventoNuevo = evento?.id;
      } catch (error) {
        const proveedorRoto = proveedorDesdeErrorDeReconexion(error);
        if (proveedorRoto) {
          await marcarCalendarioDesconectado(
            business.id,
            proveedorRoto,
            { modo: "revocar" },
            { prefijo: "[Gestor]" }
          );
          return {
            ok: false,
            mensaje:
              "El calendario ha dejado de responder y hay que volver a conectarlo desde el panel; la cita sigue como estaba.",
          };
        }
        console.error(
          `[Gestor] ${etiqueta}: el calendario ${conexion.provider} del negocio ${business.id} no aceptó la nueva hora de ${cita.id}: ${errorMessage(error)}`
        );
        return {
          ok: false,
          mensaje:
            "El calendario no ha aceptado la nueva hora; la cita sigue como estaba. Inténtalo en un rato.",
        };
      }

      const movida = await prisma.booking
        .updateMany({
          where: { id: cita.id, isCancelled: false },
          data: {
            programedAt: start,
            professionalId: asignado?.id ?? null,
            externalEventId: eventoNuevo ?? null,
            externalCalendarProvider: conexion.provider,
            externalCalendarId: conexion.calendarId,
            // El cliente aún no ha visto la hora nueva.
            confirmedByClientAt: null,
          },
        })
        .catch((error: unknown) => {
          console.error(
            `[Gestor] ${etiqueta}: no se pudo guardar la nueva hora de ${cita.id} (negocio ${business.id}): ${errorMessage(error)}`
          );
          return null;
        });
      if (!movida || movida.count === 0) {
        if (eventoNuevo) {
          try {
            await calendarService.cancelAppointment({
              conexion,
              eventId: eventoNuevo,
            });
          } catch (errorAlBorrar) {
            console.error(
              `[Gestor] ${etiqueta}: no se pudo deshacer el evento nuevo ${eventoNuevo}: ${errorMessage(errorAlBorrar)}`
            );
          }
        }
        return {
          ok: false,
          mensaje: movida
            ? "Esa cita se canceló mientras la movía; no he hecho nada."
            : "No he podido mover la cita: ha fallado algo por nuestra parte. Inténtalo en un rato o hazlo desde el panel.",
        };
      }

      // Evento viejo: best-effort contra el calendario con el que se creó.
      if (cita.externalEventId && cita.externalCalendarProvider) {
        try {
          await calendarService.cancelAppointment({
            conexion: resolverConexionDeCalendario(business, {
              provider: normalizarProveedorDeCalendario(
                cita.externalCalendarProvider
              ),
              calendarId: cita.externalCalendarId,
            }),
            eventId: cita.externalEventId,
          });
        } catch (error) {
          console.error(
            `[Gestor] ${etiqueta}: la cita ${cita.id} ya está movida pero no se pudo borrar el evento antiguo ${cita.externalEventId} de ${cita.externalCalendarProvider}: ${errorMessage(error)}`
          );
        }
      }

      // El recordatorio de la hora vieja se descarta solo (HORA_CAMBIADA);
      // este programa el de la nueva, si el plan lo admite y hay
      // consentimiento.
      await programarMensajesAlCliente({
        bookingId: cita.id,
        etiqueta,
        confirmacion: false,
      });

      console.log(
        `[Gestor] ${etiqueta}: cita ${cita.id} del negocio ${business.id} movida por el dueño al ${formatearCita(start, ctx.timezone)}`
      );
      const cuando = formatearCita(start, ctx.timezone);
      const telefono = telefonoDeLaCita(cita);
      const con = asignado ? ` con ${asignado.name}` : "";
      return {
        ok: true,
        mensaje: `Hecho: ${descripcionAntes} pasa al ${cuando}${con}. El calendario ya está al día.`,
        nota: `Cita ${cita.id} movida al ${cuando}${con}${telefono ? `, móvil ${telefono}` : ", sin móvil"}.`,
        siguiente: telefono
          ? {
              tipo: "avisar_cliente",
              parametros: { cita: cita.id, tipo: "cambio" },
              resumen: `Le aviso a ${clientName} por WhatsApp de que su cita pasa al ${cuando}.`,
              pregunta: `¿Le aviso a ${clientName} por WhatsApp de la nueva hora? Si prefieres llamarle tú: ${telefono}.`,
              botones: { confirmar: "Sí, avísale", cancelar: "Le llamo yo" },
            }
          : undefined,
      };
    } finally {
      await releaseBookingLock(business.id, lockToken);
    }
  },
};

// ---------------------------------------------------------------------------
// cancelar_cita
// ---------------------------------------------------------------------------

const CancelarCitaParams = z.object({ cita: Id }).strict();

const cancelarCita: AccionDelGestor<z.infer<typeof CancelarCitaParams>> = {
  schema: CancelarCitaParams,
  async comprobar(ctx, params) {
    const cita = await citaDelNegocio(ctx.businessId, params.cita);
    if (!cita)
      return { ok: false, motivo: "No encuentro esa cita en este negocio." };
    if (cita.isCancelled)
      return { ok: false, motivo: "Esa cita ya está cancelada." };
    const telefono = telefonoDeLaCita(cita);
    return {
      ok: true,
      descripcion: `cancelar ${await describirCita(cita, ctx.timezone)}${telefono ? ` (móvil del cliente: ${telefono}, por si prefieres llamarle antes; la propuesta sigue vigente 24 h)` : ""}`,
    };
  },
  async ejecutar(ctx, params, meta) {
    const cita = await citaDelNegocio(ctx.businessId, params.cita);
    if (!cita) return { ok: false, mensaje: "Esa cita ya no existe." };
    const descripcion = await describirCita(cita, ctx.timezone);
    const r = await cancelarReserva({
      bookingId: cita.id,
      businessId: ctx.businessId,
      cancelledBy: "owner_chat",
      etiqueta: `cancelar_cita ${meta.accionId}`,
      inboundMessageId: meta.inboundMessageId,
    });
    if (r.resultado === "no_encontrada") {
      return { ok: false, mensaje: "Esa cita ya no existe." };
    }
    if (r.resultado === "ya_cancelada") {
      return { ok: false, mensaje: "Esa cita ya estaba cancelada." };
    }
    const telefono = telefonoDeLaCita(cita);
    const clientName = cita.clientName?.trim() || "el cliente";
    return {
      ok: true,
      mensaje: `Hecho: ${descripcion} queda cancelada y fuera del calendario.`,
      nota: `Cita ${cita.id} cancelada${telefono ? ` (móvil ${telefono})` : " (sin móvil)"}.`,
      siguiente: telefono
        ? {
            tipo: "avisar_cliente",
            parametros: { cita: cita.id, tipo: "cancelacion" },
            resumen: `Le aviso a ${clientName} por WhatsApp de que su cita queda cancelada.`,
            pregunta: `¿Le aviso a ${clientName} por WhatsApp de la cancelación? Si prefieres llamarle tú: ${telefono}.`,
            botones: { confirmar: "Sí, avísale", cancelar: "Le llamo yo" },
          }
        : undefined,
    };
  },
};

// ---------------------------------------------------------------------------
// avisar_cliente
// ---------------------------------------------------------------------------

const AvisarClienteParams = z
  .object({
    cita: Id,
    tipo: z.enum(["confirmacion", "cambio", "cancelacion"]),
    telefono: Telefono.optional(),
  })
  .strict();

type AvisarCliente = z.infer<typeof AvisarClienteParams>;

const QUE_SE_AVISA: Record<AvisarCliente["tipo"], string> = {
  confirmacion: "la confirmación de la cita",
  cambio: "el aviso de la nueva hora",
  cancelacion: "el aviso de la cancelación",
};

const avisarCliente: AccionDelGestor<AvisarCliente> = {
  schema: AvisarClienteParams,
  async comprobar(ctx, params) {
    const cita = await citaDelNegocio(ctx.businessId, params.cita);
    if (!cita)
      return { ok: false, motivo: "No encuentro esa cita en este negocio." };
    if (params.tipo === "cancelacion" ? !cita.isCancelled : cita.isCancelled) {
      return {
        ok: false,
        motivo: cita.isCancelled
          ? "Esa cita está cancelada; solo cabe avisar de la cancelación."
          : "Esa cita no está cancelada.",
      };
    }
    const telefono = params.telefono ?? telefonoDeLaCita(cita);
    if (!telefono) {
      return {
        ok: false,
        motivo:
          "No tengo el móvil del cliente: pídeselo al dueño y vuelve a proponerlo con el parámetro telefono.",
      };
    }
    // Lo que haría fallar el envío se comprueba aquí, para no preguntar
    // «¿le aviso?» cuando la respuesta va a ser «no he podido».
    const negocio = await prisma.business.findUnique({
      where: { id: ctx.businessId },
      select: { telnyxPhoneNumber: true },
    });
    if (!negocio?.telnyxPhoneNumber) {
      return {
        ok: false,
        motivo:
          "El negocio aún no tiene número de Alhabla: hasta entonces no se pueden mandar mensajes a los clientes.",
      };
    }
    if (await estaDadoDeBaja("client", telefono)) {
      return {
        ok: false,
        motivo: "Ese número pidió no recibir mensajes de Alhabla.",
      };
    }
    const cliente = cita.clientName?.trim() || "el cliente";
    return {
      ok: true,
      descripcion: `mandar a ${cliente} ${QUE_SE_AVISA[params.tipo]} por WhatsApp al ${telefono}`,
      parametros: { ...params, telefono },
    };
  },
  async ejecutar(ctx, params, meta) {
    const etiqueta = `avisar_cliente ${meta.accionId}`;
    const cita = await citaDelNegocio(ctx.businessId, params.cita);
    if (!cita) return { ok: false, mensaje: "Esa cita ya no existe." };
    const telefono = params.telefono ?? telefonoDeLaCita(cita);
    if (!telefono) {
      return { ok: false, mensaje: "No tengo el móvil del cliente." };
    }
    try {
      // El dueño responde del número y autoriza el envío: es el
      // consentimiento que las plantillas al cliente exigen.
      await prisma.booking.update({
        where: { id: cita.id },
        data: {
          smsConsent: true,
          ...(cita.clientPhone !== telefono ? { clientPhone: telefono } : {}),
        },
      });
    } catch (error) {
      return {
        ok: false,
        mensaje: `No he podido preparar el aviso: ${mensajeDeError(error, "avisar_cliente", ctx.businessId)}`,
      };
    }
    const cliente = cita.clientName?.trim() || "el cliente";
    if (params.tipo === "confirmacion") {
      const r = await programarMensajesAlCliente({
        bookingId: cita.id,
        etiqueta,
      });
      if (r.confirmacion !== "programada") {
        return {
          ok: false,
          mensaje: `No he podido mandarle la confirmación a ${cliente}${r.motivo ? ` (${motivoLegible(r.motivo)})` : ""}.`,
          nota: `Confirmación de la cita ${cita.id} no enviada: ${r.motivo ?? "?"}.`,
        };
      }
      return {
        ok: true,
        mensaje: `Le mando a ${cliente} la confirmación al ${telefono}.`,
        nota: `Confirmación de la cita ${cita.id} enviada al ${telefono}.`,
      };
    }
    const r = await programarAvisoAlCliente({
      bookingId: cita.id,
      proposito: params.tipo,
      etiqueta,
    });
    if (!r.programado) {
      return {
        ok: false,
        mensaje: `No he podido avisar a ${cliente} (${motivoLegible(r.motivo)}).`,
        nota: `Aviso de ${params.tipo} de la cita ${cita.id} no enviado: ${r.motivo}.`,
      };
    }
    return {
      ok: true,
      mensaje: `Le aviso a ${cliente} al ${telefono}.`,
      nota: `Aviso de ${params.tipo} de la cita ${cita.id} enviado al ${telefono}.`,
    };
  },
};

function motivoLegible(motivo: string): string {
  if (motivo === "el número pidió STOP")
    return "ese número pidió no recibir mensajes";
  if (motivo === "el negocio no tiene número de teléfono")
    return "el negocio aún no tiene número de Alhabla";
  if (motivo === "sin número válido") return "el móvil no es válido";
  return "ha fallado algo por nuestra parte";
}

// ---------------------------------------------------------------------------
// marcar_ausencia
// ---------------------------------------------------------------------------

const MarcarAusenciaParams = z
  .object({
    profesional: Id,
    desde: Fecha,
    hasta: Fecha.optional(),
    horaInicio: Hora.optional(),
    horaFin: Hora.optional(),
    motivo: z.string().trim().max(60).optional(),
  })
  .strict()
  .refine(
    (p) => (p.horaInicio === undefined) === (p.horaFin === undefined),
    "horaInicio y horaFin van juntas"
  )
  .refine(
    (p) => !p.horaInicio || !p.horaFin || p.horaInicio < p.horaFin,
    "horaFin debe ser posterior a horaInicio"
  );

type MarcarAusencia = z.infer<typeof MarcarAusenciaParams>;

function tramoDeAusencia(
  params: MarcarAusencia,
  timezone: string
): { startsAt: Date; endsAt: Date; hasta: string } {
  const hasta = params.hasta ?? params.desde;
  const startsAt = instanteLocal(
    timezone,
    params.desde,
    params.horaInicio ?? "00:00"
  );
  const endsAt = params.horaFin
    ? instanteLocal(timezone, hasta, params.horaFin)
    : instanteLocal(timezone, sumarDias(hasta, 1), "00:00");
  return { startsAt, endsAt, hasta };
}

function describirTramo(params: MarcarAusencia, hasta: string): string {
  const horas = params.horaInicio
    ? ` de ${params.horaInicio} a ${params.horaFin}`
    : "";
  return hasta === params.desde
    ? `el ${fechaLarga(params.desde)}${horas}`
    : params.horaInicio
      ? `desde el ${fechaLarga(params.desde)} a las ${params.horaInicio} hasta el ${fechaLarga(hasta)} a las ${params.horaFin}`
      : `del ${fechaLarga(params.desde)} al ${fechaLarga(hasta)}`;
}

async function citasEnElTramo(
  businessId: string,
  professionalId: string,
  startsAt: Date,
  endsAt: Date
): Promise<number> {
  return prisma.booking.count({
    where: {
      call: { businessId },
      professionalId,
      isCancelled: false,
      programedAt: { gte: startsAt, lt: endsAt },
    },
  });
}

const marcarAusencia: AccionDelGestor<MarcarAusencia> = {
  schema: MarcarAusenciaParams,
  async comprobar(ctx, params) {
    const r = await resolverProfesional(ctx.businessId, params.profesional);
    if (!r.ok) return r;
    const { startsAt, endsAt, hasta } = tramoDeAusencia(params, ctx.timezone);
    if (hasta < params.desde) {
      return { ok: false, motivo: "La fecha final es anterior a la inicial." };
    }
    if (diasEntre(params.desde, hasta) > MAX_DIAS_DE_AUSENCIA) {
      return {
        ok: false,
        motivo: `Una ausencia no puede pasar de ${MAX_DIAS_DE_AUSENCIA} días; si alguien deja el equipo, retíralo.`,
      };
    }
    if (endsAt.getTime() <= Date.now()) {
      return { ok: false, motivo: "Ese tramo ya ha pasado." };
    }
    const solapada = await prisma.professionalAbsence.findFirst({
      where: {
        professionalId: r.profesional.id,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true },
    });
    if (solapada) {
      return {
        ok: false,
        motivo: `${r.profesional.name} ya tiene una ausencia que se solapa con ese tramo.`,
      };
    }
    const citas = await citasEnElTramo(
      ctx.businessId,
      r.profesional.id,
      startsAt,
      endsAt
    );
    return {
      ok: true,
      descripcion: `marcar a ${r.profesional.name} como ausente ${describirTramo(params, hasta)}${params.motivo ? ` (${params.motivo})` : ""}: la recepcionista no le reservará nada en ese tramo${citas > 0 ? `. Ojo: ya tiene ${citas} cita${citas === 1 ? "" : "s"} ahí, que no se mueven solas` : ""}`,
      parametros: { ...params, profesional: r.profesional.id },
    };
  },
  async ejecutar(ctx, params) {
    const r = await resolverProfesional(ctx.businessId, params.profesional);
    if (!r.ok) return { ok: false, mensaje: r.motivo };
    const { startsAt, endsAt, hasta } = tramoDeAusencia(params, ctx.timezone);
    try {
      await prisma.professionalAbsence.create({
        data: {
          businessId: ctx.businessId,
          professionalId: r.profesional.id,
          startsAt,
          endsAt,
          reason: params.motivo ?? null,
          createdVia: "owner_chat",
        },
      });
    } catch (error) {
      return {
        ok: false,
        mensaje: `No he podido anotar la ausencia: ${mensajeDeError(error, "marcar_ausencia", ctx.businessId)}`,
      };
    }
    const citas = await citasEnElTramo(
      ctx.businessId,
      r.profesional.id,
      startsAt,
      endsAt
    );
    return {
      ok: true,
      mensaje: `Hecho: ${r.profesional.name} no está ${describirTramo(params, hasta)}; la recepcionista no le reservará nada ahí.${citas > 0 ? ` Tiene ${citas} cita${citas === 1 ? "" : "s"} en ese tramo: dime si las movemos o las cancelamos.` : ""}`,
      nota: `Ausencia de ${r.profesional.name} (${r.profesional.id}) ${describirTramo(params, hasta)}${citas > 0 ? `; ${citas} cita(s) afectadas, pregunta al dueño qué hacer con ellas (listar_agenda)` : ""}.`,
    };
  },
};

// ---------------------------------------------------------------------------
// bloquear_franja (y cerrar_dia con rango, en accionesCatalogo.ts)
// ---------------------------------------------------------------------------

const BloquearFranjaParams = z
  .object({
    fecha: Fecha,
    desde: Hora,
    hasta: Hora,
    motivo: z.string().trim().max(60).optional(),
  })
  .strict()
  .refine((p) => p.desde < p.hasta, "hasta debe ser posterior a desde");

type BloquearFranja = z.infer<typeof BloquearFranjaParams>;

const DIAS_DE_LA_SEMANA = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/** Tramos de apertura de una fecha según el horario (excepción del día si
 * la hay, semana si no). */
function tramosDelDia(
  horario: BusinessSchedule,
  fecha: string
): Array<{ start: string; end: string }> {
  const excepcion = horario.exceptions.find((e) => e.date === fecha);
  if (excepcion) return excepcion.closed ? [] : excepcion.intervals;
  const [y, m, d] = fecha.split("-").map(Number);
  const dia =
    horario.week[
      DIAS_DE_LA_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
    ];
  return dia.enabled ? dia.intervals : [];
}

/** Lo que queda abierto tras quitar [desde, hasta) de los tramos del día. */
export function restarTramo(
  tramos: Array<{ start: string; end: string }>,
  desde: string,
  hasta: string
): Array<{ start: string; end: string }> {
  const resto: Array<{ start: string; end: string }> = [];
  for (const t of tramos) {
    if (t.end <= desde || t.start >= hasta) {
      resto.push(t);
      continue;
    }
    if (t.start < desde) resto.push({ start: t.start, end: desde });
    if (t.end > hasta) resto.push({ start: hasta, end: t.end });
  }
  return resto.sort((a, b) => a.start.localeCompare(b.start));
}

async function horarioActual(
  businessId: string
): Promise<BusinessSchedule | null> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { schedule: true },
  });
  const parsed = BusinessScheduleSchema.safeParse(business?.schedule);
  return parsed.success ? parsed.data : null;
}

function describirTramos(
  tramos: Array<{ start: string; end: string }>
): string {
  return tramos.length
    ? listar(tramos.map((t) => `de ${t.start} a ${t.end}`))
    : "cerrado todo el día";
}

const bloquearFranja: AccionDelGestor<BloquearFranja> = {
  schema: BloquearFranjaParams,
  async comprobar(ctx, params) {
    if (params.fecha < fechaLocal(new Date(), ctx.timezone)) {
      return { ok: false, motivo: "Esa fecha ya ha pasado." };
    }
    const horario = await horarioActual(ctx.businessId);
    if (!horario) {
      return {
        ok: false,
        motivo:
          "Primero hay que fijar el horario semanal; después podré bloquear tramos.",
      };
    }
    const abierto = tramosDelDia(horario, params.fecha);
    if (abierto.length === 0) {
      return {
        ok: false,
        motivo: `El ${fechaLarga(params.fecha)} ya está cerrado.`,
      };
    }
    const resto = restarTramo(abierto, params.desde, params.hasta);
    if (
      resto.length === abierto.length &&
      resto.every(
        (t, i) => t.start === abierto[i].start && t.end === abierto[i].end
      )
    ) {
      return {
        ok: false,
        motivo: `El ${fechaLarga(params.fecha)} de ${params.desde} a ${params.hasta} ya está fuera del horario.`,
      };
    }
    if (resto.length > 3) {
      return {
        ok: false,
        motivo:
          "Ese bloqueo dejaría más de tres tramos abiertos ese día; bloquea un tramo más ancho.",
      };
    }
    if (
      horario.exceptions.filter((e) => e.date !== params.fecha).length >=
      MAX_EXCEPCIONES
    ) {
      return {
        ok: false,
        motivo:
          "Hay demasiados días especiales guardados; borra alguno desde el panel.",
      };
    }
    const citas = await prisma.booking.count({
      where: {
        call: { businessId: ctx.businessId },
        isCancelled: false,
        programedAt: {
          gte: instanteLocal(ctx.timezone, params.fecha, params.desde),
          lt: instanteLocal(ctx.timezone, params.fecha, params.hasta),
        },
      },
    });
    return {
      ok: true,
      descripcion: `bloquear el ${fechaLarga(params.fecha)} de ${params.desde} a ${params.hasta}${params.motivo ? ` (${params.motivo})` : ""}: ese día queda ${describirTramos(resto)}${citas > 0 ? `. Ojo: hay ${citas} cita${citas === 1 ? "" : "s"} en ese tramo, que no se mueven solas` : ""}`,
    };
  },
  async ejecutar(ctx, params) {
    try {
      const horario = await horarioActual(ctx.businessId);
      if (!horario) {
        return {
          ok: false,
          mensaje: "Primero hay que fijar el horario semanal.",
        };
      }
      const resto = restarTramo(
        tramosDelDia(horario, params.fecha),
        params.desde,
        params.hasta
      );
      const excepciones = horario.exceptions.filter(
        (e) => e.date !== params.fecha
      );
      const etiqueta =
        params.motivo ??
        horario.exceptions.find((e) => e.date === params.fecha)?.label;
      excepciones.push({
        date: params.fecha,
        closed: resto.length === 0,
        intervals: resto,
        ...(etiqueta ? { label: etiqueta } : {}),
      });
      const nuevo = BusinessScheduleSchema.parse({
        ...horario,
        exceptions: excepciones,
      });
      await guardarHorarioDelNegocio(ctx.businessId, nuevo);
      return {
        ok: true,
        mensaje: `Hecho: el ${fechaLarga(params.fecha)} queda ${describirTramos(resto)}. Las citas ya reservadas en ese tramo no se cancelan solas: revísalas en la agenda.`,
        nota: `Bloqueo del ${params.fecha} de ${params.desde} a ${params.hasta}: el día queda ${describirTramos(resto)}.`,
      };
    } catch (error) {
      return {
        ok: false,
        mensaje: `No he podido bloquear ese tramo: ${mensajeDeError(error, "bloquear_franja", ctx.businessId)}`,
      };
    }
  },
};

export const ACCIONES_DE_AGENDA: Record<string, AccionDelGestor<unknown>> = {
  añadir_cita: anadirCita as AccionDelGestor<unknown>,
  // Sin la eñe, por si el modelo la pierde por el camino.
  anadir_cita: anadirCita as AccionDelGestor<unknown>,
  mover_cita: moverCita as AccionDelGestor<unknown>,
  cancelar_cita: cancelarCita as AccionDelGestor<unknown>,
  avisar_cliente: avisarCliente as AccionDelGestor<unknown>,
  marcar_ausencia: marcarAusencia as AccionDelGestor<unknown>,
  bloquear_franja: bloquearFranja as AccionDelGestor<unknown>,
};
