import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { deleteStorageObject, getSignedRecordingUrl } from "../../lib/storage.js";

const UpdateRecordingSchema = z.object({
  reviewed: z.boolean().optional(),
  reviewNotes: z.string().optional(),
});

/**
 * El bucket de R2 es privado — el storageUrl guardado en BD no sirve para
 * reproducir nada (URL de API S3 sin firmar). Antes de responder al
 * frontend, lo sustituimos por una URL firmada temporal generada al vuelo
 * a partir de storageKey. Si falla la firma, no rompemos la respuesta: cae
 * a null, y el frontend ya sabe usar vapiUrl como alternativa.
 */
async function withSignedRecordingUrl<
  T extends { storageKey: string | null; storageUrl: string | null }
>(recording: T): Promise<T> {
  if (!recording.storageKey) {
    return recording;
  }
  try {
    const storageUrl = await getSignedRecordingUrl(recording.storageKey);
    return { ...recording, storageUrl };
  } catch (error) {
    console.error("[Recordings] No se pudo generar la URL firmada:", error);
    return { ...recording, storageUrl: null };
  }
}

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

        const data = await Promise.all(recordings.map(withSignedRecordingUrl));

        return reply.send({
          data,
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

        return reply.send(await withSignedRecordingUrl(recording));
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

        return reply.send(await withSignedRecordingUrl(recording));
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

        return reply.send(await withSignedRecordingUrl(updated));
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
