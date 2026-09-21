// src/modules/onboarding/routes.ts

import { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { BusinessScheduleSchema } from "../../lib/businessSchedule.js";
import {
  marcadaComoConectada,
  resolverConexionDeCalendario,
  SELECT_CONEXION_DE_CALENDARIO,
} from "../calendar/conexion.js";
import {
  estadoWhatsappDelDueno,
  type EstadoWhatsappDueno,
} from "../whatsapp/altaDueno.js";
import { bajaVigente } from "../whatsapp/bajas.js";
import {
  ComprobacionDeDesvioError,
  iniciarComprobacionDeDesvio,
  obtenerComprobacionDeDesvio,
  type ComprobacionDeDesvio,
} from "./comprobacionDesvio.js";

/**
 * Si el paso de WhatsApp cuenta en `progress` e `isActive`. Estuvo en
 * `false` mientras el frontend desplegado no conocía el paso (un negocio
 * con los otros cinco hechos habría visto reaparecer la guía vacía); desde
 * el PR del panel (2026-09-20) el paso cuenta como los demás.
 */
export const CONTAR_WHATSAPP_EN_PROGRESO = true;

export type OnboardingSteps = {
  schedule: boolean;
  services: boolean;
  professionals: boolean;
  calendar: boolean;
  whatsapp: boolean;
  forwarding: boolean;
};

export type OnboardingWhatsapp = {
  status: EstadoWhatsappDueno;
  ownerWhatsappNumber: string | null;
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
  /** Última «Comprobar desvío» que entró de verdad (PLAN-TELEFONIA-UX.md
   * § 4); null = nunca comprobado. Distinto de `confirmedAt` («el usuario
   * dice»). */
  checkedAt: string | null;
  /** Línea de clientes (`Business.phone`) a la que llamará la comprobación;
   * null mientras sea el placeholder del registro. */
  customerLine: string | null;
};

/** Lo que el panel consulta por polling mientras la comprobación está en
 * marcha: sin `businessId` ni `callControlId`, que no le hacen falta. */
export type ForwardingCheckResponse = Pick<
  ComprobacionDeDesvio,
  "id" | "linea" | "startedAt" | "resultado" | "resueltaAt"
>;

function serializarComprobacion(
  check: ComprobacionDeDesvio
): ForwardingCheckResponse {
  return {
    id: check.id,
    linea: check.linea,
    startedAt: check.startedAt,
    resultado: check.resultado,
    resueltaAt: check.resueltaAt,
  };
}

export type OnboardingStateResponse = {
  steps: OnboardingSteps;
  progress: number;
  dismissedAt: string | null;
  completedAt: string | null;
  isActive: boolean;
  whatsapp: OnboardingWhatsapp;
  forwarding: OnboardingForwarding;
};

function isValidSchedule(schedule: unknown): boolean {
  const result = BusinessScheduleSchema.safeParse(schedule);
  return result.success;
}

async function getOrCreateOnboardingState(businessId: string) {
  // upsert en vez de leer y crear: dos peticiones simultáneas del panel
  // (la carga inicial dispara varias) chocaban contra el unique de
  // businessId y la segunda devolvía un 500 opaco.
  return prisma.onboardingState.upsert({
    where: { businessId },
    create: { businessId },
    update: {},
  });
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
            calendarConnections:
              SELECT_CONEXION_DE_CALENDARIO.calendarConnections,
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

        const phoneNumber = business.telnyxPhoneNumber;
        const phoneIsActive =
          business.phoneNumberStatus === "active" && phoneNumber !== null;

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
          checkedAt: onboardingState.forwardingCheckedAt?.toISOString() ?? null,
          customerLine: business.phone.startsWith("TEMP-")
            ? null
            : business.phone,
        };

        // WhatsApp del dueño: el mismo estado alimenta el paso y el detalle
        // para que no puedan divergir. `activo` o `baja` cuentan como
        // resuelto (una baja es una decisión del dueño, no un pendiente).
        const bajaGlobal = business.ownerWhatsappNumber
          ? await bajaVigente("owner", business.ownerWhatsappNumber)
          : null;
        const whatsappStatus = estadoWhatsappDelDueno(business, bajaGlobal);

        const steps: OnboardingSteps = {
          schedule: isValidSchedule(business.schedule),
          services: business.services.length > 0,
          professionals: business.professionals.length > 0,
          // Solo el flag del proveedor activo, sin mirar el token (semántica
          // histórica de este paso del onboarding).
          calendar: marcadaComoConectada(
            resolverConexionDeCalendario(business)
          ),
          whatsapp: whatsappStatus === "activo" || whatsappStatus === "baja",
          forwarding: forwardingDone,
        };

        // Mientras el paso de WhatsApp no cuente, un negocio con los otros
        // cinco hechos sigue en progreso 100 y no ve reaparecer la guía.
        const pasosContados = Object.entries(steps).filter(
          ([key]) => CONTAR_WHATSAPP_EN_PROGRESO || key !== "whatsapp"
        );
        const totalSteps = pasosContados.length;
        const completedSteps = pasosContados.filter(([, done]) => done).length;
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
          whatsapp: {
            status: whatsappStatus,
            ownerWhatsappNumber: business.ownerWhatsappNumber ?? null,
          },
          forwarding,
        };

        return reply.send(response);
      } catch (error) {
        fastify.log.error({ err: error }, "[Onboarding] Failed to fetch state");
        return reply
          .status(500)
          .send({ error: "Failed to fetch onboarding state" });
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
        return reply
          .status(500)
          .send({ error: "Failed to dismiss onboarding" });
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

  // «Comprobar desvío» (PLAN-TELEFONIA-UX.md § 4): origina una llamada real
  // desde el número de Alhabla a la línea de clientes; el resultado llega
  // por los webhooks de Telnyx y el panel lo consulta con el GET de abajo.
  fastify.post(
    "/business/me/onboarding/forwarding/check",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      const businessId = request.user!.businessId;
      try {
        const check = await iniciarComprobacionDeDesvio(businessId);
        return reply.status(202).send(serializarComprobacion(check));
      } catch (error) {
        if (error instanceof ComprobacionDeDesvioError) {
          return reply
            .status(error.status)
            .send({ error: error.message, code: error.codigo });
        }
        fastify.log.error(
          { err: error, businessId },
          "[Onboarding] No se pudo iniciar la comprobación del desvío"
        );
        return reply
          .status(500)
          .send({ error: "Failed to start forwarding check" });
      }
    }
  );

  // Solo se ve la comprobación del propio negocio: un id ajeno es un 404,
  // igual que uno inexistente o ya caducado.
  fastify.get(
    "/business/me/onboarding/forwarding/check/:id",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      const businessId = request.user!.businessId;
      const { id } = request.params as { id: string };
      try {
        const check = await obtenerComprobacionDeDesvio(id, businessId);
        if (!check) {
          return reply
            .status(404)
            .send({ error: "Forwarding check not found" });
        }
        return reply.send(serializarComprobacion(check));
      } catch (error) {
        fastify.log.error(
          { err: error, businessId },
          "[Onboarding] No se pudo leer la comprobación del desvío"
        );
        return reply
          .status(500)
          .send({ error: "Failed to fetch forwarding check" });
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
        return reply
          .status(500)
          .send({ error: "Failed to complete onboarding" });
      }
    }
  );
}
