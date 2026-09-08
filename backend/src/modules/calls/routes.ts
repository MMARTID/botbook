import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { z } from "zod";
import { getSignedRecordingUrl } from "../../lib/storage.js";

const PaginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * El bucket de R2 es privado — storageUrl guardado en BD es una URL de API
 * S3 sin firmar, no reproducible. CallDetailModal (frontend) prioriza este
 * storageUrl sobre el de Retell, así que sin firmar aquí el audio dejaba de
 * reproducirse en cuanto la grabación ya estaba copiada a R2 (hallazgo #15
 * de la auditoría) — mismo patrón que recordings/routes.ts. Si falla la
 * firma, cae a null en vez de romper la respuesta: el frontend ya sabe usar
 * vapiUrl (Retell) como alternativa.
 */
async function withSignedRecordingUrl<
  T extends {
    recording: { storageKey: string | null; storageUrl: string | null } | null;
  },
>(call: T): Promise<T> {
  if (!call.recording?.storageKey) {
    return call;
  }
  try {
    const storageUrl = await getSignedRecordingUrl(call.recording.storageKey);
    return { ...call, recording: { ...call.recording, storageUrl } };
  } catch (error) {
    console.error(
      "[Calls] No se pudo generar la URL firmada de la grabación:",
      error
    );
    return { ...call, recording: { ...call.recording, storageUrl: null } };
  }
}

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
            include: { agent: true, booking: true },
            take: limit,
            skip: offset,
            orderBy: { createdAt: "desc" },
          }),
          prisma.call.count({ where: { businessId } }),
        ]);

        return reply.send({
          data: calls,
          total,
          limit,
          offset,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        return reply.status(500).send({ error: "Failed to fetch calls" });
      }
    }
  );

  // Get a single call by ID (must belong to user's business)
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
            agent: true,
            transcript: true,
            recording: true,
            leads: true,
            booking: { include: { professional: true } },
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
            where: { id: { in: call.booking.serviceIds } },
            select: { id: true, name: true, durationMinutes: true },
          });
        }

        const signedCall = await withSignedRecordingUrl(call);

        return reply.send({
          ...signedCall,
          booking: signedCall.booking
            ? { ...signedCall.booking, services }
            : signedCall.booking,
        });
      } catch (error) {
        return reply.status(500).send({ error: "Failed to fetch call" });
      }
    }
  );
}
