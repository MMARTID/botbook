import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../../lib/prisma.js';
import { getRedis } from '../../lib/redis.js';
import { createBusinessAgent } from '../../lib/agentBootstrap.js';
import { detectVoiceOrchestrator } from '../../lib/voiceOrchestrator.js';
import { normalizeBusinessType, type BusinessType } from '../../lib/businessType.js';

const GOOGLE_AUTH_STATE_TTL_SECONDS = 10 * 60;
const GOOGLE_SESSION_TTL_SECONDS = 60;
const GOOGLE_SESSION_COOKIE = 'alhabla_google_session';

function createToken(user: { id: string; businessId: string }) {
  return jwt.sign(
    { id: user.id, businessId: user.businessId },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );
}

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');
}

function getGoogleAuthClient() {
  const clientId = process.env.GOOGLE_AUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_AUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_AUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google authentication is not configured');
  }

  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return undefined;

  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator === -1) continue;
    if (cookie.slice(0, separator).trim() === name) {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    }
  }

  return undefined;
}

function setGoogleSessionCookie(reply: FastifyReply, value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  reply.header(
    'Set-Cookie',
    `${GOOGLE_SESSION_COOKIE}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`
  );
}

async function createUserWithBusiness(input: {
  email: string;
  password: string | null;
  googleId?: string;
  isEuropeanUnion?: boolean;
  businessType?: BusinessType;
}) {
  const orchestrator = detectVoiceOrchestrator(input.isEuropeanUnion);

  return prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        name: `Negocio de ${input.email}`,
        phone: `TEMP-${Date.now()}-${randomBytes(4).toString('hex')}`,
        schedule: {},
        orchestrator,
        businessType: input.businessType ?? 'other',
      },
    });

    const user = await tx.user.create({
      data: {
        email: input.email,
        password: input.password,
        googleId: input.googleId,
        businessId: business.id,
        termsAcceptedAt: new Date(),
      },
    });

    return { user, business };
  });
}

function bootstrapBusinessAgent(businessId: string, email: string, businessType?: BusinessType) {
  createBusinessAgent({
    businessId,
    name: `Asistente de ${email}`,
    businessType,
  }).catch((error) => {
    console.error('[Auth] createBusinessAgent failed after registration:', {
      businessId,
      email,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

const strictRateLimit = {
  max: 10,
  timeWindow: '1 minute',
};

const veryStrictRateLimit = {
  max: 5,
  timeWindow: '1 minute',
};

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/login', {
    config: { rateLimit: strictRateLimit },
  }, async (request, reply) => {
    const { email, password } = request.body as { email?: string; password?: string };

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user?.password || !(await bcrypt.compare(password, user.password))) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    return { token: createToken(user) };
  });

  fastify.post('/register', {
    config: { rateLimit: veryStrictRateLimit },
  }, async (request, reply) => {
    const { email, password, isEuropeanUnion, businessType, acceptedTerms } = request.body as {
      email?: string;
      password?: string;
      isEuropeanUnion?: boolean;
      businessType?: string;
      acceptedTerms?: boolean;
    };

    if (!email || !password) {
      return reply.status(400).send({ error: 'El email y la contraseña son obligatorios' });
    }

    if (typeof isEuropeanUnion !== 'boolean') {
      return reply.status(400).send({ error: 'Indica si tus clientes están en la Unión Europea' });
    }

    if (acceptedTerms !== true) {
      return reply.status(400).send({ error: 'Debes aceptar los Términos y Condiciones y la Política de privacidad' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return reply.status(400).send({ error: 'El usuario ya existe' });
    }

    const normalizedBusinessType = normalizeBusinessType(businessType);
    const result = await createUserWithBusiness({
      email: normalizedEmail,
      password: await bcrypt.hash(password, 10),
      isEuropeanUnion,
      businessType: normalizedBusinessType,
    });
    bootstrapBusinessAgent(result.business.id, normalizedEmail, normalizedBusinessType);

    return reply.status(201).send({
      message: 'Usuario registrado con éxito',
      token: createToken(result.user),
    });
  });

  fastify.get<{ Querystring: { acceptedTerms?: string } }>('/google', {
    config: { rateLimit: strictRateLimit },
  }, async (request, reply) => {
    try {
      const state = randomBytes(32).toString('base64url');
      // Se guarda junto al state para saber, en el callback, si el usuario aceptó
      // los Términos y la Política de privacidad antes de iniciar el flujo — solo
      // se exige si el callback termina creando una cuenta nueva.
      const stateValue = JSON.stringify({ termsAccepted: request.query.acceptedTerms === 'true' });
      await getRedis().set(`auth:google:state:${state}`, stateValue, 'EX', GOOGLE_AUTH_STATE_TTL_SECONDS);

      const url = getGoogleAuthClient().generateAuthUrl({
        access_type: 'online',
        prompt: 'select_account',
        scope: ['openid', 'email', 'profile'],
        state,
        include_granted_scopes: false,
      });

      return reply.send({ url });
    } catch (error) {
      fastify.log.error({ err: error }, 'Unable to start Google authentication');
      return reply.status(503).send({ error: 'Google authentication is unavailable' });
    }
  });

  fastify.get<{
    Querystring: { code?: string; state?: string; error?: string };
  }>('/google/callback', {
    config: { rateLimit: strictRateLimit },
  }, async (request, reply) => {
    const callbackUrl = `${getFrontendUrl()}/auth/google/callback`;
    const { code, state, error } = request.query;

    if (error || !code || !state) {
      return reply.redirect(`${callbackUrl}?error=access_denied`);
    }

    try {
      const validState = await getRedis().getdel(`auth:google:state:${state}`);
      if (!validState) {
        return reply.redirect(`${callbackUrl}?error=invalid_state`);
      }
      const { termsAccepted } = JSON.parse(validState) as { termsAccepted: boolean };

      const authClient = getGoogleAuthClient();
      const { tokens } = await authClient.getToken(code);
      if (!tokens.id_token) {
        throw new Error('Google did not return an ID token');
      }

      const ticket = await authClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_AUTH_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      const googleId = payload?.sub;
      const email = payload?.email?.trim().toLowerCase();

      if (!googleId || !email || payload?.email_verified !== true) {
        return reply.redirect(`${callbackUrl}?error=unverified_email`);
      }

      let user = await prisma.user.findUnique({ where: { googleId } });
      if (!user) {
        const userByEmail = await prisma.user.findUnique({ where: { email } });
        if (userByEmail) {
          user = await prisma.user.update({
            where: { id: userByEmail.id },
            data: { googleId },
          });
        } else {
          if (!termsAccepted) {
            return reply.redirect(`${callbackUrl}?error=terms_required`);
          }
          const result = await createUserWithBusiness({ email, password: null, googleId });
          user = result.user;
          bootstrapBusinessAgent(result.business.id, email);
        }
      }

      const sessionId = randomBytes(32).toString('base64url');
      await getRedis().set(
        `auth:google:session:${sessionId}`,
        createToken(user),
        'EX',
        GOOGLE_SESSION_TTL_SECONDS
      );
      setGoogleSessionCookie(reply, sessionId, GOOGLE_SESSION_TTL_SECONDS);
      return reply.redirect(callbackUrl);
    } catch (callbackError) {
      fastify.log.error({ err: callbackError }, 'Google authentication callback failed');
      return reply.redirect(`${callbackUrl}?error=authentication_failed`);
    }
  });

  fastify.post('/google/session', {
    config: { rateLimit: strictRateLimit },
  }, async (request, reply) => {
    const sessionId = readCookie(request.headers.cookie, GOOGLE_SESSION_COOKIE);
    setGoogleSessionCookie(reply, '', 0);

    if (!sessionId) {
      return reply.status(401).send({ error: 'Google session is missing or expired' });
    }

    const token = await getRedis().getdel(`auth:google:session:${sessionId}`);
    if (!token) {
      return reply.status(401).send({ error: 'Google session is missing or expired' });
    }

    return reply.send({ token });
  });

  fastify.post('/register-first-user', {
    config: { rateLimit: veryStrictRateLimit },
  }, async (request, reply) => {
    const { email, password, businessName, isEuropeanUnion } = request.body as {
      email: string;
      password: string;
      businessName: string;
      isEuropeanUnion?: boolean;
    };

    const existingUser = await prisma.user.findFirst();
    if (existingUser) {
      return reply.status(400).send({ error: 'A user already exists. Initial setup is complete.' });
    }

    const orchestrator = detectVoiceOrchestrator(isEuropeanUnion);
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: { name: businessName, phone: '123456789', schedule: {}, orchestrator },
      });
      const user = await tx.user.create({
        data: { email: email.trim().toLowerCase(), password: hashedPassword, businessId: business.id },
      });
      return { user, business };
    });

    return reply.status(201).send({ message: 'User and business created successfully', result });
  });
};
