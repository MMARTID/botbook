import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getStripeClient, getStripeWebhookSecret } from "../../lib/stripe.js";
import { CreateCheckoutSessionSchema } from "./schemas.js";
import {
  createCheckoutSession,
  createCustomerPortalSession,
  getBillingSummary,
  handleStripeEvent,
  reconcileCheckoutSession,
} from "./service.js";

const strictRateLimit = {
  max: 10,
  timeWindow: "1 minute",
};

const standardRateLimit = {
  max: 30,
  timeWindow: "1 minute",
};

export const billingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/summary",
    { preValidation: [fastify.authenticate], config: { rateLimit: standardRateLimit } },
    async (request, reply) => {
      const summary = await getBillingSummary(request.user!.businessId);
      if (!summary) {
        return reply.status(404).send({ error: "Business not found" });
      }
      return reply.send(summary);
    },
  );

  fastify.post(
    "/checkout-session",
    { preValidation: [fastify.authenticate], config: { rateLimit: strictRateLimit } },
    async (request, reply) => {
      try {
        const { planId } = CreateCheckoutSessionSchema.parse(request.body);
        const session = await createCheckoutSession({
          businessId: request.user!.businessId,
          userId: request.user!.id,
          planId,
        });
        return reply.send(session);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.flatten() });
        }
        fastify.log.error({ err: error }, "Unable to create Stripe Checkout Session");
        return reply.status(503).send({ error: "Billing checkout is unavailable" });
      }
    },
  );

  fastify.post(
    "/portal-session",
    { preValidation: [fastify.authenticate], config: { rateLimit: strictRateLimit } },
    async (request, reply) => {
      try {
        const session = await createCustomerPortalSession(request.user!.businessId);
        return reply.send({ url: session.url });
      } catch (error) {
        fastify.log.error({ err: error }, "Unable to create Stripe Customer Portal Session");
        return reply.status(503).send({ error: "Billing portal is unavailable" });
      }
    },
  );

  fastify.post(
    "/checkout-session/:sessionId/reconcile",
    { preValidation: [fastify.authenticate], config: { rateLimit: strictRateLimit } },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId?: string };
      if (!sessionId?.startsWith("cs_")) {
        return reply.status(400).send({ error: "Invalid Checkout Session" });
      }

      try {
        const summary = await reconcileCheckoutSession({
          businessId: request.user!.businessId,
          sessionId,
        });
        return reply.send(summary);
      } catch (error) {
        fastify.log.error({ err: error }, "Unable to reconcile Stripe Checkout Session");
        return reply.status(403).send({ error: "Checkout Session could not be reconciled" });
      }
    },
  );

  fastify.post(
    "/webhook",
    { config: { rawBody: true }, bodyLimit: 1024 * 1024 },
    async (request, reply) => {
      const signature = request.headers["stripe-signature"];
      if (typeof signature !== "string" || !request.rawBody) {
        return reply.status(400).send({ error: "Missing Stripe signature or raw body" });
      }

      let event;
      try {
        event = getStripeClient().webhooks.constructEvent(
          request.rawBody,
          signature,
          getStripeWebhookSecret(),
        );
      } catch (error) {
        fastify.log.warn({ err: error }, "Stripe webhook signature verification failed");
        return reply.status(400).send({ error: "Invalid webhook signature" });
      }

      try {
        const result = await handleStripeEvent(event);
        return reply.send({ received: true, duplicate: result.duplicate });
      } catch (error) {
        fastify.log.error({ err: error }, "Stripe webhook processing failed");
        return reply.status(500).send({ error: "Webhook processing failed" });
      }
    },
  );
};
