import { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { z } from "zod";
import { conUrlDeGrabacionFirmada } from "../../lib/grabacionFirmada.js";
import { planAllows, resolvePlanId } from "../../lib/planFeatures.js";
import { getCallAnalytics } from "./analytics.js";
import {
  FiltrosDeLlamadasSchema,
  TIPO_RECADO,
  condicionesDelListado,
  filtroDeLlamadas,
  ordenDelListado,
  resumenDeHoy,
} from "./listado.js";
import { MAX_FILAS_CSV, generarCsv } from "./exportarCsv.js";

const PaginationSchema = FiltrosDeLlamadasSchema.extend({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  // «hoy»: añade el resumen del día que pinta la cabecera del historial de
  // escritorio. Opcional porque el móvil pide páginas seguidas y no lo usa.
  resumen: z.enum(["hoy"]).optional(),
});

const AnalyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
});

const RecadoBodySchema = z.object({ atendido: z.boolean() });

/** Lo que el panel necesita de los leads de una llamada para el recado. */
const SELECT_RECADO = {
  where: { type: TIPO_RECADO },
  select: { id: true, resolvedAt: true, data: true },
  orderBy: { createdAt: "desc" as const },
};

type LeadDeRecado = { id: string; resolvedAt: Date | null; data: unknown };

function textoOpcional(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * El recado de una llamada, tal y como lo pinta el panel. Si una llamada
 * acabara con más de uno, sigue pendiente mientras quede alguno sin atender:
 * dar por devuelta la llamada por cerrar solo uno escondería el otro.
 */
export function describirRecado(leads: LeadDeRecado[] | null | undefined) {
  if (!leads || leads.length === 0) return null;
  const masReciente = leads[0];
  const data = (masReciente.data ?? {}) as Record<string, unknown>;
  const pendiente = leads.some((lead) => lead.resolvedAt === null);
  const atendidoAt = pendiente
    ? null
    : leads.reduce<Date | null>(
        (ultima, lead) =>
          lead.resolvedAt && (!ultima || lead.resolvedAt > ultima)
            ? lead.resolvedAt
            : ultima,
        null
      );
  return {
    id: masReciente.id,
    nombre: textoOpcional(data.clientName),
    telefono: textoOpcional(data.clientPhone),
    motivo: textoOpcional(data.motivo),
    atendidoAt: atendidoAt?.toISOString() ?? null,
  };
}

/** Lo que el listado y el CSV traen de cada llamada. */
const INCLUDE_DEL_LISTADO = {
  // select explícito en el agente: `agent: true` arrastraba el systemPrompt
  // completo (varios KB del prompt gestionado) en cada una de las filas de
  // la página, siempre el mismo texto.
  agent: { select: { id: true, name: true, voice: true } },
  booking: { include: { professional: { select: { id: true, name: true } } } },
  leads: SELECT_RECADO,
} as const;

/**
 * Booking.serviceIds es un array de IDs, no una relación de Prisma. Se
 * resuelve de una vez para toda la página: consultar por cada fila degradaría
 * el historial exactamente cuando más actividad tiene el negocio.
 */
async function conServiciosYRecado<
  T extends {
    leads: LeadDeRecado[];
    booking: { serviceIds: string[] } | null;
  },
>(businessId: string, calls: T[]) {
  const serviceIds = [
    ...new Set(calls.flatMap((call) => call.booking?.serviceIds ?? [])),
  ];
  const services = serviceIds.length
    ? await prisma.service.findMany({
        where: { businessId, id: { in: serviceIds } },
        select: {
          id: true,
          name: true,
          durationMinutes: true,
          priceCents: true,
        },
      })
    : [];
  const servicesById = new Map(
    services.map((service) => [service.id, service])
  );

  return calls.map(({ leads, ...call }) => ({
    ...call,
    recado: describirRecado(leads),
    booking: call.booking
      ? {
          ...call.booking,
          services: call.booking.serviceIds
            .map((serviceId) => servicesById.get(serviceId))
            .filter((service) => service !== undefined),
        }
      : null,
  }));
}

export async function callsRoutes(fastify: FastifyInstance) {
  // El historial del panel: página, filtros combinables y los recuentos de
  // las pestañas del móvil, que no cambian al buscar ni al filtrar.
  fastify.get<{ Querystring: z.infer<typeof PaginationSchema> }>(
    "/business/me/calls",
    { preValidation: [fastify.authenticate] },
    async (
      request: FastifyRequest<{
        Querystring: z.infer<typeof PaginationSchema>;
      }>,
      reply
    ) => {
      try {
        const { limit, offset, resumen, ...filtros } = PaginationSchema.parse(
          request.query
        );
        const businessId = request.user!.businessId;
        const where = await condicionesDelListado(businessId, filtros);

        const [calls, total, todas, conCita, porDevolver, hoy] =
          await Promise.all([
            prisma.call.findMany({
              where,
              include: INCLUDE_DEL_LISTADO,
              take: limit,
              skip: offset,
              orderBy: ordenDelListado(filtros.orden),
            }),
            prisma.call.count({ where }),
            prisma.call.count({ where: filtroDeLlamadas(businessId, "todas") }),
            prisma.call.count({
              where: filtroDeLlamadas(businessId, "con_cita"),
            }),
            prisma.call.count({
              where: filtroDeLlamadas(businessId, "por_devolver"),
            }),
            resumen === "hoy" ? resumenDeHoy(businessId) : null,
          ]);

        return reply.send({
          data: await conServiciosYRecado(businessId, calls),
          total,
          limit,
          offset,
          filtro: filtros.filtro,
          conteos: { todas, conCita, porDevolver },
          ...(hoy ? { hoy } : {}),
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        fastify.log.error({ err: error }, "[Calls] Failed to fetch calls");
        return reply.status(500).send({ error: "Failed to fetch calls" });
      }
    }
  );

  // El historial filtrado en CSV, con los mismos filtros que la tabla. Sin
  // paginar hasta MAX_FILAS_CSV: más allá ya no es una exportación del
  // panel, y la cabecera X-Filas-Omitidas avisa de lo que se quedó fuera.
  fastify.get<{ Querystring: z.infer<typeof FiltrosDeLlamadasSchema> }>(
    "/business/me/calls/export.csv",
    { preValidation: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const filtros = FiltrosDeLlamadasSchema.parse(request.query);
        const businessId = request.user!.businessId;
        const where = await condicionesDelListado(businessId, filtros);
        const [calls, total, negocio] = await Promise.all([
          prisma.call.findMany({
            where,
            include: INCLUDE_DEL_LISTADO,
            take: MAX_FILAS_CSV,
            orderBy: ordenDelListado(filtros.orden),
          }),
          prisma.call.count({ where }),
          prisma.business.findUnique({
            where: { id: businessId },
            select: { timezone: true },
          }),
        ]);
        const csv = generarCsv(
          await conServiciosYRecado(businessId, calls),
          negocio?.timezone || "Europe/Madrid"
        );
        const hoy = new Date().toISOString().slice(0, 10);
        fastify.log.info(
          `[Calls] Exportación CSV del negocio ${businessId}: ${calls.length} de ${total} llamadas`
        );
        return reply
          .header("Content-Type", "text/csv; charset=utf-8")
          .header(
            "Content-Disposition",
            `attachment; filename="llamadas-${hoy}.csv"`
          )
          .header("X-Filas-Omitidas", String(Math.max(0, total - calls.length)))
          .header("Cache-Control", "no-store")
          .send(csv);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        fastify.log.error({ err: error }, "[Calls] Falló la exportación CSV");
        return reply
          .status(500)
          .send({ error: "No se pudo exportar el historial" });
      }
    }
  );

  // Get a single call by ID (must belong to user's business)
  // Analítica avanzada — feature del plan Scale (planFeatures.ts). Registrada
  // antes de /:id; Fastify resuelve la ruta estática con prioridad igualmente.
  fastify.get<{ Querystring: z.infer<typeof AnalyticsQuerySchema> }>(
    "/business/me/calls/analytics",
    { preValidation: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { days } = AnalyticsQuerySchema.parse(request.query);
        const businessId = request.user!.businessId;

        const business = await prisma.business.findUnique({
          where: { id: businessId },
          select: { plan: true, stripePriceId: true },
        });
        if (!business) {
          return reply.status(404).send({ error: "Negocio no encontrado" });
        }
        const planId = resolvePlanId(business);
        if (!planAllows(planId, "analitica_avanzada")) {
          return reply.status(403).send({
            error: "La analítica avanzada está disponible en el plan Scale.",
            code: "PLAN_LIMIT_ANALYTICS",
            planId,
            limit: null,
          });
        }

        return reply.send(await getCallAnalytics(businessId, days));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        fastify.log.error({ err: error }, "[Calls] analytics failed");
        return reply
          .status(500)
          .send({ error: "No se pudo calcular la analítica" });
      }
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/business/me/calls/:id",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      try {
        const businessId = request.user!.businessId;
        const callId = request.params.id;

        const call = await prisma.call.findUnique({
          where: {
            id: callId,
            businessId: businessId, // Ensure call belongs to user's business
          },
          include: {
            // Lo mismo que el listado: del agente, solo lo que se pinta.
            // `agent: true` mandaba la fila entera (el systemPrompt completo,
            // sus ids de Retell/Telnyx y la configuración del modelo) en el
            // detalle de cada llamada, y el panel ni siquiera la usa.
            agent: { select: { id: true, name: true, voice: true } },
            transcript: true,
            recording: true,
            leads: true,
            booking: {
              include: { professional: { select: { id: true, name: true } } },
            },
          },
        });

        if (!call) {
          return reply.status(404).send({ error: "Llamada no encontrada" });
        }

        // Booking.serviceIds es un array nativo de Postgres, sin relación de
        // Prisma a Service (ver comentario en schema.prisma) — hay que
        // resolver los nombres aparte para que el frontend no reciba solo IDs.
        let services: {
          id: string;
          name: string;
          durationMinutes: number;
          priceCents: number | null;
        }[] = [];
        if (call.booking?.serviceIds?.length) {
          services = await prisma.service.findMany({
            where: { id: { in: call.booking.serviceIds }, businessId },
            select: {
              id: true,
              name: true,
              durationMinutes: true,
              priceCents: true,
            },
          });
        }

        // Una grabación retirada del panel no debe reaparecer por el detalle
        // de llamada ni generar una URL firmada nueva.
        const callWithVisibleRecording = call.recording?.deletedAt
          ? { ...call, recording: null }
          : call;
        const signedCall = callWithVisibleRecording.recording
          ? {
              ...callWithVisibleRecording,
              recording: await conUrlDeGrabacionFirmada(
                callWithVisibleRecording.recording,
                "Calls"
              ),
            }
          : callWithVisibleRecording;

        const recados = (call.leads ?? [])
          .filter((lead) => lead.type === TIPO_RECADO)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        return reply.send({
          ...signedCall,
          recado: describirRecado(recados),
          booking: signedCall.booking
            ? { ...signedCall.booking, services }
            : signedCall.booking,
        });
      } catch (error) {
        fastify.log.error({ err: error }, "[Calls] Failed to fetch call");
        return reply.status(500).send({ error: "Failed to fetch call" });
      }
    }
  );

  // «Marcar como devuelta» del panel: el mismo cierre que el botón
  // «Atendido» del aviso de WhatsApp (whatsapp/router.ts, botonDeRecado), y
  // su vuelta atrás. Reabrir no reprograma el recordatorio del día
  // siguiente: lo vuelve a contar como pendiente en el panel y en el Gestor.
  fastify.patch<{
    Params: { id: string };
    Body: z.infer<typeof RecadoBodySchema>;
  }>(
    "/business/me/calls/:id/recado",
    { preValidation: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { atendido } = RecadoBodySchema.parse(request.body);
        const businessId = request.user!.businessId;
        const callId = request.params.id;

        const call = await prisma.call.findFirst({
          where: { id: callId, businessId },
          select: { id: true },
        });
        if (!call) {
          return reply.status(404).send({ error: "Llamada no encontrada" });
        }

        const cambiados = await prisma.lead.updateMany({
          where: {
            callId: call.id,
            type: TIPO_RECADO,
            resolvedAt: atendido ? null : { not: null },
          },
          data: atendido
            ? { resolvedAt: new Date(), snoozedUntil: null }
            : { resolvedAt: null },
        });

        const recados = await prisma.lead.findMany({
          where: { callId: call.id, ...SELECT_RECADO.where },
          select: SELECT_RECADO.select,
          orderBy: SELECT_RECADO.orderBy,
        });
        if (recados.length === 0) {
          return reply
            .status(404)
            .send({ error: "Esta llamada no tiene ningún recado" });
        }

        fastify.log.info(
          `[Calls] Recado de la llamada ${call.id} (negocio ${businessId}) ${atendido ? "atendido" : "reabierto"} desde el panel (${cambiados.count} cambiados)`
        );
        return reply.send({ recado: describirRecado(recados) });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        fastify.log.error(
          { err: error },
          "[Calls] No se pudo actualizar el recado"
        );
        return reply
          .status(500)
          .send({ error: "No se pudo actualizar el recado" });
      }
    }
  );
}
