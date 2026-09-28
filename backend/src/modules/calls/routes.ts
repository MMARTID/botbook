import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { z } from "zod";
import { conUrlDeGrabacionFirmada } from "../../lib/grabacionFirmada.js";
import { planAllows, resolvePlanId } from "../../lib/planFeatures.js";
import { getCallAnalytics } from "./analytics.js";

const PaginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const AnalyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
});

export async function callsRoutes(fastify: FastifyInstance) {
  // Get all calls for the authenticated user's business
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
        const { limit, offset } = PaginationSchema.parse(request.query);
        const businessId = request.user!.businessId;

        const [calls, total] = await Promise.all([
          prisma.call.findMany({
            where: { businessId },
            include: {
              // select explícito en el agente: `agent: true` arrastraba el
              // systemPrompt completo (varios KB del prompt gestionado) en
              // cada una de las filas de la página, siempre el mismo texto.
              agent: { select: { id: true, name: true, voice: true } },
              booking: { include: { professional: { select: { id: true, name: true } } } },
            },
            take: limit,
            skip: offset,
            orderBy: { createdAt: "desc" },
          }),
          prisma.call.count({ where: { businessId } }),
        ]);

        // Booking.serviceIds es un array de IDs, no una relación de Prisma.
        // Se resuelve de una vez para toda la página: consultar por cada fila
        // degradaría el historial exactamente cuando más actividad tiene el negocio.
        const serviceIds = [
          ...new Set(calls.flatMap((call) => call.booking?.serviceIds ?? [])),
        ];
        const services = serviceIds.length
          ? await prisma.service.findMany({
              where: { businessId, id: { in: serviceIds } },
              select: { id: true, name: true, durationMinutes: true, priceCents: true },
            })
          : [];
        const servicesById = new Map(services.map((service) => [service.id, service]));

        return reply.send({
          data: calls.map((call) => ({
            ...call,
            booking: call.booking
              ? {
                  ...call.booking,
                  services: call.booking.serviceIds
                    .map((serviceId) => servicesById.get(serviceId))
                    .filter((service) => service !== undefined),
                }
              : null,
          })),
          total,
          limit,
          offset,
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
            error:
              "La analítica avanzada está disponible en el plan Scale.",
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
          return reply.status(404).send({ error: "Call not found" });
        }

        // Booking.serviceIds es un array nativo de Postgres, sin relación de
        // Prisma a Service (ver comentario en schema.prisma) — hay que
        // resolver los nombres aparte para que el frontend no reciba solo IDs.
        let services: { id: string; name: string; durationMinutes: number }[] =
          [];
        if (call.booking?.serviceIds?.length) {
          services = await prisma.service.findMany({
            where: { id: { in: call.booking.serviceIds }, businessId },
            select: { id: true, name: true, durationMinutes: true },
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

        return reply.send({
          ...signedCall,
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
}
