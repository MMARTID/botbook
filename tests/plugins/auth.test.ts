import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import authPlugin from "../../src/plugins/auth.js";

vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn(),
    sign: vi.fn(),
  },
  verify: vi.fn(),
  sign: vi.fn(),
}));

const mockedJwtVerify = vi.mocked(jwt.verify);

describe("authPlugin", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = Fastify();
    await fastify.register(authPlugin);
    fastify.get("/protected", { onRequest: fastify.authenticate }, async (request) => {
      return { user: request.user };
    });
  });

  it("permite el acceso con un token válido", async () => {
    const user = { id: "user_123", businessId: "business_123" };
    mockedJwtVerify.mockReturnValue(user as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer valid_token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user });
  });

  it("rechaza petición sin cabecera de autorización", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/protected",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Unauthorized: Missing or invalid token" });
  });

  it("rechaza cabecera que no empieza por Bearer", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Basic token" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("rechaza token inválido o expirado", async () => {
    mockedJwtVerify.mockImplementation(() => {
      throw new Error("jwt expired");
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer expired_token" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Unauthorized: Token expired or invalid" });
  });
});
