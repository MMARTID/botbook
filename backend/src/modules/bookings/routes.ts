import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CapacitySchema,
  ProfessionalSchema,
  ResourceIdParamsSchema,
  ServiceSchema,
  UpdateProfessionalSchema,
  UpdateServiceSchema,
} from "./schemas.js";
import {
  createProfessional,
  createService,
  deleteProfessional,
  deleteService,
  getBookingSettingsPayload,
  getProfessional,
  getService,
  invalidateBusinessAgentConfigCache,
  updateProfessional,
  updateService,
} from "./service.js";
import { prisma } from "../../lib/prisma.js";

function sendValidationError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  error: z.ZodError
) {
  return reply.status(400).send({ error: error.errors });
}

function isKnownClientError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    error.message === "Uno o varios servicios no pertenecen a este negocio"
  );
}

export async function bookingSettingsRoutes(fastify: FastifyInstance) {
  const auth = { preValidation: [fastify.authenticate] };

  fastify.get(
    "/",
    auth,
    async (request: FastifyRequest, reply) => {
      try {
        return reply.send(
          await getBookingSettingsPayload(request.user!.businessId)
        );
      } catch (error) {
        fastify.log.error(error);
        return reply
          .status(500)
          .send({ error: "No se pudo obtener la configuración de reservas" });
      }
    }
  );

  fastify.patch<{ Body: z.infer<typeof CapacitySchema> }>(
    "/",
    auth,
    async (request, reply) => {
      try {
        const { bookingCapacity } = CapacitySchema.parse(request.body);
        await prisma.business.update({
          where: { id: request.user!.businessId },
          data: { bookingCapacity },
        });
        await invalidateBusinessAgentConfigCache(request.user!.businessId);
        return reply.send(
          await getBookingSettingsPayload(request.user!.businessId)
        );
      } catch (error) {
        if (error instanceof z.ZodError) return sendValidationError(reply, error);
        fastify.log.error(error);
        return reply
          .status(500)
          .send({ error: "No se pudo actualizar la capacidad de reservas" });
      }
    }
  );

  fastify.get<{ Params: z.infer<typeof ResourceIdParamsSchema> }>(
    "/services/:id",
    auth,
    async (request, reply) => {
      try {
        const { id } = ResourceIdParamsSchema.parse(request.params);
        const service = await getService(request.user!.businessId, id);
        if (!service) {
          return reply.status(404).send({ error: "Servicio no encontrado" });
        }
        return reply.send(service);
      } catch (error) {
        if (error instanceof z.ZodError) return sendValidationError(reply, error);
        fastify.log.error(error);
        return reply.status(500).send({ error: "No se pudo obtener el servicio" });
      }
    }
  );

  fastify.post<{ Body: z.infer<typeof ServiceSchema> }>(
    "/services",
    auth,
    async (request, reply) => {
      try {
        const service = await createService(
          request.user!.businessId,
          ServiceSchema.parse(request.body)
        );
        return reply.status(201).send(service);
      } catch (error) {
        if (error instanceof z.ZodError) return sendValidationError(reply, error);
        fastify.log.error(error);
        return reply.status(500).send({ error: "No se pudo crear el servicio" });
      }
    }
  );

  fastify.patch<{
    Params: z.infer<typeof ResourceIdParamsSchema>;
    Body: z.infer<typeof UpdateServiceSchema>;
  }>(
    "/services/:id",
    auth,
    async (request, reply) => {
      try {
        const { id } = ResourceIdParamsSchema.parse(request.params);
        const service = await updateService(
          request.user!.businessId,
          id,
          UpdateServiceSchema.parse(request.body)
        );
        if (!service) {
          return reply.status(404).send({ error: "Servicio no encontrado" });
        }
        return reply.send(service);
      } catch (error) {
        if (error instanceof z.ZodError) return sendValidationError(reply, error);
        fastify.log.error(error);
        return reply
          .status(500)
          .send({ error: "No se pudo actualizar el servicio" });
      }
    }
  );

  fastify.delete<{ Params: z.infer<typeof ResourceIdParamsSchema> }>(
    "/services/:id",
    auth,
    async (request, reply) => {
      try {
        const { id } = ResourceIdParamsSchema.parse(request.params);
        const service = await deleteService(request.user!.businessId, id);
        if (!service) {
          return reply.status(404).send({ error: "Servicio no encontrado" });
        }
        return reply.status(204).send();
      } catch (error) {
        fastify.log.error(error);
        return reply
          .status(500)
          .send({ error: "No se pudo retirar el servicio" });
      }
    }
  );

  fastify.get<{ Params: z.infer<typeof ResourceIdParamsSchema> }>(
    "/professionals/:id",
    auth,
    async (request, reply) => {
      try {
        const { id } = ResourceIdParamsSchema.parse(request.params);
        const professional = await getProfessional(request.user!.businessId, id);
        if (!professional) {
          return reply
            .status(404)
            .send({ error: "Profesional no encontrado" });
        }
        return reply.send(professional);
      } catch (error) {
        if (error instanceof z.ZodError) return sendValidationError(reply, error);
        fastify.log.error(error);
        return reply
          .status(500)
          .send({ error: "No se pudo obtener el profesional" });
      }
    }
  );

  fastify.post<{ Body: z.infer<typeof ProfessionalSchema> }>(
    "/professionals",
    auth,
    async (request, reply) => {
      try {
        const professional = await createProfessional(
          request.user!.businessId,
          ProfessionalSchema.parse(request.body)
        );
        return reply.status(201).send(professional);
      } catch (error) {
        if (error instanceof z.ZodError) return sendValidationError(reply, error);
        if (isKnownClientError(error)) {
          return reply.status(400).send({ error: error.message });
        }
        fastify.log.error(error);
        return reply
          .status(500)
          .send({ error: "No se pudo crear el profesional" });
      }
    }
  );

  fastify.patch<{
    Params: z.infer<typeof ResourceIdParamsSchema>;
    Body: z.infer<typeof UpdateProfessionalSchema>;
  }>(
    "/professionals/:id",
    auth,
    async (request, reply) => {
      try {
        const { id } = ResourceIdParamsSchema.parse(request.params);
        const professional = await updateProfessional(
          request.user!.businessId,
          id,
          UpdateProfessionalSchema.parse(request.body)
        );
        if (!professional) {
          return reply
            .status(404)
            .send({ error: "Profesional no encontrado" });
        }
        return reply.send(professional);
      } catch (error) {
        if (error instanceof z.ZodError) return sendValidationError(reply, error);
        if (isKnownClientError(error)) {
          return reply.status(400).send({ error: error.message });
        }
        fastify.log.error(error);
        return reply
          .status(500)
          .send({ error: "No se pudo actualizar el profesional" });
      }
    }
  );

  fastify.delete<{ Params: z.infer<typeof ResourceIdParamsSchema> }>(
    "/professionals/:id",
    auth,
    async (request, reply) => {
      try {
        const { id } = ResourceIdParamsSchema.parse(request.params);
        const professional = await deleteProfessional(
          request.user!.businessId,
          id
        );
        if (!professional) {
          return reply
            .status(404)
            .send({ error: "Profesional no encontrado" });
        }
        return reply.status(204).send();
      } catch (error) {
        fastify.log.error(error);
        return reply
          .status(500)
          .send({ error: "No se pudo retirar el profesional" });
      }
    }
  );
}
