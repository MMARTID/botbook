import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import authPlugin, { olvidarVersionesDeToken } from "../../src/plugins/auth.js";
import { prisma } from "../../src/lib/prisma.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn(),
    sign: vi.fn(),
  },
  verify: vi.fn(),
  sign: vi.fn(),
}));

const mockedJwtVerify = vi.mocked(jwt.verify);
const mockedUserFindUnique = vi.mocked(prisma.user.findUnique);

describe("authPlugin", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    olvidarVersionesDeToken();
    mockedUserFindUnique.mockResolvedValue({ tokenVersion: 0 } as never);
    fastify = Fastify();
    await fastify.register(authPlugin);
    fastify.get("/protected", { onRequest: fastify.authenticate }, async (request) => {
      return { user: request.user };
    });
  });

  it("permite el acceso con un token válido", async () => {
    const user = { id: "user_123", businessId: "business_123" };
    mockedJwtVerify.mockReturnValue({ ...user, tv: 0 } as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer valid_token" },
    });

    expect(response.statusCode).toBe(200);
    // `tv` no llega al handler: request.user sigue siendo id + negocio.
    expect(response.json()).toEqual({ user });
  });

  // La regresión de la auditoría del 24-09: cambiar la contraseña no cerraba
  // las sesiones abiertas, que seguían valiendo los 7 días del token.
  it("rechaza un token emitido antes de cambiar la contraseña", async () => {
    mockedJwtVerify.mockReturnValue({
      id: "user_123",
      businessId: "business_123",
      tv: 0,
    } as any);
    mockedUserFindUnique.mockResolvedValue({ tokenVersion: 1 } as never);

    const response = await fastify.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer token_viejo" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("acepta un token antiguo sin versión mientras nadie cambie la contraseña", async () => {
    mockedJwtVerify.mockReturnValue({
      id: "user_123",
      businessId: "business_123",
    } as any);
    mockedUserFindUnique.mockResolvedValue({ tokenVersion: 0 } as never);

    const response = await fastify.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer token_de_antes" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("rechaza si el usuario ya no existe", async () => {
    mockedJwtVerify.mockReturnValue({
      id: "user_borrado",
      businessId: "business_123",
      tv: 0,
    } as any);
    mockedUserFindUnique.mockResolvedValue(null as never);

    const response = await fastify.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer token" },
    });

    expect(response.statusCode).toBe(401);
  });

  // Si no podemos saber si la sesión sigue siendo válida, no lo es.
  it("rechaza si no se puede comprobar la versión (BD caída)", async () => {
    mockedJwtVerify.mockReturnValue({
      id: "user_123",
      businessId: "business_123",
      tv: 0,
    } as any);
    mockedUserFindUnique.mockRejectedValue(new Error("BD caída"));

    const response = await fastify.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer token" },
    });

    expect(response.statusCode).toBe(401);
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
