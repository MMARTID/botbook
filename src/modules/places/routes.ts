import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { searchPlaces, getPlaceDetails } from './service.js';

const strictRateLimit = {
  max: 10,
  timeWindow: '1 minute',
};

const SearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  country: z.string().min(2).max(5).optional(),
});

const PlaceIdParamsSchema = z.object({
  placeId: z.string().min(1),
});

export const placesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { q?: string };
  }>(
    '/places/autocomplete',
    {
      preValidation: [fastify.authenticate],
      config: { rateLimit: strictRateLimit },
    },
    async (request, reply) => {
      const parseResult = SearchQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid query', details: parseResult.error.errors });
      }

      try {
        const results = await searchPlaces(parseResult.data.q, parseResult.data.country);
        return reply.send({ results });
      } catch (error) {
        fastify.log.error({ err: error }, 'Google Places autocomplete failed');
        return reply.status(503).send({ error: 'Unable to search places right now' });
      }
    },
  );

  fastify.get<{
    Params: { placeId: string };
  }>(
    '/places/details/:placeId',
    {
      preValidation: [fastify.authenticate],
      config: { rateLimit: strictRateLimit },
    },
    async (request, reply) => {
      const parseResult = PlaceIdParamsSchema.safeParse(request.params);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid place id', details: parseResult.error.errors });
      }

      try {
        const details = await getPlaceDetails(parseResult.data.placeId);
        return reply.send(details);
      } catch (error) {
        fastify.log.error({ err: error }, 'Google Places details failed');
        return reply.status(503).send({ error: 'Unable to fetch place details right now' });
      }
    },
  );
};
