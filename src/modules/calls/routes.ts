import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { z } from "zod";

const PaginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export async function callsRoutes(fastify: FastifyInstance) {
  // Get all calls for the authenticated user's business
  fastify.get<{ Querystring: z.infer<typeof PaginationSchema> }>(
    "/business/me/calls",
    { preValidation: [fastify.authenticate] },
    async (
      request: FastifyRequest<{ Querystring: z.infer<typeof PaginationSchema> }>,
      reply
    ) => {
      try {
        const { limit, offset } = PaginationSchema.parse(request.query);
        const businessId = request.user!.businessId;

        const [calls, total] = await Promise.all([
          prisma.call.findMany({
            where: { businessId },
            include: { agent: true },
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
            businessId: businessId // Ensure call belongs to user's business
          },
          include: {
            agent: true,
            transcript: true,
            recording: true,
            leads: true,
            booking: true,
            order: true
          },
        });

        if (!call) {
          return reply.status(404).send({ error: "Call not found" });
        }

        return reply.send(call);
      } catch (error) {
        return reply.status(500).send({ error: "Failed to fetch call" });
      }
    }
  );
}
