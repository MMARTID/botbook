// src/modules/onboarding/routes.ts

import { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { BusinessScheduleSchema } from "../../lib/businessSchedule.js";

export type OnboardingSteps = {
  schedule: boolean;
  services: boolean;
  professionals: boolean;
  calendar: boolean;
  forwarding: boolean;
};

/**
 * Estado del último paso, el desvío de la línea del negocio hacia el número
 * de Alhabla:
 * - `waiting_number`: el número comprado todavía no está activo (Telnyx tarda
 *   unos minutos en aprobarlo), así que aún no hay nada a lo que desviar.
 * - `ready`: hay número activo y el desvío está sin activar o sin confirmar.
 * - `done`: ha entrado una llamada real (prueba de que el desvío funciona) o
 *   el usuario confirmó haberlo activado.
 */
export type ForwardingStatus = "waiting_number" | "ready" | "done";

export type OnboardingForwarding = {
  status: ForwardingStatus;
  phoneNumber: string | null;
  confirmedAt: string | null;
  firstCallAt: string | null;
};

export type OnboardingStateResponse = {
  steps: OnboardingSteps;
  progress: number;
  dismissedAt: string | null;
  completedAt: string | null;
  isActive: boolean;
  forwarding: OnboardingForwarding;
};

function isValidSchedule(schedule: unknown): boolean {
  const result = BusinessScheduleSchema.safeParse(schedule);
  return result.success;
}

async function getOrCreateOnboardingState(businessId: string) {
  let state = await prisma.onboardingState.findUnique({
    where: { businessId },
  });

  if (!state) {
    state = await prisma.onboardingState.create({
      data: { businessId },
    });
  }

  return state;
}

export async function onboardingRoutes(fastify: FastifyInstance) {
  // Get onboarding state for the authenticated business
  fastify.get(
    "/business/me/onboarding",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const businessId = request.user!.businessId;

        const business = await prisma.business.findUnique({
          where: { id: businessId },
          include: {
            services: { where: { active: true } },
            professionals: { where: { active: true } },
          },
        });

        if (!business) {
          return reply.status(404).send({ error: "Business not found" });
        }

        const onboardingState = await getOrCreateOnboardingState(businessId);

        // La primera llamada recibida es la única prueba real de que el
        // desvío está activo: nada en la API de Telnyx dice si el negocio lo
        // marcó en su terminal.
        const firstCall = await prisma.call.findFirst({
          where: { businessId },
          orderBy: { startedAt: "asc" },
          select: { startedAt: true },
        });

        const phoneNumber =
          business.telnyxPhoneNumber ?? business.twilioPhoneNumber;
        const phoneIsActive =
          business.twilioPhoneNumberStatus === "active" && phoneNumber !== null;

        const forwardingDone =
          firstCall !== null || onboardingState.forwardingConfirmedAt !== null;

        const forwarding: OnboardingForwarding = {
          status: forwardingDone
            ? "done"
            : phoneIsActive
              ? "ready"
              : "waiting_number",
          phoneNumber,
          confirmedAt:
            onboardingState.forwardingConfirmedAt?.toISOString() ?? null,
          firstCallAt: firstCall?.startedAt.toISOString() ?? null,
        };

        const activeCalendarProvider =
          business.calendarProvider === "outlook" ? "outlook" : "google";
        const hasCalendar =
          (activeCalendarProvider === "outlook" &&
            business.outlookCalendarConnected) ||
          (activeCalendarProvider === "google" &&
            business.googleCalendarConnected);

        const steps: OnboardingSteps = {
          schedule: isValidSchedule(business.schedule),
          services: business.services.length > 0,
          professionals: business.professionals.length > 0,
          calendar: hasCalendar,
          forwarding: forwardingDone,
        };

        const totalSteps = Object.keys(steps).length;
        const completedSteps = Object.values(steps).filter(Boolean).length;
        const progress = Math.round((completedSteps / totalSteps) * 100);

        const isActive =
          progress < 100 &&
          !onboardingState.dismissedAt &&
          !onboardingState.completedAt;

        const response: OnboardingStateResponse = {
          steps,
          progress,
          dismissedAt: onboardingState.dismissedAt?.toISOString() ?? null,
          completedAt: onboardingState.completedAt?.toISOString() ?? null,
          isActive,
          forwarding,
        };

        return reply.send(response);
      } catch (error) {
        fastify.log.error({ err: error }, "[Onboarding] Failed to fetch state");
        return reply.status(500).send({ error: "Failed to fetch onboarding state" });
      }
    }
  );

  // Dismiss the onboarding guide
  fastify.post(
    "/business/me/onboarding/dismiss",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const businessId = request.user!.businessId;
        await getOrCreateOnboardingState(businessId);

        const updated = await prisma.onboardingState.update({
          where: { businessId },
          data: { dismissedAt: new Date() },
        });

        return reply.send({
          dismissedAt: updated.dismissedAt?.toISOString() ?? null,
        });
      } catch (error) {
        fastify.log.error({ err: error }, "[Onboarding] Failed to dismiss");
        return reply.status(500).send({ error: "Failed to dismiss onboarding" });
      }
    }
  );

  // El negocio dice haber activado el desvío en su terminal. No lo damos por
  // verificado —eso solo lo prueba una llamada entrante— pero deja de pedirlo.
  fastify.post(
    "/business/me/onboarding/confirm-forwarding",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const businessId = request.user!.businessId;
        await getOrCreateOnboardingState(businessId);

        const updated = await prisma.onboardingState.update({
          where: { businessId },
          data: { forwardingConfirmedAt: new Date() },
        });

        return reply.send({
          confirmedAt: updated.forwardingConfirmedAt?.toISOString() ?? null,
        });
      } catch (error) {
        fastify.log.error(
          { err: error },
          "[Onboarding] Failed to confirm forwarding"
        );
        return reply
          .status(500)
          .send({ error: "Failed to confirm call forwarding" });
      }
    }
  );

  // Mark onboarding as completed
  fastify.post(
    "/business/me/onboarding/complete",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const businessId = request.user!.businessId;
        await getOrCreateOnboardingState(businessId);

        const updated = await prisma.onboardingState.update({
          where: { businessId },
          data: { completedAt: new Date() },
        });

        return reply.send({
          completedAt: updated.completedAt?.toISOString() ?? null,
        });
      } catch (error) {
        fastify.log.error({ err: error }, "[Onboarding] Failed to complete");
        return reply.status(500).send({ error: "Failed to complete onboarding" });
      }
    }
  );
}
