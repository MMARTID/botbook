import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import internalAuthPlugin from "../../src/plugins/internalAuth.js";

const { mockVerifyIdToken } = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn(function OAuth2ClientMock() {
    return { verifyIdToken: mockVerifyIdToken };
  }),
}));

const SERVICE_ACCOUNT = "invoker@test.iam.gserviceaccount.com";

describe("internalAuthPlugin", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.INTERNAL_JOBS_BASE_URL = "https://api.alhabla.ai";
    process.env.CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT = SERVICE_ACCOUNT;

    fastify = Fastify();
    await fastify.register(internalAuthPlugin);
    fastify.post("/internal/protected", { preValidation: [fastify.verifyCloudTasks] }, async () => {
      return { ok: true };
    });
  });

  it("rechaza la petición si no hay cabecera de autorización", async () => {
    const response = await fastify.inject({ method: "POST", url: "/internal/protected" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Unauthorized: Missing OIDC token" });
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it("rechaza una cabecera que no empieza por Bearer", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/internal/protected",
      headers: { authorization: "Basic token" },
    });

    expect(response.statusCode).toBe(401);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it("rechaza un token OIDC que no verifica (firma inválida o caducado)", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("Token used too late"));

    const response = await fastify.inject({
      method: "POST",
      url: "/internal/protected",
      headers: { authorization: "Bearer bad_token" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Unauthorized: Invalid OIDC token" });
  });

  it("rechaza un token válido pero de una cuenta de servicio distinta a la esperada", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "otra-cuenta@test.iam.gserviceaccount.com", email_verified: true }),
    });

    const response = await fastify.inject({
      method: "POST",
      url: "/internal/protected",
      headers: { authorization: "Bearer valid_but_wrong_issuer" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "Forbidden: Unexpected token issuer" });
  });

  it("rechaza un token con el email correcto pero sin verificar", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: SERVICE_ACCOUNT, email_verified: false }),
    });

    const response = await fastify.inject({
      method: "POST",
      url: "/internal/protected",
      headers: { authorization: "Bearer unverified_email" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("deja pasar la petición con un token OIDC válido de la cuenta de servicio esperada", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: SERVICE_ACCOUNT, email_verified: true }),
    });

    const response = await fastify.inject({
      method: "POST",
      url: "/internal/protected",
      headers: { authorization: "Bearer good_token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(mockVerifyIdToken).toHaveBeenCalledWith(
      expect.objectContaining({ idToken: "good_token", audience: "https://api.alhabla.ai" })
    );
  });
});
