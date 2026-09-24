import { randomBytes } from "node:crypto";
import { isUniqueConstraintError } from "../../lib/prismaErrors.js";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { getRedis } from "../../lib/redis.js";
import { createBusinessAgent } from "../../lib/agentBootstrap.js";
import { detectVoiceOrchestrator } from "../../lib/voiceOrchestrator.js";
import {
  normalizeBusinessType,
  type BusinessType,
} from "../../lib/businessType.js";
import {
  AccountActionError,
  changeAccountPassword,
  deleteAccount,
  getAccountOverview,
} from "./accountService.js";
import {
  requestPasswordReset,
  resetPasswordWithToken,
} from "./passwordResetService.js";
import { appUrl } from "../../lib/urls.js";
import { LimitadorEnMemoria } from "../../lib/limitadorEnMemoria.js";
import { canjearPase, crearPase, esPaseConFormatoValido } from "./pase.js";

const GOOGLE_AUTH_STATE_TTL_SECONDS = 10 * 60;
const GOOGLE_SESSION_TTL_SECONDS = 60;
const GOOGLE_SESSION_COOKIE = "alhabla_google_session";
// Liga el `state` al navegador que inició el flujo — sin esto, un atacante
// puede iniciar SU PROPIA autorización de Google (obtiene un `state` válido
// de /auth/google), y hacer que la víctima complete el callback con ese
// `state` (link/imagen manipulados): el `state` en sí sigue siendo válido en
// Redis, así que el callback termina autenticando al navegador de la
// víctima en la cuenta del atacante (login CSRF) — cualquier dato que la
// víctima introduzca después queda en la cuenta del atacante, no en la suya.
const GOOGLE_OAUTH_STATE_COOKIE = "alhabla_google_oauth_state";
const FIRST_USER_BOOTSTRAP_SECRET_ENV = "FIRST_USER_BOOTSTRAP_SECRET";

// Mismas reglas al registrarse, al cambiarla desde Ajustes y al restablecerla
// por correo: una sola definición para que nunca diverjan. Hasta la auditoría
// del 24-09, `/register` no aplicaba ninguna —entraba una contraseña de un
// solo carácter— mientras que cambiarla sí exigía todo esto.
const NewPasswordSchema = z
  .string()
  // Sin «nueva»: el mismo esquema lo usa el registro, donde no hay ninguna
  // anterior y «la nueva contraseña» se lee raro.
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(128, "La contraseña es demasiado larga")
  .regex(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/, "Añade al menos una letra")
  .regex(/\d/, "Añade al menos un número");

const ChangePasswordSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: NewPasswordSchema,
});

const ForgotPasswordSchema = z.object({
  email: z.string().trim().email("Escribe un email válido").max(254),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: NewPasswordSchema,
});

// Misma respuesta exista o no la cuenta: no se puede usar este formulario
// para averiguar qué emails están registrados.
const FORGOT_PASSWORD_MESSAGE =
  "Si existe una cuenta con ese email, te hemos enviado un enlace para crear una contraseña nueva.";

const DeleteAccountSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  confirmation: z.literal("ELIMINAR"),
  forwardingCancelled: z.literal(true),
});

function sendAccountActionError(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      error: "Revisa los datos introducidos",
      errors: error.errors,
    });
  }
  if (error instanceof AccountActionError) {
    return reply.status(error.statusCode).send({ error: error.message });
  }
  return null;
}

/**
 * `tv` es `User.tokenVersion` en el momento de emitir. `plugins/auth.ts` lo
 * compara con el valor de la BD, así que cambiar o restablecer la contraseña
 * —que sube la versión— invalida al instante los tokens anteriores en vez de
 * dejarlos vivos los 7 días que duran.
 */
function createToken(user: {
  id: string;
  businessId: string;
  tokenVersion?: number;
}) {
  return jwt.sign(
    { id: user.id, businessId: user.businessId, tv: user.tokenVersion ?? 0 },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );
}

function getFrontendUrl() {
  return appUrl();
}

function getGoogleAuthClient() {
  const clientId = process.env.GOOGLE_AUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_AUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_AUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google authentication is not configured");
  }

  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return undefined;

  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator === -1) continue;
    if (cookie.slice(0, separator).trim() === name) {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    }
  }

  return undefined;
}

function setCookie(
  reply: FastifyReply,
  name: string,
  value: string,
  maxAge: number
) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`
  );
}

function setGoogleSessionCookie(
  reply: FastifyReply,
  value: string,
  maxAge: number
) {
  setCookie(reply, GOOGLE_SESSION_COOKIE, value, maxAge);
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
        phone: `TEMP-${Date.now()}-${randomBytes(4).toString("hex")}`,
        schedule: {},
        orchestrator,
        businessType: input.businessType ?? "other",
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

// Esperado (await en ambos call sites), no fire-and-forget — en Cloud Run el
// proceso solo tiene CPU garantizada mientras dura la petición; sin
// esperarlo, puede quedarse sin CPU justo después de responder y dejar una
// cuenta recién creada sin ningún agente (hallazgo #11 de la auditoría). Un
// fallo aquí no debe impedir el registro en sí — createBusinessAgent ya
// captura sus propios errores de Retell internamente y siempre
// devuelve el Agent (aunque sin retellAgentId/retellLlmId si falló la
// sincronización externa), así que este catch es solo para errores
// realmente inesperados (p. ej. el propio insert en Postgres).
async function bootstrapBusinessAgent(
  businessId: string,
  email: string,
  businessType?: BusinessType
) {
  try {
    await createBusinessAgent({
      businessId,
      name: `Asistente de ${email}`,
      businessType,
    });
  } catch (error) {
    console.error("[Auth] createBusinessAgent failed after registration:", {
      businessId,
      email,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const strictRateLimit = {
  max: 10,
  timeWindow: "1 minute",
};

const veryStrictRateLimit = {
  max: 5,
  timeWindow: "1 minute",
};

/**
 * Techo de respaldo para TODO `/auth/*`, en la memoria de la instancia. El
 * límite de arriba vive en Redis con `skipOnError: true`, así que si Redis se
 * cae deja pasar todo; aquí eso significaría probar contraseñas sin freno.
 * 40 peticiones por minuto y IP está muy por encima de cualquier uso normal
 * (las rutas de arriba permiten 5 o 10 cada una), así que solo muerde cuando
 * el limitador principal se ha rendido.
 */
const LIMITE_DE_RESPALDO = new LimitadorEnMemoria(40, 60_000);

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    if (!LIMITE_DE_RESPALDO.permite(request.ip)) {
      request.log.warn(
        { ip: request.ip, url: request.url },
        "[Auth] Techo de respaldo en memoria alcanzado (¿Redis caído?)"
      );
      return reply.status(429).send({
        statusCode: 429,
        error: "Too Many Requests",
        message: "Demasiados intentos. Espera un minuto y vuelve a probar.",
      });
    }
  });

  fastify.post(
    "/login",
    {
      config: { rateLimit: strictRateLimit },
    },
    async (request, reply) => {
      const { email, password } = request.body as {
        email?: string;
        password?: string;
      };

      if (!email || !password) {
        return reply
          .status(400)
          .send({ error: "Email and password are required" });
      }

      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });
      if (!user?.password || !(await bcrypt.compare(password, user.password))) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      return { token: createToken(user) };
    }
  );

  fastify.post(
    "/register",
    {
      config: { rateLimit: veryStrictRateLimit },
    },
    async (request, reply) => {
      const { email, password, isEuropeanUnion, businessType, acceptedTerms } =
        request.body as {
          email?: string;
          password?: string;
          isEuropeanUnion?: boolean;
          businessType?: string;
          acceptedTerms?: boolean;
        };

      if (!email || !password) {
        return reply
          .status(400)
          .send({ error: "El email y la contraseña son obligatorios" });
      }

      const contrasena = NewPasswordSchema.safeParse(password);
      if (!contrasena.success) {
        return reply
          .status(400)
          .send({ error: contrasena.error.errors[0]?.message ?? "Contraseña no válida" });
      }

      if (typeof isEuropeanUnion !== "boolean") {
        return reply
          .status(400)
          .send({ error: "Indica si tus clientes están en la Unión Europea" });
      }

      if (acceptedTerms !== true) {
        return reply
          .status(400)
          .send({
            error:
              "Debes aceptar los Términos y Condiciones y la Política de privacidad",
          });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existingUser) {
        return reply.status(400).send({ error: "El usuario ya existe" });
      }

      const normalizedBusinessType = normalizeBusinessType(businessType);
      let result;
      try {
        result = await createUserWithBusiness({
          email: normalizedEmail,
          // Coste 12, el mismo que al cambiarla y restablecerla: no tiene
          // sentido que la contraseña nazca peor protegida de lo que queda
          // después de cambiarla.
          password: await bcrypt.hash(password, 12),
          isEuropeanUnion,
          businessType: normalizedBusinessType,
        });
      } catch (error) {
        // La comprobación de arriba es un check-then-act: entre ella y esta
        // creación cabe otro registro con el mismo correo (doble clic, dos
        // pestañas). Sin esto, el usuario veía un 500 en vez de saber que ya
        // tiene cuenta.
        if (isUniqueConstraintError(error)) {
          return reply.status(400).send({ error: "El usuario ya existe" });
        }
        throw error;
      }
      await bootstrapBusinessAgent(
        result.business.id,
        normalizedEmail,
        normalizedBusinessType
      );

      // `pase`: código de un solo uso para entrar en la app desde la web de
      // marketing sin que el token viaje en la URL (PLAN-APP-DOMINIO.md § 3).
      const pase = await crearPase(result.user);
      return reply.status(201).send({
        message: "Usuario registrado con éxito",
        token: createToken(result.user),
        ...(pase ? { pase } : {}),
      });
    }
  );

  fastify.post(
    "/pase/canjear",
    { config: { rateLimit: veryStrictRateLimit } },
    async (request, reply) => {
      const { pase } = (request.body ?? {}) as { pase?: unknown };
      if (!esPaseConFormatoValido(pase)) {
        return reply.status(400).send({ error: "Pase no válido" });
      }
      const user = await canjearPase(pase);
      if (!user) {
        return reply
          .status(401)
          .send({ error: "El pase no es válido o ha caducado", code: "PASE_INVALIDO" });
      }
      // El pase solo guarda id y negocio, así que la versión del token se lee
      // ahora: si la contraseña cambió entre crear el pase y canjearlo, el
      // token nace ya con la versión buena en vez de nacer inválido.
      const vigente = await prisma.user.findUnique({
        where: { id: user.id },
        select: { tokenVersion: true },
      });
      if (!vigente) {
        return reply
          .status(401)
          .send({ error: "El pase no es válido o ha caducado", code: "PASE_INVALIDO" });
      }
      return reply.send({
        token: createToken({ ...user, tokenVersion: vigente.tokenVersion }),
      });
    }
  );

  fastify.post(
    "/forgot-password",
    {
      config: { rateLimit: veryStrictRateLimit },
    },
    async (request, reply) => {
      try {
        const { email } = ForgotPasswordSchema.parse(request.body);
        await requestPasswordReset(email);
        return reply.send({ message: FORGOT_PASSWORD_MESSAGE });
      } catch (error) {
        const response = sendAccountActionError(reply, error);
        if (response) return response;
        fastify.log.error({ err: error }, "Unable to start password reset");
        return reply
          .status(500)
          .send({ error: "No se pudo enviar el correo. Inténtalo de nuevo." });
      }
    }
  );

  fastify.post(
    "/reset-password",
    {
      config: { rateLimit: veryStrictRateLimit },
    },
    async (request, reply) => {
      try {
        const { token, password } = ResetPasswordSchema.parse(request.body);
        const user = await resetPasswordWithToken({
          token,
          newPassword: password,
        });
        // Recibir el enlace ya demuestra que el buzón es suyo: se entra
        // directamente, sin obligar a teclear la contraseña recién creada.
        return reply.send({
          message: "Contraseña actualizada",
          token: createToken(user),
        });
      } catch (error) {
        const response = sendAccountActionError(reply, error);
        if (response) return response;
        fastify.log.error({ err: error }, "Unable to reset password");
        return reply
          .status(500)
          .send({ error: "No se pudo cambiar la contraseña. Inténtalo de nuevo." });
      }
    }
  );

  fastify.get<{ Querystring: { acceptedTerms?: string } }>(
    "/google",
    {
      config: { rateLimit: strictRateLimit },
    },
    async (request, reply) => {
      try {
        const state = randomBytes(32).toString("base64url");
        // Se guarda junto al state para saber, en el callback, si el usuario aceptó
        // los Términos y la Política de privacidad antes de iniciar el flujo — solo
        // se exige si el callback termina creando una cuenta nueva.
        const stateValue = JSON.stringify({
          termsAccepted: request.query.acceptedTerms === "true",
        });
        await getRedis().set(
          `auth:google:state:${state}`,
          stateValue,
          "EX",
          GOOGLE_AUTH_STATE_TTL_SECONDS
        );
        // Cookie de un solo uso ligada a este navegador — el callback exige que
        // coincida con el `state` recibido, para que no valga completarlo desde
        // un navegador distinto al que inició el flujo (ver comentario arriba).
        setCookie(
          reply,
          GOOGLE_OAUTH_STATE_COOKIE,
          state,
          GOOGLE_AUTH_STATE_TTL_SECONDS
        );

        const url = getGoogleAuthClient().generateAuthUrl({
          access_type: "online",
          prompt: "select_account",
          scope: ["openid", "email", "profile"],
          state,
          include_granted_scopes: false,
        });

        return reply.send({ url });
      } catch (error) {
        fastify.log.error(
          { err: error },
          "Unable to start Google authentication"
        );
        return reply
          .status(503)
          .send({ error: "Google authentication is unavailable" });
      }
    }
  );

  fastify.get<{
    Querystring: { code?: string; state?: string; error?: string };
  }>(
    "/google/callback",
    {
      config: { rateLimit: strictRateLimit },
    },
    async (request, reply) => {
      const callbackUrl = `${getFrontendUrl()}/auth/google/callback`;
      const { code, state, error } = request.query;

      if (error || !code || !state) {
        return reply.redirect(`${callbackUrl}?error=access_denied`);
      }

      try {
        const cookieState = readCookie(
          request.headers.cookie,
          GOOGLE_OAUTH_STATE_COOKIE
        );
        setCookie(reply, GOOGLE_OAUTH_STATE_COOKIE, "", 0);
        if (!cookieState || cookieState !== state) {
          return reply.redirect(`${callbackUrl}?error=invalid_state`);
        }

        const validState = await getRedis().getdel(
          `auth:google:state:${state}`
        );
        if (!validState) {
          return reply.redirect(`${callbackUrl}?error=invalid_state`);
        }
        const { termsAccepted } = JSON.parse(validState) as {
          termsAccepted: boolean;
        };

        const authClient = getGoogleAuthClient();
        const { tokens } = await authClient.getToken(code);
        if (!tokens.id_token) {
          throw new Error("Google did not return an ID token");
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
          const userByEmail = await prisma.user.findUnique({
            where: { email },
          });
          if (userByEmail) {
            user = await prisma.user.update({
              where: { id: userByEmail.id },
              data: { googleId },
            });
          } else {
            if (!termsAccepted) {
              return reply.redirect(`${callbackUrl}?error=terms_required`);
            }
            const result = await createUserWithBusiness({
              email,
              password: null,
              googleId,
            });
            user = result.user;
            await bootstrapBusinessAgent(result.business.id, email);
          }
        }

        const sessionId = randomBytes(32).toString("base64url");
        await getRedis().set(
          `auth:google:session:${sessionId}`,
          createToken(user),
          "EX",
          GOOGLE_SESSION_TTL_SECONDS
        );
        setGoogleSessionCookie(reply, sessionId, GOOGLE_SESSION_TTL_SECONDS);
        return reply.redirect(callbackUrl);
      } catch (callbackError) {
        fastify.log.error(
          { err: callbackError },
          "Google authentication callback failed"
        );
        return reply.redirect(`${callbackUrl}?error=authentication_failed`);
      }
    }
  );

  fastify.post(
    "/google/session",
    {
      config: { rateLimit: strictRateLimit },
    },
    async (request, reply) => {
      const sessionId = readCookie(
        request.headers.cookie,
        GOOGLE_SESSION_COOKIE
      );
      setGoogleSessionCookie(reply, "", 0);

      if (!sessionId) {
        return reply
          .status(401)
          .send({ error: "Google session is missing or expired" });
      }

      const token = await getRedis().getdel(`auth:google:session:${sessionId}`);
      if (!token) {
        return reply
          .status(401)
          .send({ error: "Google session is missing or expired" });
      }

      return reply.send({ token });
    }
  );

  fastify.get(
    "/account",
    {
      preValidation: [fastify.authenticate],
      config: { rateLimit: strictRateLimit },
    },
    async (request, reply) => {
      try {
        const account = await getAccountOverview(
          request.user!.id,
          request.user!.businessId,
        );
        return reply.send(account);
      } catch (error) {
        const response = sendAccountActionError(reply, error);
        if (response) return response;
        fastify.log.error({ err: error }, "Unable to load account settings");
        return reply.status(500).send({ error: "No se pudo cargar la cuenta" });
      }
    },
  );

  fastify.post(
    "/change-password",
    {
      preValidation: [fastify.authenticate],
      config: { rateLimit: veryStrictRateLimit },
    },
    async (request, reply) => {
      try {
        const payload = ChangePasswordSchema.parse(request.body);
        const result = await changeAccountPassword({
          userId: request.user!.id,
          businessId: request.user!.businessId,
          ...payload,
        });
        return reply.send(result);
      } catch (error) {
        const response = sendAccountActionError(reply, error);
        if (response) return response;
        fastify.log.error({ err: error }, "Unable to change account password");
        return reply.status(500).send({ error: "No se pudo cambiar la contraseña" });
      }
    },
  );

  fastify.delete(
    "/account",
    {
      preValidation: [fastify.authenticate],
      config: { rateLimit: veryStrictRateLimit },
    },
    async (request, reply) => {
      try {
        const payload = DeleteAccountSchema.parse(request.body);
        await deleteAccount({
          userId: request.user!.id,
          businessId: request.user!.businessId,
          currentPassword: payload.currentPassword,
        });
        return reply.status(204).send();
      } catch (error) {
        const response = sendAccountActionError(reply, error);
        if (response) return response;
        fastify.log.error({ err: error }, "Unable to delete account");
        return reply.status(500).send({ error: "No se pudo eliminar la cuenta" });
      }
    },
  );

  fastify.post(
    "/register-first-user",
    {
      config: { rateLimit: veryStrictRateLimit },
    },
    async (request, reply) => {
      // Esta ruta existe exclusivamente para inicializar una instalación
      // vacía. Dejarla pública convierte cualquier base restaurada/vacía en
      // una toma de control trivial.
      if (process.env.NODE_ENV === "production") {
        const configuredSecret = process.env[FIRST_USER_BOOTSTRAP_SECRET_ENV];
        const suppliedSecret = request.headers["x-bootstrap-secret"];
        if (
          !configuredSecret ||
          typeof suppliedSecret !== "string" ||
          suppliedSecret !== configuredSecret
        ) {
          return reply.status(404).send({ error: "Not found" });
        }
      }

      const { email, password, businessName, isEuropeanUnion } =
        request.body as {
          email: string;
          password: string;
          businessName: string;
          isEuropeanUnion?: boolean;
        };

      const existingUser = await prisma.user.findFirst();
      if (existingUser) {
        return reply
          .status(400)
          .send({ error: "A user already exists. Initial setup is complete." });
      }

      const orchestrator = detectVoiceOrchestrator(isEuropeanUnion);
      const hashedPassword = await bcrypt.hash(password, 12);
      const result = await prisma.$transaction(async (tx) => {
        const business = await tx.business.create({
          data: {
            name: businessName,
            phone: "123456789",
            schedule: {},
            orchestrator,
          },
        });
        const user = await tx.user.create({
          data: {
            email: email.trim().toLowerCase(),
            password: hashedPassword,
            businessId: business.id,
          },
        });
        return { user, business };
      });

      return reply.status(201).send({
        message: "User and business created successfully",
        result: {
          user: {
            id: result.user.id,
            email: result.user.email,
            businessId: result.user.businessId,
          },
          business: result.business,
        },
      });
    }
  );
};
