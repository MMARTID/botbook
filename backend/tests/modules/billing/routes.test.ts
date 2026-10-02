import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { billingRoutes } from "../../../src/modules/billing/routes.js";
import { estadoDelCupoDeFundador } from "../../../src/modules/billing/service.js";

vi.mock("../../../src/modules/billing/service.js", () => ({
  createCheckoutSession: vi.fn(),
  createCustomerPortalSession: vi.fn(),
  estadoDelCupoDeFundador: vi.fn(),
  getBillingSummary: vi.fn(),
  handleStripeEvent: vi.fn(),
  reconcileCheckoutSession: vi.fn(),
}));
vi.mock("../../../src/lib/stripe.js", () => ({ getStripeClient: vi.fn(), getStripeWebhookSecret: vi.fn() }));

describe("GET /billing/fundadores", () => {
  let fastify: ReturnType<typeof Fastify>;
  const authenticate = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = Fastify();
    fastify.decorate("authenticate", authenticate);
    await fastify.register(billingRoutes, { prefix: "/billing" });
  });

  it("es pública y solo devuelve el recuento del cupo", async () => {
    vi.mocked(estadoDelCupoDeFundador).mockResolvedValue({ total: 15, restantes: 14, disponible: true });

    const response = await fastify.inject({ method: "GET", url: "/billing/fundadores" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ total: 15, restantes: 14, disponible: true });
    expect(response.headers["cache-control"]).toBe("public, max-age=60");
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("responde 500 sin detalles si falla el recuento", async () => {
    vi.mocked(estadoDelCupoDeFundador).mockRejectedValue(new Error("db caída"));

    const response = await fastify.inject({ method: "GET", url: "/billing/fundadores" });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("db caída");
  });
});
