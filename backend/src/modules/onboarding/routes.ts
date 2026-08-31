// src/modules/onboarding/routes.ts

import { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { BusinessScheduleSchema } from "../../lib/businessSchedule.js";

export type OnboardingSteps = {
  schedule: boolean;
  services: boolean;
  professionals: boolean;
  calendar: boolean;
};

export type OnboardingStateResponse = {
  steps: OnboardingSteps;
  progress: number;
  dismissedAt: string | null;
  completedAt: string | null;
  isActive: boolean;
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
        };

        const completedSteps = Object.values(steps).filter(Boolean).length;
        const progress = Math.round((completedSteps / 4) * 100);

        const onboardingState = await getOrCreateOnboardingState(businessId);

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
