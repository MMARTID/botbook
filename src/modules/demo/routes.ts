import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { retellAdapter } from "../../adapters/retell/RetellAdapter.js";

const demoRateLimit = {
  max: 10,
  timeWindow: "1 minute",
};

const DEMO_NICHES = [
  "peluqueria",
  "centro-de-estetica",
  "salon-de-unas",
  "barberia",
  "fisioterapia",
] as const;

type DemoNiche = (typeof DEMO_NICHES)[number];

const WebCallBodySchema = z.object({
  niche: z.enum(DEMO_NICHES).optional(),
});

const DEMO_AGENT_ENV_BY_NICHE: Record<DemoNiche, string> = {
  peluqueria: "RETELL_DEMO_PELUQUERIA_AGENT_ID",
  "centro-de-estetica": "RETELL_DEMO_CENTRO_ESTETICA_AGENT_ID",
  "salon-de-unas": "RETELL_DEMO_SALON_UÑAS_AGENT_ID",
  barberia: "RETELL_DEMO_BARBERIA_AGENT_ID",
  fisioterapia: "RETELL_DEMO_FISIOTERAPIA_AGENT_ID",
};

/**
 * Agente de demo para un nicho; si el nicho no tiene agente propio configurado,
 * se usa el genérico de la landing principal.
 */
export function getDemoAgentId(niche?: DemoNiche): string | null {
  if (niche) {
    const nicheAgentId = process.env[DEMO_AGENT_ENV_BY_NICHE[niche]];
    if (nicheAgentId) {
      return nicheAgentId;
    }
  }
  return process.env.RETELL_DEMO_AGENT_ID || null;
}

/**
 * Demo pública de voz de la landing. Crea una llamada web de Retell contra el
 * agente de demo del nicho (o el genérico) y devuelve el access token que
 * necesita el SDK del navegador. Sin autenticación: la usa cualquier visitante.
 */
export const demoRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/web-call",
    {
      config: { rateLimit: demoRateLimit },
    },
    async (request, reply) => {
      const parsed = WebCallBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ code: "INVALID_NICHE", error: "Unknown demo niche" });
      }

      const niche = parsed.data.niche;
      const agentId = getDemoAgentId(niche);

      if (!process.env.RETELL_API_KEY || !agentId) {
        return reply.status(503).send({
          code: "DEMO_NOT_CONFIGURED",
          error: "Voice demo is not configured",
        });
      }

      try {
        const maxDurationSeconds = Number(process.env.RETELL_DEMO_MAX_DURATION_SECONDS || 60);
        const call = await retellAdapter.createWebCall({
          agentId,
          maxDurationMs: maxDurationSeconds * 1000,
          metadata: { source: "landing-demo", niche: niche ?? "general" },
        });

        return reply.send(call);
      } catch (error) {
        fastify.log.error(error, "[Demo] No se pudo crear la llamada web de demo");
        return reply.status(502).send({
          code: "DEMO_CALL_FAILED",
          error: "Failed to create the demo call",
        });
      }
    },
  );
};
