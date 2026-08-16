import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { deleteStorageObject } from "../../lib/storage.js";

const UpdateRecordingSchema = z.object({
  reviewed: z.boolean().optional(),
  reviewNotes: z.string().optional(),
});

export async function recordingsRoutes(fastify: FastifyInstance) {
  // Get recordings for the authenticated business
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/business/me/recordings",
    { preValidation: [fastify.authenticate] },
    async (
      request: FastifyRequest<{
        Querystring: { limit?: string; offset?: string };
      }>,
      reply
    ) => {
      try {
        const limit = Math.min(parseInt(request.query.limit || "20"), 100);
        const offset = parseInt(request.query.offset || "0");
        const businessId = request.user!.businessId;

        const recordings = await prisma.recording.findMany({
          where: {
            call: {
              businessId,
            },
          },
          include: {
            call: {
              include: {
                agent: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        });

        const total = await prisma.recording.count({
          where: {
            call: {
              businessId,
            },
          },
        });

        return reply.send({
          data: recordings,
          total,
          limit,
          offset,
        });
      } catch (error) {
        return reply.status(500).send({ error: "Failed to fetch recordings" });
      }
    }
  );

  // Get recording by call ID
  fastify.get<{ Params: { callId: string } }>(
    "/calls/:callId/recording",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest<{ Params: { callId: string } }>, reply) => {
      try {
        const recording = await prisma.recording.findUnique({
          where: { callId: request.params.callId },
          include: {
            call: {
              include: {
                agent: true,
                business: true,
              },
            },
          },
        });

        if (!recording || recording.call.businessId !== request.user!.businessId) {
          return reply.status(404).send({ error: "Recording not found" });
        }

        return reply.send(recording);
      } catch (error) {
        return reply.status(500).send({ error: "Failed to fetch recording" });
      }
    }
  );

  // Get recording by ID
  fastify.get<{ Params: { id: string } }>(
    "/recordings/:id",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      try {
        const recording = await prisma.recording.findUnique({
          where: { id: request.params.id },
          include: {
            call: {
              include: {
                agent: true,
                business: true,
              },
            },
          },
        });

        if (!recording || recording.call.businessId !== request.user!.businessId) {
          return reply.status(404).send({ error: "Recording not found" });
        }

        return reply.send(recording);
      } catch (error) {
        return reply.status(500).send({ error: "Failed to fetch recording" });
      }
    }
  );

  // Update recording (add review notes, mark as reviewed)
  fastify.patch<{ Params: { id: string }; Body: z.infer<typeof UpdateRecordingSchema> }>(
    "/recordings/:id",
    { preValidation: [fastify.authenticate] },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof UpdateRecordingSchema>;
      }>,
      reply
    ) => {
      try {
        const data = UpdateRecordingSchema.parse(request.body);

        const recording = await prisma.recording.findUnique({
          where: { id: request.params.id },
          include: { call: true },
        });

        if (!recording || recording.call.businessId !== request.user!.businessId) {
          return reply.status(404).send({ error: "Recording not found" });
        }

        const updated = await prisma.recording.update({
          where: { id: request.params.id },
          data,
        });

        return reply.send(updated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        return reply
          .status(500)
          .send({ error: "Failed to update recording" });
      }
    }
  );

  // Delete recording
  fastify.delete<{ Params: { id: string } }>(
    "/recordings/:id",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      try {
        const recording = await prisma.recording.findUnique({
          where: { id: request.params.id },
          include: { call: true },
        });

        if (!recording || recording.call.businessId !== request.user!.businessId) {
          return reply.status(404).send({ error: "Recording not found" });
        }

        // Eliminar del almacenamiento R2/S3 si existe storageKey
        if (recording.storageKey) {
          try {
            await deleteStorageObject(recording.storageKey);
          } catch (storageError) {
            fastify.log.error({ err: storageError }, "[Recording] Failed to delete from storage");
            // Continuamos para eliminar el registro de la BD aunque falle R2
          }
        }

        await prisma.recording.delete({
          where: { id: request.params.id },
        });

        return reply.status(204).send();
      } catch (error) {
        return reply
          .status(500)
          .send({ error: "Failed to delete recording" });
      }
    }
  );
}
