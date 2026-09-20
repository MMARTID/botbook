import { prisma } from "../../lib/prisma.js";
import { getRedis } from "../../lib/redis.js";
import { errorMessage } from "../../lib/logUtils.js";
import { timezoneOffsetMinutes } from "../../lib/voiceDateTime.js";
import { formatScheduleForPrompt } from "../../lib/businessSchedule.js";
import { resolvePlanId } from "../../lib/planFeatures.js";
import {
  BUSINESS_TYPE_LABELS,
  isBusinessType,
} from "../../lib/businessType.js";
import {
  SELECT_CONEXION_DE_CALENDARIO,
  conexionOperativa,
  resolverConexionDeCalendario,
} from "../calendar/conexion.js";
import { limitesDelDia, mapaDeServicios } from "../whatsapp/avisosNegocio.js";
import { registrarPropuesta } from "./acciones.js";

/**
 * Tools del Gestor (PLAN-CANAL-DUENO.md § 8): `POST
 * /webhooks/telnyx/gestor/:toolName`, firmado por Telnyx igual que las tools
 * de voz. El negocio llega en la cabecera `X-Alhabla-Business`, que Telnyx
 * templa desde los `metadata.business_id` de la conversación que creó
 * Alhabla (chatDueno.ts); `X-Alhabla-Role` tiene que ser `owner`. Nada del
 * body autoriza nada. Las respuestas son compactas (texto + ids) para que el
 * LLM las cite sin inventar.
 */

export interface GestorToolInvocationResult {
  status: number;
  body: unknown;
}

/** Clave de Redis con el turno en curso del dueño (chatDueno.ts la escribe
 * antes de llamar al assistant y la borra después): así `proponer_accion`
 * sabe a qué entrante y conversación pertenece la propuesta. */
export function claveDelTurno(businessId: string): string {
  return `gestor:turno:${businessId}`;
}
/** Clave con la propuesta registrada en este turno; el chat la lee al
 * volver el assistant y añade los botones a la respuesta. */
export function claveDePropuesta(businessId: string): string {
  return `gestor:propuesta:${businessId}`;
}
export const TTL_TURNO_SEGUNDOS = 180;

interface TurnoEnCurso {
  inboundMessageId: string;
  conversationId: string;
}

async function turnoEnCurso(businessId: string): Promise<TurnoEnCurso | null> {
  try {
    const raw = await getRedis().get(claveDelTurno(businessId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TurnoEnCurso>;
    return typeof parsed.inboundMessageId === "string" &&
      typeof parsed.conversationId === "string"
      ? {
          inboundMessageId: parsed.inboundMessageId,
          conversationId: parsed.conversationId,
        }
      : null;
  } catch (error) {
    console.error(
      `[Gestor] No se pudo leer el turno en curso del negocio ${businessId}: ${errorMessage(error)}`
    );
    return null;
  }
}

const SELECT_NEGOCIO_DEL_GESTOR = {
  id: true,
  name: true,
  businessType: true,
  timezone: true,
  phone: true,
  telnyxPhoneNumber: true,
  phoneNumberStatus: true,
  address: true,
  schedule: true,
  plan: true,
  stripePriceId: true,
  subscriptionStatus: true,
  active: true,
  calendarProvider: true,
  calendarConnections: SELECT_CONEXION_DE_CALENDARIO.calendarConnections,
  services: {
    where: { active: true },
    orderBy: { name: "asc" as const },
    select: { id: true, name: true, durationMinutes: true, priceCents: true },
  },
  professionals: {
    where: { active: true },
    orderBy: { name: "asc" as const },
    select: { id: true, name: true },
  },
} as const;

function euros(priceCents: number | null): string {
  if (priceCents === null) return "sin precio";
  const euros = priceCents / 100;
  return `${Number.isInteger(euros) ? euros : euros.toFixed(2).replace(".", ",")} €`;
}

function hora(fecha: Date, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone || "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(fecha);
}

function fechaCorta(fecha: Date, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone || "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(fecha);
}

function datos(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function texto(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Citas pendientes (leads `pending_booking` sin resolver) y recados
 * (`message` sin resolver) del negocio, ya descritos para el LLM. */
async function pendientesYRecados(businessId: string, timezone: string) {
  const [pendientes, recados] = await Promise.all([
    prisma.lead.findMany({
      where: {
        type: "pending_booking",
        resolvedAt: null,
        call: { businessId },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, createdAt: true, data: true },
    }),
    prisma.lead.findMany({
      where: { type: "message", resolvedAt: null, call: { businessId } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, createdAt: true, data: true },
    }),
  ]);
  const serviceIds = [
    ...new Set(
      pendientes.flatMap((p) => {
        const ids = datos(p.data).serviceIds;
        return Array.isArray(ids)
          ? ids.filter((x): x is string => typeof x === "string")
          : [];
      })
    ),
  ];
  const porId = await mapaDeServicios(serviceIds);
  return {
    citasPendientes: pendientes.map((p) => {
      const d = datos(p.data);
      const inicio = texto(d.startDateTime)
        ? new Date(String(d.startDateTime))
        : null;
      const ids = Array.isArray(d.serviceIds)
        ? (d.serviceIds as unknown[])
        : [];
      return {
        pendienteId: p.id,
        cliente: texto(d.clientName) ?? "sin nombre",
        telefono: texto(d.clientPhone),
        cuando:
          inicio && !Number.isNaN(inicio.getTime())
            ? fechaCorta(inicio, timezone)
            : null,
        servicios: ids
          .map((id) => (typeof id === "string" ? porId.get(id) : undefined))
          .filter((n): n is string => !!n),
        motivo: texto(d.failureCode),
        pedidaEl: fechaCorta(p.createdAt, timezone),
      };
    }),
    recados: recados.map((r) => {
      const d = datos(r.data);
      return {
        recadoId: r.id,
        cliente: texto(d.clientName) ?? "sin nombre",
        telefono: texto(d.clientPhone),
        motivo: texto(d.motivo),
        quiereQueLeLlamen: d.quiereQueLeLlamen === true,
        dejadoEl: fechaCorta(r.createdAt, timezone),
      };
    }),
  };
}

async function contextoNegocio(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: SELECT_NEGOCIO_DEL_GESTOR,
  });
  if (!business) {
    return { status: 404, body: { error: "Negocio no encontrado" } };
  }
  const conexion = resolverConexionDeCalendario(business);
  const calendario = conexionOperativa(conexion)
    ? { conectado: true, proveedor: conexion.provider }
    : { conectado: false, proveedor: null };
  const { citasPendientes, recados } = await pendientesYRecados(
    business.id,
    business.timezone
  );
  const horarioConfigurado =
    formatScheduleForPrompt(business.schedule) !==
    "Horario no configurado todavía.";
  const faltaPorConfigurar = [
    !horarioConfigurado ? "horario" : null,
    business.services.length === 0 ? "servicios" : null,
    business.professionals.length === 0 ? "profesionales" : null,
    !calendario.conectado ? "calendario" : null,
    business.phoneNumberStatus !== "active"
      ? "número de teléfono de Alhabla"
      : null,
  ].filter((x): x is string => x !== null);

  return {
    status: 200,
    body: {
      negocio: {
        nombre: business.name,
        sector: isBusinessType(business.businessType)
          ? BUSINESS_TYPE_LABELS[business.businessType]
          : (business.businessType ?? "sin especificar"),
        zonaHoraria: business.timezone,
        telefonoDelLocal: business.phone.startsWith("TEMP-")
          ? null
          : business.phone,
        numeroDeAlhabla:
          business.phoneNumberStatus === "active"
            ? business.telnyxPhoneNumber
            : null,
        direccion: business.address,
        plan: resolvePlanId(business),
        suscripcion: business.subscriptionStatus ?? "sin suscripción",
      },
      servicios: business.services.map((s) => ({
        servicioId: s.id,
        nombre: s.name,
        duracionMinutos: s.durationMinutes,
        precio: euros(s.priceCents),
      })),
      profesionales: business.professionals.map((p) => ({
        profesionalId: p.id,
        nombre: p.name,
      })),
      horario: formatScheduleForPrompt(business.schedule),
      calendario,
      faltaPorConfigurar,
      citasPendientes,
      recados,
    },
  };
}

/** Medianoche local de una fecha civil AAAA-MM-DD en la zona del negocio. */
export function limitesDeFecha(
  timezone: string,
  fecha: string
): { inicio: Date; fin: Date; etiqueta: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim());
  if (!m) return null;
  const zona = timezone || "Europe/Madrid";
  const civil = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  );
  if (Number.isNaN(civil.getTime())) return null;
  const inicio = new Date(
    civil.getTime() - timezoneOffsetMinutes(civil, zona) * 60_000
  );
  const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  const etiqueta = new Intl.DateTimeFormat("es-ES", {
    timeZone: zona,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(inicio);
  return { inicio, fin, etiqueta };
}

async function listarAgenda(
  businessId: string,
  params: Record<string, unknown>
) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, timezone: true },
  });
  if (!business) {
    return { status: 404, body: { error: "Negocio no encontrado" } };
  }
  const dia = texto(params.dia)?.toLowerCase() ?? "hoy";
  const limites =
    dia === "hoy"
      ? limitesDelDia(business.timezone, 0)
      : dia === "manana" || dia === "mañana"
        ? limitesDelDia(business.timezone, 1)
        : limitesDeFecha(business.timezone, dia);
  if (!limites) {
    return {
      status: 200,
      body: { error: 'Día no válido: usa "hoy", "manana" o AAAA-MM-DD.' },
    };
  }
  const reservas = await prisma.booking.findMany({
    where: {
      call: { businessId: business.id },
      isCancelled: false,
      programedAt: { gte: limites.inicio, lt: limites.fin },
    },
    orderBy: { programedAt: "asc" },
    take: 60,
    select: {
      id: true,
      programedAt: true,
      durationMinutes: true,
      clientName: true,
      clientPhone: true,
      serviceIds: true,
      confirmedByClientAt: true,
      professional: { select: { name: true } },
      call: { select: { fromNumber: true } },
    },
  });
  const porId = await mapaDeServicios([
    ...new Set(reservas.flatMap((r) => r.serviceIds)),
  ]);
  return {
    status: 200,
    body: {
      dia: limites.etiqueta,
      total: reservas.length,
      citas: reservas.map((r) => ({
        citaId: r.id,
        hora: hora(r.programedAt, business.timezone),
        duracionMinutos: r.durationMinutes,
        cliente: r.clientName?.trim() || "sin nombre",
        telefono: r.clientPhone ?? r.call.fromNumber,
        servicios: r.serviceIds
          .map((id) => porId.get(id))
          .filter((n): n is string => !!n),
        profesional: r.professional?.name ?? null,
        confirmadaPorElCliente: r.confirmedByClientAt !== null,
      })),
    },
  };
}

async function resumenLlamadas(
  businessId: string,
  params: Record<string, unknown>
) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, timezone: true },
  });
  if (!business) {
    return { status: 404, body: { error: "Negocio no encontrado" } };
  }
  const diasPedidos = Number(params.dias);
  const dias = Number.isFinite(diasPedidos)
    ? Math.min(31, Math.max(1, Math.round(diasPedidos)))
    : 7;
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const [llamadas, porResultado, reservas, canceladas] = await Promise.all([
    prisma.call.aggregate({
      where: {
        businessId: business.id,
        startedAt: { gte: desde },
        NOT: { voiceProvider: "whatsapp" },
      },
      _count: { _all: true },
      _sum: { durationSecs: true },
    }),
    prisma.call.groupBy({
      by: ["outcome"],
      where: {
        businessId: business.id,
        startedAt: { gte: desde },
        NOT: { voiceProvider: "whatsapp" },
      },
      _count: { _all: true },
    }),
    prisma.booking.count({
      where: {
        call: { businessId: business.id },
        createdAt: { gte: desde },
        isCancelled: false,
      },
    }),
    prisma.booking.count({
      where: {
        call: { businessId: business.id },
        cancelledAt: { gte: desde },
        isCancelled: true,
      },
    }),
  ]);
  const { citasPendientes, recados } = await pendientesYRecados(
    business.id,
    business.timezone
  );
  const etiquetas: Record<string, string> = {
    RESOLVED: "resueltas",
    FRUSTRATED: "sin resolver",
    NO_ANSWER: "sin respuesta",
    ESCALATED: "derivadas al negocio",
    LEAD_CAPTURED: "con recado o datos del cliente",
  };
  return {
    status: 200,
    body: {
      dias,
      llamadas: {
        total: llamadas._count._all,
        minutos: Math.ceil((llamadas._sum.durationSecs ?? 0) / 60),
        porResultado: Object.fromEntries(
          porResultado.map((g) => [
            g.outcome ? (etiquetas[g.outcome] ?? g.outcome) : "sin clasificar",
            g._count._all,
          ])
        ),
      },
      citasReservadas: reservas,
      citasCanceladas: canceladas,
      citasPendientes,
      recados,
    },
  };
}

async function proponerAccion(
  businessId: string,
  params: Record<string, unknown>
) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, timezone: true },
  });
  if (!business) {
    return { status: 404, body: { error: "Negocio no encontrado" } };
  }
  const turno = await turnoEnCurso(business.id);
  if (!turno) {
    // Sin turno en curso no hay a quién enseñarle los botones: la propuesta
    // se pierde y el LLM debe decirlo.
    console.warn(
      `[Gestor] proponer_accion del negocio ${business.id} fuera de un turno de chat; se rechaza`
    );
    return {
      status: 200,
      body: {
        ok: false,
        motivo:
          "No hay una conversación en curso a la que añadir los botones. Pide al dueño que lo vuelva a escribir.",
      },
    };
  }
  const propuesta = await registrarPropuesta({
    businessId: business.id,
    timezone: business.timezone,
    conversationId: turno.conversationId,
    inboundMessageId: turno.inboundMessageId,
    tipo: params.tipo,
    parametros: params.parametros,
    resumen: params.resumen,
  });
  if (!propuesta.ok) {
    return { status: 200, body: { ok: false, motivo: propuesta.motivo } };
  }
  try {
    await getRedis().set(
      claveDePropuesta(business.id),
      propuesta.accionId,
      "EX",
      TTL_TURNO_SEGUNDOS
    );
  } catch (error) {
    console.error(
      `[Gestor] La propuesta ${propuesta.accionId} quedó registrada pero no se pudo anotar para el turno: ${errorMessage(error)}`
    );
  }
  return {
    status: 200,
    body: {
      ok: true,
      accionId: propuesta.accionId,
      recurso: propuesta.descripcion,
      mensaje:
        "Propuesta registrada. El sistema añade los botones Confirmar y Cancelar a tu respuesta: di solo qué va a pasar si confirma, sin dar nada por hecho.",
    },
  };
}

/**
 * Punto de entrada del webhook: negocio y rol vienen de las cabeceras
 * templadas por Telnyx desde los metadata de la conversación.
 */
export async function handleGestorToolInvocation(input: {
  businessId: string | undefined;
  role: string | undefined;
  toolName: string;
  params: Record<string, unknown>;
}): Promise<GestorToolInvocationResult> {
  const { businessId, role, toolName, params } = input;
  if (!businessId || businessId.includes("{{")) {
    console.error(
      `[Gestor] Falta la cabecera X-Alhabla-Business en ${toolName}`
    );
    return { status: 400, body: { error: "Missing business" } };
  }
  if (role !== "owner") {
    console.warn(
      `[Gestor] Tool ${toolName} del negocio ${businessId} con rol "${role ?? "?"}"; se rechaza`
    );
    return { status: 403, body: { error: "Forbidden" } };
  }
  try {
    switch (toolName) {
      case "contexto_negocio":
        return await contextoNegocio(businessId);
      case "listar_agenda":
        return await listarAgenda(businessId, params);
      case "resumen_llamadas":
        return await resumenLlamadas(businessId, params);
      case "proponer_accion":
        return await proponerAccion(businessId, params);
      default:
        console.warn(`[Gestor] Tool desconocida: ${toolName}`);
        return { status: 404, body: { error: "Unknown tool" } };
    }
  } catch (error) {
    console.error(
      `[Gestor] Error ejecutando ${toolName} del negocio ${businessId}: ${errorMessage(error)}`
    );
    return { status: 500, body: { error: "Internal server error" } };
  }
}
