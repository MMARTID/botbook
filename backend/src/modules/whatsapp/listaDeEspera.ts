import type { Prisma } from "@prisma/client";
import { whatsappAdapter } from "../../adapters/whatsapp/WhatsAppAdapter.js";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import { enqueueWhatsappJob } from "../../lib/cloudTasks.js";
import { calendarService } from "../calendar/service.js";
import {
  conexionOperativa,
  marcarCalendarioDesconectado,
  origenDeCalendario,
  resolverConexionDeCalendario,
  SELECT_CONEXION_DE_CALENDARIO,
  usaCalendarioExterno,
  type ConexionResuelta,
} from "../calendar/conexion.js";
import { proveedorDesdeErrorDeReconexion } from "../../adapters/calendar/errors.js";
import {
  checkAvailability,
  computeAvailabilityLookaheadMs,
  type ExternalBusyInterval,
} from "../../lib/availability.js";
import {
  checkBookingRestrictions,
  checkBusinessHours,
} from "../../lib/businessSchedule.js";
import {
  acquireBookingLock,
  releaseBookingLock,
} from "../../lib/bookingLock.js";
import { buildCalendarIdempotencyKey } from "../../lib/calendarIdempotency.js";
import { ESTADOS_DE_SUSCRIPCION_BLOQUEADOS } from "../../lib/planFeatures.js";
import { refrescarPlantilla, resolverPlantilla } from "./service.js";
import { estaDadoDeBaja } from "./bajas.js";
import { avisarNuevaReserva } from "./avisosNegocio.js";
import {
  describirServicioParaCliente,
  programarMensajesAlCliente,
  sanearNombre,
} from "./mensajesCliente.js";

/**
 * Lista de espera por WhatsApp (PLAN-CANAL-DUENO.md § 5, PR 4): los leads
 * `availability_watch` que deja `notify_when_available`. Cuando se libera un
 * hueco (cancelación por voz o botón, «Ya no» de otro cliente, o el botón
 * del dueño «Avisar a quien esperaba») se ofrece la plaza AL PRIMERO que la
 * pedía y sigue disponible, y se para: un hueco es una plaza. La oferta dura
 * 10 min (`VENTANA_DE_OFERTA_MS`); pasado ese plazo sin respuesta el lead se
 * cierra `sin_respuesta` en el siguiente disparo (un «Sí» tardío aún lo
 * atiende con disponibilidad real) y el siguiente candidato recibe la plaza.
 *
 * Convenciones sobre el lead: `notifiedAt` = momento de la oferta vigente;
 * `notifiedVia` ∈ `encolado` (reclamado, aún sin enviar) | `plantilla:<x>` |
 * `ninguna:<motivo>`; `resolvedAt` al cerrar; `data.resolvedBy` dice cómo.
 *
 * Nunca importa `voiceTools/service.ts`.
 */

export const VENTANA_DE_OFERTA_MS = 10 * 60_000;
export const LEADS_POR_BARRIDO = 50;
const DURACION_POR_DEFECTO_MIN = 30;

export const SELECT_NEGOCIO_LISTA_ESPERA = {
  name: true,
  schedule: true,
  timezone: true,
  bookingCapacity: true,
  minAdvanceBookingMinutes: true,
  maxAppointmentDurationMinutes: true,
  telnyxPhoneNumber: true,
  phone: true,
  subscriptionStatus: true,
  active: true,
  ...SELECT_CONEXION_DE_CALENDARIO,
} as const satisfies Prisma.BusinessSelect;

type NegocioListaEspera = Prisma.BusinessGetPayload<{
  select: typeof SELECT_NEGOCIO_LISTA_ESPERA;
}>;

export interface DatosDeEspera {
  clientPhone: string;
  startDateTime: string;
  durationMinutes: number;
  serviceIds?: string[];
  professionalId?: string | null;
  clientName?: string;
  resolvedBy?: string;
  bookingId?: string;
  resolvedFromInboundMessageId?: string;
}

export interface Hueco {
  inicioMs: number;
  finMs: number;
}

export type ResultadoListaDeEspera =
  | { resultado: "avisado"; leadId: string; cliente: string | null }
  | { resultado: "en_oferta"; cliente: string | null; minutos: number }
  | { resultado: "nadie" }
  | { resultado: "sin_plantilla" }
  | { resultado: "error"; motivo: string };

function datosDelLead(data: unknown): DatosDeEspera {
  const d = (data as Record<string, unknown> | null) ?? {};
  return {
    clientPhone: typeof d.clientPhone === "string" ? d.clientPhone : "",
    startDateTime: typeof d.startDateTime === "string" ? d.startDateTime : "",
    durationMinutes:
      typeof d.durationMinutes === "number" ? d.durationMinutes : 0,
    serviceIds: Array.isArray(d.serviceIds)
      ? d.serviceIds.filter((id): id is string => typeof id === "string")
      : [],
    professionalId:
      typeof d.professionalId === "string" ? d.professionalId : null,
    clientName: typeof d.clientName === "string" ? d.clientName : undefined,
    resolvedBy: typeof d.resolvedBy === "string" ? d.resolvedBy : undefined,
    bookingId: typeof d.bookingId === "string" ? d.bookingId : undefined,
    resolvedFromInboundMessageId:
      typeof d.resolvedFromInboundMessageId === "string"
        ? d.resolvedFromInboundMessageId
        : undefined,
  };
}

function isValidAppointmentDuration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 24 * 60
  );
}

function callIdSintetico(leadId: string): string {
  return `whatsapp:espera:${leadId}`;
}

/**
 * Señal interna de la transacción de reserva: un «Ya no» concurrente cerró
 * el lead entre la relectura bajo el lock y el cierre condicional.
 */
class LeadCerradoEntreMediasError extends Error {
  constructor() {
    super("LEAD_CERRADO_ENTRE_MEDIAS");
    this.name = "LeadCerradoEntreMediasError";
  }
}

/**
 * Un lead `resolvedBy: "reservado"` cuya reserva se canceló después
 * (recordatorio → «Cancelar», o por voz) ya no respalda «esa hora es tuya».
 * Solo mira reservas de ESE negocio; sin `bookingId` (o si la lectura falla)
 * se asume viva, como antes.
 */
export async function reservaDelLeadCancelada(
  data: { resolvedBy?: unknown; bookingId?: unknown },
  businessId: string
): Promise<boolean> {
  if (data.resolvedBy !== "reservado" || typeof data.bookingId !== "string") {
    return false;
  }
  try {
    const reserva = await prisma.booking.findFirst({
      where: { id: data.bookingId, call: { businessId } },
      select: { isCancelled: true },
    });
    return reserva?.isCancelled === true;
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo comprobar la reserva ${data.bookingId} del aviso (negocio ${businessId}): ${errorMessage(error)}`
    );
    return false;
  }
}

/** Cierra un lead con `resolvedBy` (best-effort, nunca lanza). */
async function cerrarLead(
  leadId: string,
  data: unknown,
  resolvedBy: string,
  extra: Record<string, unknown> = {}
): Promise<number> {
  try {
    const result = await prisma.lead.updateMany({
      where: { id: leadId, resolvedAt: null },
      data: {
        resolvedAt: new Date(),
        data: {
          ...((data as Record<string, unknown> | null) ?? {}),
          resolvedBy,
          ...extra,
        } as Prisma.InputJsonValue,
      },
    });
    return result.count;
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo cerrar el aviso ${leadId} (${resolvedBy}): ${errorMessage(error)}`
    );
    return 0;
  }
}

/** Ocupación real del calendario para el hueco pedido (con lookahead). */
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

/** Servicios y profesional del lead verificados por negocio (nunca de otro tenant). */
async function verificarCatalogo(
  businessId: string,
  data: DatosDeEspera
): Promise<{
  serviceIds: string[];
  serviceNames: string[];
  professionalId: string | undefined;
  professionalName: string | null;
}> {
  const requested = data.serviceIds ?? [];
  let serviceIds: string[] = [];
  let serviceNames: string[] = [];
  if (requested.length > 0) {
    const services = await prisma.service.findMany({
      where: {
        id: { in: requested },
        businessId,
        active: true,
        deletedAt: null,
      },
      select: { id: true, name: true },
    });
    const byId = new Map(services.map((s) => [s.id, s.name]));
    serviceIds = requested.filter((id) => byId.has(id));
    serviceNames = serviceIds.map((id) => byId.get(id)!);
  }
  let professionalId: string | undefined;
  let professionalName: string | null = null;
  if (data.professionalId) {
    const professional = await prisma.professional.findFirst({
      where: {
        id: data.professionalId,
        businessId,
        active: true,
        deletedAt: null,
      },
      select: { id: true, name: true },
    });
    professionalId = professional?.id;
    professionalName = professional?.name ?? null;
  }
  return { serviceIds, serviceNames, professionalId, professionalName };
}

/** Horario y restricciones del negocio sobre la hora del lead. */
function reservable(
  business: NegocioListaEspera,
  data: DatosDeEspera
): boolean {
  const horario = checkBusinessHours(
    business.schedule,
    business.timezone || "Europe/Madrid",
    data.startDateTime,
    data.durationMinutes
  );
  if (!horario.success || !horario.isOpen) {
    return false;
  }
  return checkBookingRestrictions(
    business,
    data.startDateTime,
    data.durationMinutes
  ).success;
}

/**
 * Nombre de quien espera, solo con datos de ESTE negocio: el del lead, si no
 * el de su última reserva con ese teléfono en este negocio, si no null.
 */
export async function nombreDelQueEspera(
  lead: { data: unknown; call?: { businessId: string } | null },
  businessId?: string
): Promise<string | null> {
  const data = datosDelLead(lead.data);
  const delLead = sanearNombre(data.clientName);
  if (delLead) {
    return delLead;
  }
  const negocio = businessId ?? lead.call?.businessId;
  if (!negocio || !data.clientPhone) {
    return null;
  }
  try {
    const reserva = await prisma.booking.findFirst({
      where: {
        call: { businessId: negocio },
        OR: [
          { clientPhone: data.clientPhone },
          { clientPhone: null, call: { fromNumber: data.clientPhone } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { clientName: true },
    });
    return sanearNombre(reserva?.clientName);
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo buscar el nombre de quien espera (negocio ${negocio}): ${errorMessage(error)}`
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// B. Aviso al primero
// ---------------------------------------------------------------------------

async function hayPlantillaDeHueco(): Promise<boolean> {
  if (!whatsappAdapter.isConfigured()) {
    return false;
  }
  await refrescarPlantilla("hueco_libre");
  await refrescarPlantilla("hora_disponible");
  return (
    (await resolverPlantilla({ key: "hueco_libre" })) !== null ||
    (await resolverPlantilla({ key: "hora_disponible" })) !== null ||
    !!process.env.WHATSAPP_TEMPLATE_SLOT_AVAILABLE_NAME
  );
}

/**
 * Ofrece el hueco liberado al primero de la lista que sigue pudiendo
 * reservarlo, y para. Nunca lanza. Solo mira leads cuyo `call.businessId` es
 * este negocio (nunca por teléfono). Antes del filtro de solapamiento limpia
 * los leads pasados y las ofertas caducadas de TODOS los cargados, para que
 * cincuenta zombis al principio de la cola no bloqueen al siguiente.
 */
export async function avisarAQuienEsperaba(input: {
  businessId: string;
  hueco: Hueco;
  origen:
    | "cancelacion_voz"
    | "cancelacion_cliente"
    | "cancelacion_dueno"
    | "boton_dueno"
    | "renuncia";
  etiqueta: string;
}): Promise<ResultadoListaDeEspera> {
  const { businessId, hueco } = input;
  try {
    if (!(await hayPlantillaDeHueco())) {
      console.log(
        `[WhatsApp] ${input.etiqueta}: hueco liberado en el negocio ${businessId} pero sin plantilla aprobada ni WHATSAPP_TEMPLATE_SLOT_AVAILABLE_NAME; la lista de espera no se toca`
      );
      return { resultado: "sin_plantilla" };
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: SELECT_NEGOCIO_LISTA_ESPERA,
    });
    if (!business || !business.active) {
      return { resultado: "error", motivo: "negocio inexistente o inactivo" };
    }

    const leads = await prisma.lead.findMany({
      where: {
        type: "availability_watch",
        resolvedAt: null,
        call: { businessId },
      },
      orderBy: { createdAt: "asc" },
      take: LEADS_POR_BARRIDO,
      select: { id: true, data: true, notifiedAt: true, notifiedVia: true },
    });
    if (leads.length === 0) {
      return { resultado: "nadie" };
    }

    const now = Date.now();
    const candidatos: typeof leads = [];
    for (const lead of leads) {
      const data = datosDelLead(lead.data);
      const inicio = new Date(data.startDateTime).getTime();
      if (Number.isNaN(inicio) || inicio < now) {
        await cerrarLead(lead.id, lead.data, "pasado");
        continue;
      }
      const ofertaEnviada = lead.notifiedVia?.startsWith("plantilla:") ?? false;
      if (
        lead.notifiedAt &&
        ofertaEnviada &&
        now - lead.notifiedAt.getTime() >= VENTANA_DE_OFERTA_MS
      ) {
        // Su botón sigue vivo: un «Sí» tardío lo reabre en C.
        await cerrarLead(lead.id, lead.data, "sin_respuesta");
        continue;
      }
      candidatos.push(lead);
    }

    const conexion = resolverConexionDeCalendario(business);
    for (const lead of candidatos) {
      const data = datosDelLead(lead.data);
      const inicio = new Date(data.startDateTime).getTime();
      const duracion = data.durationMinutes || DURACION_POR_DEFECTO_MIN;
      const fin = inicio + duracion * 60_000;
      if (!(inicio < hueco.finMs && fin > hueco.inicioMs)) {
        continue;
      }
      if (
        lead.notifiedAt &&
        now - lead.notifiedAt.getTime() < VENTANA_DE_OFERTA_MS
      ) {
        // La plaza es suya durante 10 min (oferta enviada o en cola).
        return {
          resultado: "en_oferta",
          cliente: await nombreDelQueEspera(lead, businessId),
          minutos: Math.floor((now - lead.notifiedAt.getTime()) / 60_000),
        };
      }
      // `encolado` con ≥ 10 min: el job nunca llegó a enviar; vuelve a ser
      // candidato (el reclamo de abajo lo admite).
      if (!data.clientPhone) {
        continue;
      }
      if (await estaDadoDeBaja("client", data.clientPhone)) {
        await cerrarLead(lead.id, lead.data, "baja");
        continue;
      }
      if (!isValidAppointmentDuration(data.durationMinutes)) {
        continue;
      }
      if (!reservable(business, data)) {
        // No se ofrece lo que no se podrá reservar; el lead no se cierra
        // (puede valer para otro hueco).
        continue;
      }
      const catalogo = await verificarCatalogo(businessId, data);
      const externo = await ocupacionExterna(
        conexion,
        new Date(data.startDateTime),
        data.durationMinutes
      );
      const disponibilidad = await checkAvailability({
        businessId,
        schedule: business.schedule,
        timezone: business.timezone || "Europe/Madrid",
        bookingCapacity: business.bookingCapacity,
        startDateTime: data.startDateTime,
        durationMinutes: data.durationMinutes,
        serviceIds: catalogo.serviceIds,
        professionalId: catalogo.professionalId,
        externalBusyIntervals: externo.intervals,
        calendarAvailabilityKnown: externo.calendarAvailabilityKnown,
        calendarOrigin: origenDeCalendario(conexion),
      });
      if (!disponibilidad.available) {
        continue;
      }

      // Reclamo atómico: otra cancelación concurrente no ofrece el mismo lead.
      const reclamado = await prisma.lead.updateMany({
        where: {
          id: lead.id,
          resolvedAt: null,
          OR: [
            { notifiedAt: null },
            {
              notifiedVia: "encolado",
              notifiedAt: { lt: new Date(now - VENTANA_DE_OFERTA_MS) },
            },
          ],
        },
        data: { notifiedAt: new Date(now), notifiedVia: "encolado" },
      });
      if (reclamado.count === 0) {
        continue;
      }
      const clave = `espera-${lead.id}-${Math.floor(now / 1000)}`;
      try {
        await enqueueWhatsappJob(
          {
            proposito: "hueco_libre",
            leadId: lead.id,
            businessId,
            toNumber: data.clientPhone,
            audience: "client",
          },
          { taskId: clave }
        );
      } catch (error) {
        console.error(
          `[WhatsApp] ${input.etiqueta}: no se pudo encolar el aviso de hueco al lead ${lead.id} (negocio ${businessId}, origen ${input.origen}): ${errorMessage(error)}`
        );
        await prisma.lead
          .updateMany({
            where: { id: lead.id, notifiedVia: "encolado" },
            data: { notifiedAt: null, notifiedVia: "ninguna:encolado-fallido" },
          })
          .catch(() => undefined);
        return { resultado: "error", motivo: errorMessage(error) };
      }
      console.log(
        `[WhatsApp] ${input.etiqueta}: hueco del negocio ${businessId} ofrecido al lead ${lead.id} (${clave}, origen ${input.origen})`
      );
      return {
        resultado: "avisado",
        leadId: lead.id,
        cliente: await nombreDelQueEspera(lead, businessId),
      };
    }
    return { resultado: "nadie" };
  } catch (error) {
    console.error(
      `[WhatsApp] ${input.etiqueta}: la lista de espera del negocio ${businessId} falló (origen ${input.origen}): ${errorMessage(error)}`
    );
    return { resultado: "error", motivo: errorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// C. «Sí, resérvala»
// ---------------------------------------------------------------------------

export type EstadoDeReserva =
  | "reservada"
  | "ya_reservada"
  | "ocupado"
  | "fuera_de_plazo"
  | "pasada"
  | "cerrado"
  | "sin_calendario"
  | "calendario_caido"
  | "lock"
  | "error";

export interface ResultadoDeReserva {
  estado: EstadoDeReserva;
  bookingId?: string;
  startDateTime?: Date;
  servicio?: string;
}

/**
 * Reserva la hora del lead para el cliente que pulsó «Sí, resérvala»,
 * calcada de `jobs/retryFailedBooking.ts`: lock por negocio, revalidación de
 * horario, restricciones y disponibilidad real, evento en el calendario con
 * clave determinista por lead, y en UNA transacción la Call sintética
 * (`callId = whatsapp:espera:<leadId>`, `voiceProvider = whatsapp`) y el
 * Booking colgado de su `id`. Un «Sí» que no acaba en reserva no deja
 * ninguna Call. Después (fuera del lock, sin lanzar) avisa al dueño (#1) y
 * programa solo el recordatorio: la confirmación es la respuesta de texto.
 */
export async function reservarDesdeListaDeEspera(input: {
  leadId: string;
  businessId: string;
  from: string;
  inboundMessageId: string;
  contactName: string | null;
}): Promise<ResultadoDeReserva> {
  const { leadId, businessId, from } = input;
  const etiqueta = `Sí resérvala (${input.inboundMessageId})`;

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, type: "availability_watch", call: { businessId } },
    select: { id: true, resolvedAt: true, data: true },
  });
  if (!lead) {
    return { estado: "cerrado" };
  }
  const data = datosDelLead(lead.data);
  if (
    data.clientPhone !== from ||
    !isValidAppointmentDuration(data.durationMinutes)
  ) {
    return { estado: "cerrado" };
  }
  const estadoPorCierre = async (
    resolvedAt: Date | null,
    datos: DatosDeEspera
  ) => {
    if (!resolvedAt) return null;
    if (datos.resolvedBy === "reservado") {
      // La reserva que salió de este aviso pudo cancelarse después
      // (recordatorio → «Cancelar»): «esa hora ya es tuya» sería falso.
      return (await reservaDelLeadCancelada(datos, businessId))
        ? ("cerrado" as const)
        : ("ya_reservada" as const);
    }
    if (datos.resolvedBy === "sin_respuesta") return null; // se atiende igual
    return "cerrado" as const;
  };
  const cierre = await estadoPorCierre(lead.resolvedAt, data);
  if (cierre) {
    return { estado: cierre };
  }
  const startDate = new Date(data.startDateTime);
  if (Number.isNaN(startDate.getTime()) || startDate.getTime() < Date.now()) {
    await cerrarLead(lead.id, lead.data, "pasado");
    return { estado: "pasada" };
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: SELECT_NEGOCIO_LISTA_ESPERA,
  });
  if (!business || !business.active) {
    return { estado: "error" };
  }
  if (
    business.subscriptionStatus &&
    ESTADOS_DE_SUSCRIPCION_BLOQUEADOS.has(business.subscriptionStatus)
  ) {
    console.warn(
      `[WhatsApp] ${etiqueta}: el negocio ${businessId} no puede reservar (suscripción ${business.subscriptionStatus})`
    );
    return { estado: "error" };
  }
  const conexion = resolverConexionDeCalendario(business);
  if (!conexionOperativa(conexion)) {
    console.warn(
      `[WhatsApp] ${etiqueta}: el negocio ${businessId} no tiene calendario operativo (${conexion.provider}); no se reserva a ciegas`
    );
    return { estado: "sin_calendario" };
  }

  const catalogo = await verificarCatalogo(businessId, data);

  const lockToken = await acquireBookingLock(businessId);
  if (!lockToken) {
    console.warn(
      `[WhatsApp] ${etiqueta}: no se pudo adquirir el lock de reserva de ${businessId}`
    );
    return { estado: "lock" };
  }

  let eventoCreado: string | undefined;
  try {
    // Relectura dentro del lock: el segundo de dos toques ve el primero.
    const leadAhora = await prisma.lead.findUnique({
      where: { id: lead.id },
      select: { resolvedAt: true, data: true },
    });
    const datosAhora = datosDelLead(leadAhora?.data);
    const cierreAhora = await estadoPorCierre(
      leadAhora?.resolvedAt ?? null,
      datosAhora
    );
    if (cierreAhora) {
      return { estado: cierreAhora };
    }
    const llamadaPrevia = await prisma.call.findUnique({
      where: { callId: callIdSintetico(lead.id) },
      select: { booking: { select: { id: true, isCancelled: true } } },
    });
    if (llamadaPrevia?.booking && !llamadaPrevia.booking.isCancelled) {
      return { estado: "ya_reservada", bookingId: llamadaPrevia.booking.id };
    }

    if (!reservable(business, data)) {
      await cerrarLead(lead.id, lead.data, "fuera_de_plazo");
      return { estado: "fuera_de_plazo" };
    }

    const externo = await ocupacionExterna(
      conexion,
      startDate,
      data.durationMinutes
    );
    if (usaCalendarioExterno(conexion) && !externo.calendarAvailabilityKnown) {
      console.warn(
        `[WhatsApp] ${etiqueta}: no se pudo leer el calendario ${conexion.provider} del negocio ${businessId}; no se reserva a ciegas`
      );
      return { estado: "calendario_caido" };
    }
    const disponibilidad = await checkAvailability({
      businessId,
      schedule: business.schedule,
      timezone: business.timezone || "Europe/Madrid",
      bookingCapacity: business.bookingCapacity,
      startDateTime: data.startDateTime,
      durationMinutes: data.durationMinutes,
      serviceIds: catalogo.serviceIds,
      professionalId: catalogo.professionalId,
      externalBusyIntervals: externo.intervals,
      calendarAvailabilityKnown: externo.calendarAvailabilityKnown,
      calendarOrigin: origenDeCalendario(conexion),
    });
    if (!disponibilidad.available) {
      await cerrarLead(lead.id, lead.data, "ocupado");
      return { estado: "ocupado" };
    }
    const resolvedProfessionalId =
      catalogo.professionalId ?? disponibilidad.availableProfessionals[0]?.id;
    const professionalName = catalogo.professionalId
      ? catalogo.professionalName
      : (disponibilidad.availableProfessionals[0]?.name ?? null);

    const clientName =
      sanearNombre(data.clientName) ??
      (await nombreDelQueEspera(lead, businessId)) ??
      input.contactName ??
      "Cliente de la lista de espera";

    let evento: { id?: string } | undefined;
    try {
      evento = (await calendarService.bookAppointment({
        conexion,
        clientName,
        startDateTime: data.startDateTime,
        durationMinutes: data.durationMinutes,
        clientPhone: from,
        serviceNames: catalogo.serviceNames,
        professionalName: professionalName ?? undefined,
        timezone: business.timezone || undefined,
        // Una clave por TOQUE (`distintivo`): si el primer intento creó el
        // evento y la transacción falló, el evento se deshizo; con la misma
        // clave Google respondería 409 y el adaptador devolvería ese evento
        // cancelado como éxito (reserva invisible, doble reserva). La
        // idempotencia entre toques la dan el lock, la relectura del lead y
        // la Call sintética; la doble entrega del MISMO entrante la corta
        // `InboundMessage.providerMessageId @unique`.
        idempotencyKey: buildCalendarIdempotencyKey({
          callId: callIdSintetico(lead.id),
          startDateTime: data.startDateTime,
          durationMinutes: data.durationMinutes,
          distintivo: input.inboundMessageId,
        }),
      })) as { id?: string } | undefined;
    } catch (error) {
      const proveedorRoto = proveedorDesdeErrorDeReconexion(error);
      if (proveedorRoto) {
        await marcarCalendarioDesconectado(
          businessId,
          proveedorRoto,
          { modo: "revocar" },
          { prefijo: "[WhatsApp]" }
        );
        return { estado: "sin_calendario" };
      }
      console.error(
        `[WhatsApp] ${etiqueta}: el calendario ${conexion.provider} del negocio ${businessId} no aceptó la reserva del lead ${lead.id}: ${errorMessage(error)}`
      );
      return { estado: "calendario_caido" };
    }
    eventoCreado = evento?.id;

    const now = new Date();
    let bookingId: string;
    try {
      bookingId = await prisma.$transaction(async (tx) => {
        const llamada = await tx.call.upsert({
          where: { callId: callIdSintetico(lead.id) },
          create: {
            callId: callIdSintetico(lead.id),
            voiceProvider: "whatsapp",
            providerCallId: lead.id,
            businessId,
            fromNumber: from,
            status: "COMPLETED",
            outcome: "RESOLVED",
            successful: true,
            startedAt: now,
            endedAt: now,
            durationSecs: 0,
            costCents: 0,
            summary: "Reserva desde la lista de espera por WhatsApp",
          },
          update: {},
          select: { id: true },
        });
        const reserva = await tx.booking.upsert({
          where: { callId: llamada.id },
          create: {
            callId: llamada.id,
            programedAt: startDate,
            durationMinutes: data.durationMinutes,
            numberPeople: 1,
            professionalId: resolvedProfessionalId ?? undefined,
            serviceIds: catalogo.serviceIds,
            clientName,
            clientPhone: from,
            smsConsent: true,
            createdVia: "whatsapp_lista_espera",
            externalEventId: eventoCreado ?? undefined,
            externalCalendarProvider: conexion.provider,
            externalCalendarId: conexion.calendarId,
          },
          update: {
            programedAt: startDate,
            durationMinutes: data.durationMinutes,
            professionalId: resolvedProfessionalId ?? undefined,
            serviceIds: catalogo.serviceIds,
            clientName,
            clientPhone: from,
            externalEventId: eventoCreado ?? undefined,
            externalCalendarProvider: conexion.provider,
            externalCalendarId: conexion.calendarId,
            isCancelled: false,
            cancelledAt: null,
            cancelledBy: null,
          },
          select: { id: true },
        });
        // Condicional: un «Ya no» que entró mientras se creaba el evento
        // (`cerrarAviso` no pasa por el lock) ya cerró el lead y ofreció
        // la plaza al siguiente; pisarlo dejaría al cliente con dos
        // respuestas contradictorias y una cita que no quería. Se deshace
        // todo (evento incluido, en el catch) y se responde «cerrado».
        const cerrado = await tx.lead.updateMany({
          where: {
            id: lead.id,
            OR: [
              { resolvedAt: null },
              { data: { path: ["resolvedBy"], equals: "sin_respuesta" } },
            ],
          },
          data: {
            resolvedAt: now,
            data: {
              ...((leadAhora?.data as Record<string, unknown> | null) ?? {}),
              resolvedBy: "reservado",
              bookingId: reserva.id,
              resolvedFromInboundMessageId: input.inboundMessageId,
            } as Prisma.InputJsonValue,
          },
        });
        if (cerrado.count !== 1) {
          throw new LeadCerradoEntreMediasError();
        }
        return reserva.id;
      });
    } catch (error) {
      const cerradoEntreMedias = error instanceof LeadCerradoEntreMediasError;
      if (cerradoEntreMedias) {
        console.warn(
          `[WhatsApp] ${etiqueta}: el lead ${lead.id} (negocio ${businessId}) se cerró mientras se reservaba («Ya no» concurrente); se deshace el evento ${eventoCreado ?? "—"}`
        );
      } else {
        console.error(
          `[WhatsApp] ${etiqueta}: la reserva del lead ${lead.id} (negocio ${businessId}) no se pudo guardar tras crear el evento ${eventoCreado ?? "—"}: ${errorMessage(error)}`
        );
      }
      if (eventoCreado) {
        try {
          await calendarService.cancelAppointment({
            conexion,
            eventId: eventoCreado,
          });
        } catch (errorAlBorrar) {
          console.error(
            `[WhatsApp] ${etiqueta}: no se pudo deshacer el evento ${eventoCreado}: ${errorMessage(errorAlBorrar)}`
          );
        }
      }
      return { estado: cerradoEntreMedias ? "cerrado" : "error" };
    }

    console.log(
      `[WhatsApp] ${etiqueta}: reserva ${bookingId} creada desde la lista de espera (lead ${lead.id}, negocio ${businessId})`
    );

    // Fuera de la sección crítica lógica, pero aún con el lock: rápido y sin lanzar.
    await avisarNuevaReserva({
      businessId,
      businessName: business.name,
      timezone: business.timezone || "Europe/Madrid",
      bookingId,
      clientName,
      startDateTime: startDate,
      serviceNames: catalogo.serviceNames,
      professionalName,
    }).catch((error: unknown) => {
      console.error(
        `[WhatsApp] ${etiqueta}: no se pudo avisar al negocio ${businessId} de la reserva ${bookingId}: ${errorMessage(error)}`
      );
    });
    await programarMensajesAlCliente({
      bookingId,
      etiqueta,
      confirmacion: false,
    });

    return {
      estado: "reservada",
      bookingId,
      startDateTime: startDate,
      servicio: describirServicioParaCliente(
        catalogo.serviceNames,
        professionalName
      ),
    };
  } finally {
    await releaseBookingLock(businessId, lockToken);
  }
}

// ---------------------------------------------------------------------------
// D. «Ya no»
// ---------------------------------------------------------------------------

/**
 * Cierra el aviso a petición del cliente. También cierra uno que el barrido
 * dejó `sin_respuesta` (su botón seguía vivo). Devuelve cuántos cerró y el
 * hueco que deja libre para el siguiente.
 */
export async function cerrarAviso(input: {
  leadId: string;
  resolvedBy: "ya_no";
  inboundMessageId: string;
}): Promise<{ count: number; hueco: Hueco | null }> {
  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
    select: { data: true },
  });
  if (!lead) {
    return { count: 0, hueco: null };
  }
  const data = datosDelLead(lead.data);
  const result = await prisma.lead.updateMany({
    where: {
      id: input.leadId,
      OR: [
        { resolvedAt: null },
        { data: { path: ["resolvedBy"], equals: "sin_respuesta" } },
      ],
    },
    data: {
      resolvedAt: new Date(),
      data: {
        ...((lead.data as Record<string, unknown> | null) ?? {}),
        resolvedBy: input.resolvedBy,
        resolvedFromInboundMessageId: input.inboundMessageId,
      } as Prisma.InputJsonValue,
    },
  });
  const inicio = new Date(data.startDateTime).getTime();
  const hueco = Number.isNaN(inicio)
    ? null
    : {
        inicioMs: inicio,
        finMs:
          inicio + (data.durationMinutes || DURACION_POR_DEFECTO_MIN) * 60_000,
      };
  return { count: result.count, hueco };
}
