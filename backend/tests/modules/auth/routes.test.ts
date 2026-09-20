import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authRoutes } from "../../../src/modules/auth/routes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";
import { createBusinessAgent } from "../../../src/lib/agentBootstrap.js";
import {
  changeAccountPassword,
  deleteAccount,
  getAccountOverview,
} from "../../../src/modules/auth/accountService.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    business: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../../src/lib/redis.js", () => ({
  getRedis: vi.fn(),
}));

vi.mock("../../../src/lib/agentBootstrap.js", () => ({
  createBusinessAgent: vi.fn().mockResolvedValue({ id: "agent_123" }),
}));

vi.mock("../../../src/modules/auth/accountService.js", () => ({
  AccountActionError: class AccountActionError extends Error {
    constructor(message: string, readonly statusCode: number) {
      super(message);
    }
  },
  getAccountOverview: vi.fn(),
  changeAccountPassword: vi.fn(),
  deleteAccount: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
  compare: vi.fn(),
  hash: vi.fn(),
}));

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn(),
    verify: vi.fn(),
  },
  sign: vi.fn(),
  verify: vi.fn(),
}));

const { mockGenerateAuthUrl, mockGetToken, mockVerifyIdToken } = vi.hoisted(() => ({
  mockGenerateAuthUrl: vi.fn().mockReturnValue("https://accounts.google.com/oauth"),
  mockGetToken: vi.fn(),
  mockVerifyIdToken: vi.fn(),
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn(function OAuth2ClientMock() {
    return {
      generateAuthUrl: mockGenerateAuthUrl,
      getToken: mockGetToken,
      verifyIdToken: mockVerifyIdToken,
    };
  }),
}));

const mockedUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockedUserFindFirst = vi.mocked(prisma.user.findFirst);
const mockedUserCreate = vi.mocked(prisma.user.create);
const mockedTransaction = vi.mocked(prisma.$transaction);
const mockedBusinessCreate = vi.mocked(prisma.business.create);
const mockedBcryptCompare = vi.mocked(bcrypt.compare);
const mockedBcryptHash = vi.mocked(bcrypt.hash);
const mockedJwtSign = vi.mocked(jwt.sign);
const mockedGetRedis = vi.mocked(getRedis);
const mockedCreateBusinessAgent = vi.mocked(createBusinessAgent);
const mockedGetAccountOverview = vi.mocked(getAccountOverview);
const mockedChangeAccountPassword = vi.mocked(changeAccountPassword);
const mockedDeleteAccount = vi.mocked(deleteAccount);

describe("authRoutes", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = "test_secret";
    process.env.GOOGLE_AUTH_CLIENT_ID = "google_client_id";
    process.env.GOOGLE_AUTH_CLIENT_SECRET = "google_client_secret";
    process.env.GOOGLE_AUTH_REDIRECT_URI = "http://localhost:3000/auth/google/callback";

    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { id: "user_123", businessId: "business_123" };
    });
    await fastify.register(authRoutes);
  });

  describe("POST /login", () => {
    it("devuelve token con credenciales válidas", async () => {
      mockedUserFindUnique.mockResolvedValue({
        id: "user_123",
        businessId: "business_123",
        password: "hashed_password",
      } as any);
      mockedBcryptCompare.mockResolvedValue(true as any);
      mockedJwtSign.mockReturnValue("token_123" as any);

      const response = await fastify.inject({
        method: "POST",
        url: "/login",
        payload: { email: "test@example.com", password: "password" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ token: "token_123" });
    });

    it("rechaza credenciales inválidas", async () => {
      mockedUserFindUnique.mockResolvedValue({
        id: "user_123",
        password: "hashed_password",
      } as any);
      mockedBcryptCompare.mockResolvedValue(false as any);

      const response = await fastify.inject({
        method: "POST",
        url: "/login",
        payload: { email: "test@example.com", password: "wrong" },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "Invalid credentials" });
    });

    it("rechaza petición sin email o contraseña", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/login",
        payload: { email: "test@example.com" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /register", () => {
    it("crea usuario, negocio y devuelve token", async () => {
      mockedUserFindUnique.mockResolvedValue(null);
      mockedBcryptHash.mockResolvedValue("hashed_password" as any);
      mockedJwtSign.mockReturnValue("token_123" as any);
      mockedTransaction.mockImplementation(async (callback: any) => {
        const business = { id: "business_123", name: "Negocio de test" };
        const user = { id: "user_123", email: "test@example.com", businessId: business.id };
        mockedBusinessCreate.mockResolvedValue(business as any);
        mockedUserCreate.mockResolvedValue(user as any);
        return callback({ business: { create: mockedBusinessCreate }, user: { create: mockedUserCreate } });
      });

      const response = await fastify.inject({
        method: "POST",
        url: "/register",
        payload: { email: "test@example.com", password: "password", isEuropeanUnion: true, acceptedTerms: true },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().token).toBe("token_123");
      expect(mockedCreateBusinessAgent).toHaveBeenCalled();
      expect(mockedUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ termsAcceptedAt: expect.any(Date) }) })
      );
    });

    it("devuelve además un pase de un solo uso guardado en Redis 60 s; sin Redis, solo el token", async () => {
      mockedUserFindUnique.mockResolvedValue(null);
      mockedBcryptHash.mockResolvedValue("hashed_password" as any);
      mockedJwtSign.mockReturnValue("token_123" as any);
      mockedTransaction.mockImplementation(async (callback: any) => {
        mockedBusinessCreate.mockResolvedValue({ id: "business_123" } as any);
        mockedUserCreate.mockResolvedValue({ id: "user_123", businessId: "business_123" } as any);
        return callback({ business: { create: mockedBusinessCreate }, user: { create: mockedUserCreate } });
      });
      const redisMock = { set: vi.fn().mockResolvedValue("OK") };
      mockedGetRedis.mockReturnValue(redisMock as any);

      const response = await fastify.inject({
        method: "POST",
        url: "/register",
        payload: { email: "test@example.com", password: "password", isEuropeanUnion: true, acceptedTerms: true },
      });
      expect(response.statusCode).toBe(201);
      const { pase } = response.json();
      expect(pase).toMatch(/^[0-9a-f]{64}$/);
      expect(redisMock.set).toHaveBeenCalledWith(
        `auth:pase:${pase}`,
        JSON.stringify({ id: "user_123", businessId: "business_123" }),
        "EX",
        60
      );

      mockedGetRedis.mockReturnValue({ set: vi.fn().mockRejectedValue(new Error("redis caído")) } as any);
      const sinRedis = await fastify.inject({
        method: "POST",
        url: "/register",
        payload: { email: "test2@example.com", password: "password", isEuropeanUnion: true, acceptedTerms: true },
      });
      expect(sinRedis.statusCode).toBe(201);
      expect(sinRedis.json().token).toBe("token_123");
      expect(sinRedis.json().pase).toBeUndefined();
    });

    it("rechaza registro si el usuario ya existe", async () => {
      mockedUserFindUnique.mockResolvedValue({ id: "user_123" } as any);

      const response = await fastify.inject({
        method: "POST",
        url: "/register",
        payload: { email: "test@example.com", password: "password", isEuropeanUnion: true, acceptedTerms: true },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "El usuario ya existe" });
    });

    it("rechaza registro si no se aceptan los términos", async () => {
      mockedUserFindUnique.mockResolvedValue(null);

      const response = await fastify.inject({
        method: "POST",
        url: "/register",
        payload: { email: "test@example.com", password: "password", isEuropeanUnion: true },
      });

      expect(response.statusCode).toBe(400);
      expect(mockedTransaction).not.toHaveBeenCalled();
    });

    it("normaliza y guarda el tipo de negocio cuando se envía", async () => {
      mockedUserFindUnique.mockResolvedValue(null);
      mockedBcryptHash.mockResolvedValue("hashed_password" as any);
      mockedJwtSign.mockReturnValue("token_123" as any);
      mockedTransaction.mockImplementation(async (callback: any) => {
        const business = { id: "business_123", name: "Negocio de test" };
        const user = { id: "user_123", email: "test@example.com", businessId: business.id };
        mockedBusinessCreate.mockResolvedValue(business as any);
        mockedUserCreate.mockResolvedValue(user as any);
        return callback({ business: { create: mockedBusinessCreate }, user: { create: mockedUserCreate } });
      });

      const response = await fastify.inject({
        method: "POST",
        url: "/register",
        payload: {
          email: "test@example.com",
          password: "password",
          isEuropeanUnion: true,
          acceptedTerms: true,
          businessType: "peluqueria",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockedBusinessCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ businessType: "peluqueria" }) })
      );
      expect(mockedCreateBusinessAgent).toHaveBeenCalledWith(
        expect.objectContaining({ businessType: "peluqueria" })
      );
    });
  });

  describe("POST /pase/canjear", () => {
    const PASE = "a".repeat(64);

    it("canjea el pase una sola vez (getdel) y devuelve un token del usuario guardado", async () => {
      const redisMock = {
        getdel: vi.fn().mockResolvedValue(JSON.stringify({ id: "user_9", businessId: "business_9" })),
      };
      mockedGetRedis.mockReturnValue(redisMock as any);
      mockedJwtSign.mockReturnValue("token_9" as any);

      const response = await fastify.inject({ method: "POST", url: "/pase/canjear", payload: { pase: PASE } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ token: "token_9" });
      expect(redisMock.getdel).toHaveBeenCalledWith(`auth:pase:${PASE}`);
      expect(mockedJwtSign).toHaveBeenCalledWith(
        { id: "user_9", businessId: "business_9" },
        expect.any(String),
        expect.anything()
      );
    });

    it("un pase inexistente, caducado o ya usado es 401; un formato raro es 400 sin tocar Redis", async () => {
      const redisMock = { getdel: vi.fn().mockResolvedValue(null) };
      mockedGetRedis.mockReturnValue(redisMock as any);
      const caducado = await fastify.inject({ method: "POST", url: "/pase/canjear", payload: { pase: PASE } });
      expect(caducado.statusCode).toBe(401);
      expect(caducado.json().code).toBe("PASE_INVALIDO");

      const raro = await fastify.inject({ method: "POST", url: "/pase/canjear", payload: { pase: "../x" } });
      expect(raro.statusCode).toBe(400);
      expect(redisMock.getdel).toHaveBeenCalledTimes(1);
    });
  });

  describe("ajustes de cuenta", () => {
    it("devuelve el resumen de la cuenta autenticada", async () => {
      mockedGetAccountOverview.mockResolvedValue({
        email: "test@example.com",
        passwordConfigured: true,
        googleConnected: false,
      });

      const response = await fastify.inject({ method: "GET", url: "/account" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        email: "test@example.com",
        passwordConfigured: true,
        googleConnected: false,
      });
      expect(mockedGetAccountOverview).toHaveBeenCalledWith(
        "user_123",
        "business_123",
      );
    });

    it("cambia una contraseña que cumple los requisitos", async () => {
      mockedChangeAccountPassword.mockResolvedValue({ passwordConfigured: true });

      const response = await fastify.inject({
        method: "POST",
        url: "/change-password",
        payload: { currentPassword: "anterior123", newPassword: "NuevaClave123" },
      });

      expect(response.statusCode).toBe(200);
      expect(mockedChangeAccountPassword).toHaveBeenCalledWith({
        userId: "user_123",
        businessId: "business_123",
        currentPassword: "anterior123",
        newPassword: "NuevaClave123",
      });
    });

    it("rechaza una contraseña nueva débil", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/change-password",
        payload: { currentPassword: "anterior123", newPassword: "sinnumero" },
      });

      expect(response.statusCode).toBe(400);
      expect(mockedChangeAccountPassword).not.toHaveBeenCalled();
    });

    it("solo elimina la cuenta tras confirmar el desvío y la palabra de seguridad", async () => {
      mockedDeleteAccount.mockResolvedValue(undefined);

      const invalidResponse = await fastify.inject({
        method: "DELETE",
        url: "/account",
        payload: { confirmation: "ELIMINAR", forwardingCancelled: false },
      });
      expect(invalidResponse.statusCode).toBe(400);
      expect(mockedDeleteAccount).not.toHaveBeenCalled();

      const response = await fastify.inject({
        method: "DELETE",
        url: "/account",
        payload: {
          currentPassword: "anterior123",
          confirmation: "ELIMINAR",
          forwardingCancelled: true,
        },
      });

      expect(response.statusCode).toBe(204);
      expect(mockedDeleteAccount).toHaveBeenCalledWith({
        userId: "user_123",
        businessId: "business_123",
        currentPassword: "anterior123",
      });
    });
  });

  describe("POST /register-first-user", () => {
    it("permanece oculto en producción sin el secreto de bootstrap", async () => {
      const previousNodeEnv = process.env.NODE_ENV;
      const previousSecret = process.env.FIRST_USER_BOOTSTRAP_SECRET;
      process.env.NODE_ENV = "production";
      delete process.env.FIRST_USER_BOOTSTRAP_SECRET;

      try {
        const response = await fastify.inject({
          method: "POST",
          url: "/register-first-user",
          payload: { email: "admin@example.com", password: "password", businessName: "Peluquería" },
        });

        expect(response.statusCode).toBe(404);
        expect(mockedUserFindFirst).not.toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = previousNodeEnv;
        if (previousSecret === undefined) {
          delete process.env.FIRST_USER_BOOTSTRAP_SECRET;
        } else {
          process.env.FIRST_USER_BOOTSTRAP_SECRET = previousSecret;
        }
      }
    });

    it("crea el primer usuario y negocio", async () => {
      mockedUserFindFirst.mockResolvedValue(null);
      mockedBcryptHash.mockResolvedValue("hashed_password" as any);
      mockedTransaction.mockImplementation(async (callback: any) => {
        const business = { id: "business_123", name: "Peluquería" };
        const user = { id: "user_123", email: "admin@example.com", businessId: business.id, password: "hashed_password" };
        mockedBusinessCreate.mockResolvedValue(business as any);
        mockedUserCreate.mockResolvedValue(user as any);
        return callback({ business: { create: mockedBusinessCreate }, user: { create: mockedUserCreate } });
      });

      const response = await fastify.inject({
        method: "POST",
        url: "/register-first-user",
        payload: { email: "admin@example.com", password: "password", businessName: "Peluquería" },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().message).toContain("created successfully");
      expect(response.json().result.user).not.toHaveProperty("password");
    });

    it("rechaza si ya existe algún usuario", async () => {
      mockedUserFindFirst.mockResolvedValue({ id: "user_existing" } as any);

      const response = await fastify.inject({
        method: "POST",
        url: "/register-first-user",
        payload: { email: "admin@example.com", password: "password", businessName: "Peluquería" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /google", () => {
    it("genera URL de autenticación de Google", async () => {
      const redisMock = { set: vi.fn().mockResolvedValue("OK") };
      mockedGetRedis.mockReturnValue(redisMock as any);

      const response = await fastify.inject({
        method: "GET",
        url: "/google",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().url).toContain("accounts.google.com");
    });
  });

  describe("GET /google/callback", () => {
    beforeEach(() => {
      mockGetToken.mockResolvedValue({ tokens: { id_token: "id_token_123" } } as any);
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ sub: "google_123", email: "new@example.com", email_verified: true }),
      } as any);
      // Sin cuenta previa por googleId ni por email: el callback intentará crear una.
      mockedUserFindUnique.mockResolvedValue(null);
    });

    it("no crea la cuenta si el state no llevaba los términos aceptados", async () => {
      mockedGetRedis.mockReturnValue({
        getdel: vi.fn().mockResolvedValue(JSON.stringify({ termsAccepted: false })),
        set: vi.fn().mockResolvedValue("OK"),
      } as any);

      const response = await fastify.inject({
        method: "GET",
        url: "/google/callback?code=auth_code&state=abc",
        headers: { cookie: "alhabla_google_oauth_state=abc" },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain("error=terms_required");
      expect(mockedTransaction).not.toHaveBeenCalled();
    });

    it("crea la cuenta y registra termsAcceptedAt si el state llevaba los términos aceptados", async () => {
      mockedGetRedis.mockReturnValue({
        getdel: vi.fn().mockResolvedValue(JSON.stringify({ termsAccepted: true })),
        set: vi.fn().mockResolvedValue("OK"),
      } as any);
      mockedTransaction.mockImplementation(async (callback: any) => {
        const business = { id: "business_123", name: "Negocio de new@example.com" };
        const user = { id: "user_123", email: "new@example.com", businessId: business.id };
        mockedBusinessCreate.mockResolvedValue(business as any);
        mockedUserCreate.mockResolvedValue(user as any);
        return callback({ business: { create: mockedBusinessCreate }, user: { create: mockedUserCreate } });
      });

      const response = await fastify.inject({
        method: "GET",
        url: "/google/callback?code=auth_code&state=abc",
        headers: { cookie: "alhabla_google_oauth_state=abc" },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).not.toContain("error=");
      expect(mockedUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ termsAcceptedAt: expect.any(Date) }) })
      );
    });

    it("rechaza el callback si no llega la cookie del navegador que inició el flujo (login CSRF)", async () => {
      mockedGetRedis.mockReturnValue({
        getdel: vi.fn().mockResolvedValue(JSON.stringify({ termsAccepted: true })),
        set: vi.fn().mockResolvedValue("OK"),
      } as any);

      const response = await fastify.inject({
        method: "GET",
        url: "/google/callback?code=auth_code&state=abc",
        // Sin cookie: simula un navegador distinto al que llamó a GET /google
        // completando el callback con el state de otra persona.
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain("error=invalid_state");
      expect(mockedTransaction).not.toHaveBeenCalled();
    });

    it("rechaza el callback si la cookie no coincide con el state recibido", async () => {
      mockedGetRedis.mockReturnValue({
        getdel: vi.fn().mockResolvedValue(JSON.stringify({ termsAccepted: true })),
        set: vi.fn().mockResolvedValue("OK"),
      } as any);

      const response = await fastify.inject({
        method: "GET",
        url: "/google/callback?code=auth_code&state=abc",
        headers: { cookie: "alhabla_google_oauth_state=otro-state-distinto" },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain("error=invalid_state");
      expect(mockedTransaction).not.toHaveBeenCalled();
    });
  });
});
