import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { retellAdapter } from "../../adapters/retell/RetellAdapter.js";
import { getPlaceDetails, searchPlaces, type PlaceDetails } from "../places/service.js";

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
  // La ficha se vuelve a consultar en el servidor. Así no se introduce texto
  // arbitrario del navegador en las variables del LLM de la demo.
  placeId: z.string().trim().min(1).max(200).optional(),
  // Consentimiento opcional, separado de la personalización puntual de la llamada.
  allowBusinessDataRetention: z.boolean().optional(),
});

const DemoPlaceSearchQuerySchema = z.object({
  q: z.string().trim().min(3).max(120),
});

const DemoPlaceIdParamsSchema = z.object({
  placeId: z.string().trim().min(1).max(200),
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

const DEFAULT_DEMO_MAX_DURATION_SECONDS = 60;

/**
 * Duración máxima real de la llamada de demo, con guarda contra una
 * RETELL_DEMO_MAX_DURATION_SECONDS mal configurada (vacía, no numérica,
 * negativa o cero). Si el valor no es un número finito y positivo, Retell
 * recibiría `max_call_duration_ms: NaN` — que `JSON.stringify` convierte en
 * `null`, así que el override de duración se ignoraría en silencio y la
 * llamada de demo quedaría SIN tope real de duración (coste sin límite por
 * llamada). Siempre se cae a un valor seguro en vez de dejarlo sin aplicar.
 */
export function resolveDemoMaxDurationSeconds(): number {
  const raw = process.env.RETELL_DEMO_MAX_DURATION_SECONDS;
  if (!raw) {
    return DEFAULT_DEMO_MAX_DURATION_SECONDS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DEMO_MAX_DURATION_SECONDS;
}

function normalizeDemoText(value: string, maximumLength: number, fallback: string) {
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, maximumLength);
  return normalized || fallback;
}

export function buildDemoBusinessContext(place: PlaceDetails) {
  const businessName = normalizeDemoText(place.name, 120, "tu negocio");
  const businessAddress = normalizeDemoText(place.address, 180, "No disponible");
  const businessTypes = place.types
    .slice(0, 3)
    .map((type) => normalizeDemoText(type, 60, ""))
    .filter(Boolean)
    .join(", ") || "negocio local";

  return {
    businessName,
    dynamicVariables: {
      nombre_negocio: businessName,
      direccion_negocio: businessAddress,
      tipo_negocio: businessTypes,
    },
    beginMessage: `Hola, has llamado a ${businessName}. Soy la recepción virtual de Alhabla. ¿En qué te ayudo?`,
  };
}

/**
 * Demo pública de voz de la landing. Crea una llamada web de Retell contra el
 * agente de demo del nicho (o el genérico) y devuelve el access token que
 * necesita el SDK del navegador. Sin autenticación: la usa cualquier visitante.
 */
export const demoRoutes: FastifyPluginAsync = async (fastify) => {
  // Los endpoints de registro de Places siguen protegidos. La landing recibe
  // únicamente nombre, dirección y categoría para elegir una demo, con el
  // mismo límite estricto que la creación de la llamada.
  fastify.get<{ Querystring: { q?: string } }>(
    "/places/autocomplete",
    { config: { rateLimit: demoRateLimit } },
    async (request, reply) => {
      const parsed = DemoPlaceSearchQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid query" });
      }

      try {
        const results = await searchPlaces(parsed.data.q, { countryCode: "ES" });
        return reply.send({ results });
      } catch (error) {
        fastify.log.error({ err: error }, "Google Places demo autocomplete failed");
        return reply.status(503).send({ error: "Unable to search places right now" });
      }
    },
  );

  fastify.get<{ Params: { placeId: string } }>(
    "/places/details/:placeId",
    { config: { rateLimit: demoRateLimit } },
    async (request, reply) => {
      const parsed = DemoPlaceIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid place id" });
      }

      try {
        const place = await getPlaceDetails(parsed.data.placeId);
        return reply.send({
          placeId: place.placeId,
          name: place.name,
          address: place.address,
          types: place.types,
        });
      } catch (error) {
        fastify.log.error({ err: error }, "Google Places demo details failed");
        return reply.status(503).send({ error: "Unable to fetch place details right now" });
      }
    },
  );

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
        const maxDurationSeconds = resolveDemoMaxDurationSeconds();
        const business = parsed.data.placeId
          ? buildDemoBusinessContext(await getPlaceDetails(parsed.data.placeId))
          : null;
        const canRetainBusinessData = Boolean(business && parsed.data.allowBusinessDataRetention);
        const call = await retellAdapter.createWebCall({
          agentId,
          maxDurationMs: maxDurationSeconds * 1000,
          metadata: {
            source: "landing-demo",
            niche: niche ?? "general",
            personalized: Boolean(business),
            ...(canRetainBusinessData
              ? {
                  placeId: parsed.data.placeId,
                  allowBusinessDataRetention: true,
                }
              : {}),
          },
          ...(business
            ? { dynamicVariables: business.dynamicVariables, beginMessage: business.beginMessage }
            : {}),
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
