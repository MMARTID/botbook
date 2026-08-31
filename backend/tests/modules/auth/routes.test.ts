import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authRoutes } from "../../../src/modules/auth/routes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";
import { createBusinessAgent } from "../../../src/lib/agentBootstrap.js";

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

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn(function OAuth2ClientMock() {
    return {
      generateAuthUrl: vi.fn().mockReturnValue("https://accounts.google.com/oauth"),
      getToken: vi.fn(),
      verifyIdToken: vi.fn(),
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

describe("authRoutes", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = "test_secret";
    process.env.GOOGLE_AUTH_CLIENT_ID = "google_client_id";
    process.env.GOOGLE_AUTH_CLIENT_SECRET = "google_client_secret";
    process.env.GOOGLE_AUTH_REDIRECT_URI = "http://localhost:3000/auth/google/callback";

    fastify = Fastify();
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
        payload: { email: "test@example.com", password: "password", isEuropeanUnion: true },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().token).toBe("token_123");
      expect(mockedCreateBusinessAgent).toHaveBeenCalled();
    });

    it("rechaza registro si el usuario ya existe", async () => {
      mockedUserFindUnique.mockResolvedValue({ id: "user_123" } as any);

      const response = await fastify.inject({
        method: "POST",
        url: "/register",
        payload: { email: "test@example.com", password: "password", isEuropeanUnion: true },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "El usuario ya existe" });
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

  describe("POST /register-first-user", () => {
    it("crea el primer usuario y negocio", async () => {
      mockedUserFindFirst.mockResolvedValue(null);
      mockedBcryptHash.mockResolvedValue("hashed_password" as any);
      mockedTransaction.mockImplementation(async (callback: any) => {
        const business = { id: "business_123", name: "Peluquería" };
        const user = { id: "user_123", email: "admin@example.com", businessId: business.id };
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
});
