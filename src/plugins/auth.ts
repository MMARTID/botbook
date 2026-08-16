import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      businessId: string;
    };
  }
  interface FastifyInstance {
    authenticate: any;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Unauthorized: Missing or invalid token' });
      }

      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
        id: string;
        businessId: string;
      };

      request.user = decoded;
    } catch (error) {
      return reply.status(401).send({ error: 'Unauthorized: Token expired or invalid' });
    }
  });
};

export default fp(authPlugin);
