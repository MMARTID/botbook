import type { FastifyPluginAsync } from "fastify";
import { getPhoneNumberStatus, provisionPhoneNumber } from "./service.js";

export const phoneRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/business/me/phone",
    { preValidation: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const status = await getPhoneNumberStatus(request.user!.businessId);
        if (!status) {
          return reply.status(404).send({ error: "Business not found" });
        }
        return reply.send(status);
      } catch (error) {
        fastify.log.error({ err: error }, "Failed to get phone number status");
        return reply.status(500).send({ error: "Failed to get phone number status" });
      }
    }
  );

  fastify.post(
    "/business/me/phone/provision",
    { preValidation: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const result = await provisionPhoneNumber(request.user!.businessId);
        return reply.send(result);
      } catch (error) {
        fastify.log.error({ err: error }, "Failed to provision phone number");
        return reply.status(500).send({ error: "Failed to provision phone number" });
      }
    }
  );
};
