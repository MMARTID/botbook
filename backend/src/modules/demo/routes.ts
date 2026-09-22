import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { telnyxAiAdapter } from "../../adapters/telnyx/TelnyxAiAdapter.js";
import { detectBusinessTypeFromPlace } from "../../lib/businessType.js";
import { getPlaceDetails, searchPlacesForDemo } from "../places/service.js";

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
  // La ficha se vuelve a consultar en el servidor: del navegador solo llega el
  // identificador de Google, nunca el nicho ya resuelto ni texto libre.
  placeId: z.string().trim().min(1).max(200).optional(),
});

const DemoPlaceSearchQuerySchema = z.object({
  q: z.string().trim().min(3).max(120),
});

const DemoPlaceIdParamsSchema = z.object({
  placeId: z.string().trim().min(1).max(200),
});

/**
 * Cuenta de demostración de cada nicho (negocios reales de la plataforma, con
 * su horario, sus servicios y su agenda de mentira) y el assistant de Telnyx
 * que la atiende. La demo de la landing es una llamada por el navegador a ese
 * mismo assistant: lo que oye el visitante es exactamente el producto.
 *
 * Sin Ñ en el nombre de la variable: Cloud Run solo admite [A-Za-z0-9_].
 */
const DEMO_ASSISTANT_ENV_BY_NICHE: Record<DemoNiche, string> = {
  peluqueria: "TELNYX_DEMO_PELUQUERIA_ASSISTANT_ID",
  "centro-de-estetica": "TELNYX_DEMO_CENTRO_ESTETICA_ASSISTANT_ID",
  "salon-de-unas": "TELNYX_DEMO_SALON_UNAS_ASSISTANT_ID",
  barberia: "TELNYX_DEMO_BARBERIA_ASSISTANT_ID",
  fisioterapia: "TELNYX_DEMO_FISIOTERAPIA_ASSISTANT_ID",
};

/**
 * Assistant de demo para un nicho; si ese nicho no tiene cuenta configurada,
 * se cae al genérico (el de la landing principal).
 */
export function getDemoAssistantId(niche?: DemoNiche): string | null {
  if (niche) {
    const nicheAssistantId = process.env[DEMO_ASSISTANT_ENV_BY_NICHE[niche]];
    if (nicheAssistantId) return nicheAssistantId;
  }
  return process.env.TELNYX_DEMO_ASSISTANT_ID || null;
}

const DEFAULT_DEMO_MAX_DURATION_SECONDS = 60;

/**
 * Duración máxima de la demo. Es un tope del navegador (el componente cuelga
 * al llegar), no de Telnyx: el assistant de demo es el mismo que atiende las
 * llamadas reales de esa cuenta y no se le toca `time_limit_secs`. Guarda
 * contra un valor mal configurado (vacío, no numérico, cero o negativo).
 */
export function resolveDemoMaxDurationSeconds(): number {
  const raw = process.env.TELNYX_DEMO_MAX_DURATION_SECONDS;
  if (!raw) {
    return DEFAULT_DEMO_MAX_DURATION_SECONDS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DEMO_MAX_DURATION_SECONDS;
}

/**
 * Los assistants de demo tienen que aceptar llamadas web sin autenticar
 * (`anonymous_login` del SDK WebRTC). Es un ajuste del assistant, y cualquier
 * resincronización del agente desde el panel de esa cuenta lo pisa, así que la
 * demo lo reafirma la primera vez que sirve cada assistant en vez de confiar en
 * que alguien lo dejó puesto a mano. Una vez por proceso: el resto de llamadas
 * no pagan ninguna ida y vuelta a Telnyx.
 */
const webCallsEnabledAssistants = new Set<string>();

async function ensureUnauthenticatedWebCalls(assistantId: string): Promise<void> {
  if (webCallsEnabledAssistants.has(assistantId)) return;
  await telnyxAiAdapter.updateAssistant(assistantId, {
    telephonySettings: { supports_unauthenticated_web_calls: true },
  });
  webCallsEnabledAssistants.add(assistantId);
}

/** Solo para los tests: olvida la caché de assistants ya reafirmados. */
export function resetDemoWebCallsCache(): void {
  webCallsEnabledAssistants.clear();
}

/**
 * Demo pública de voz de la landing. Elige la cuenta de demostración que
 * corresponde al negocio que ha buscado el visitante (peluquería, barbería,
 * fisioterapia…) y devuelve el assistant de Telnyx al que tiene que llamar el
 * navegador. Sin autenticación: la usa cualquier visitante.
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
        const results = await searchPlacesForDemo(parsed.data.q);
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
          businessType: detectBusinessTypeFromPlace(place),
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

      try {
        // El nicho del negocio buscado manda sobre el de la landing: si alguien
        // busca su barbería desde la landing principal, oye la barbería.
        let niche = parsed.data.niche;
        if (parsed.data.placeId) {
          const detected = detectBusinessTypeFromPlace(await getPlaceDetails(parsed.data.placeId));
          if (detected !== "other") niche = detected;
        }

        const assistantId = getDemoAssistantId(niche);
        if (!process.env.TELNYX_API_KEY || !assistantId) {
          return reply.status(503).send({
            code: "DEMO_NOT_CONFIGURED",
            error: "Voice demo is not configured",
          });
        }

        await ensureUnauthenticatedWebCalls(assistantId);

        return reply.send({
          assistantId,
          niche: niche ?? "general",
          maxDurationSeconds: resolveDemoMaxDurationSeconds(),
        });
      } catch (error) {
        fastify.log.error(error, "[Demo] No se pudo preparar la llamada web de demo");
        return reply.status(502).send({
          code: "DEMO_CALL_FAILED",
          error: "Failed to create the demo call",
        });
      }
    },
  );
};
