import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getBillingSummary,
  createCheckoutSession,
  reconcileCheckoutSession,
  handleStripeEvent,
} from "../../../src/modules/billing/service.js";
import { prisma } from "../../../src/lib/prisma.js";
import { getStripeClient } from "../../../src/lib/stripe.js";
import type Stripe from "stripe";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    call: {
      aggregate: vi.fn(),
    },
    stripeWebhookEvent: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../../src/lib/stripe.js", () => ({
  getStripeClient: vi.fn(),
  getStripeWebhookSecret: vi.fn(),
}));

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedBusinessFindFirst = vi.mocked(prisma.business.findFirst);
const mockedBusinessUpdate = vi.mocked(prisma.business.update);
const mockedCallAggregate = vi.mocked(prisma.call.aggregate);
const mockedStripeWebhookEventFindUnique = vi.mocked(prisma.stripeWebhookEvent.findUnique);
const mockedStripeWebhookEventUpsert = vi.mocked(prisma.stripeWebhookEvent.upsert);
const mockedStripeWebhookEventUpdate = vi.mocked(prisma.stripeWebhookEvent.update);
const mockedGetStripeClient = vi.mocked(getStripeClient);

const businessId = "business_123";
const priceId = "price_test_123";
const customerId = "cus_test_123";
const subscriptionId = "sub_test_123";

function buildBusiness(overrides: Record<string, unknown> = {}) {
  return {
    id: businessId,
    name: "Peluquería Test",
    plan: "basic",
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripePriceId: priceId,
    subscriptionStatus: "TRIALING",
    subscriptionCurrentPeriodStart: new Date("2026-08-01T00:00:00Z"),
    subscriptionCurrentPeriodEnd: new Date("2026-08-31T23:59:59Z"),
    subscriptionTrialEnd: new Date("2026-08-08T00:00:00Z"),
    subscriptionCancelAtPeriodEnd: false,
    users: [{ email: "test@example.com" }],
    ...overrides,
  };
}

function buildStripeEvent(
  type: Stripe.Event.Type,
  object: Record<string, unknown>
): Stripe.Event {
  return {
    id: `evt_${type.replace(/\./g, "_")}_1`,
    object: "event",
    api_version: "2024-12-18.acacia",
    created: Date.now(),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type,
    data: { object: object as any },
  } as Stripe.Event;
}

describe("handleStripeEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedStripeWebhookEventFindUnique.mockResolvedValue(null);
    mockedStripeWebhookEventUpsert.mockResolvedValue({ id: "evt_1" } as any);
    process.env.STRIPE_PRICE_INICIO = priceId;
  });

  it("actualiza el negocio en checkout.session.completed", async () => {
    const event = buildStripeEvent("checkout.session.completed", {
      id: "cs_test_1",
      customer: customerId,
      subscription: subscriptionId,
      metadata: { businessId },
    });
    mockedBusinessFindFirst.mockResolvedValue(buildBusiness() as any);

    const result = await handleStripeEvent(event);

    expect(result.duplicate).toBe(false);
    expect(mockedBusinessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: businessId },
        data: expect.objectContaining({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
        }),
      })
    );
  });

  it("sincroniza suscripción en customer.subscription.updated", async () => {
    const event = buildStripeEvent("customer.subscription.updated", {
      id: subscriptionId,
      customer: customerId,
      status: "active",
      metadata: { businessId },
      items: {
        data: [
          {
            price: { id: priceId },
            current_period_start: 1751328000,
            current_period_end: 1754006400,
          },
        ],
      },
      trial_end: null,
      cancel_at_period_end: false,
    });
    mockedBusinessFindFirst.mockResolvedValue(buildBusiness() as any);

    await handleStripeEvent(event);

    expect(mockedBusinessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionStatus: "ACTIVE",
          stripePriceId: priceId,
          subscriptionCancelAtPeriodEnd: false,
        }),
      })
    );
  });

  it("marca suscripción como cancelada en customer.subscription.deleted", async () => {
    const event = buildStripeEvent("customer.subscription.deleted", {
      id: subscriptionId,
      customer: customerId,
      status: "canceled",
      metadata: { businessId },
      items: {
        data: [
          {
            price: { id: priceId },
            current_period_start: 1751328000,
            current_period_end: 1754006400,
          },
        ],
      },
      trial_end: null,
      cancel_at_period_end: true,
    });
    mockedBusinessFindFirst.mockResolvedValue(buildBusiness() as any);

    await handleStripeEvent(event);

    expect(mockedBusinessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionStatus: "CANCELED",
          subscriptionCancelAtPeriodEnd: true,
        }),
      })
    );
  });

  it("detecta eventos duplicados y no procesa el estado", async () => {
    mockedStripeWebhookEventFindUnique.mockResolvedValue({
      id: "evt_1",
      processedAt: new Date(),
    } as any);

    const event = buildStripeEvent("checkout.session.completed", {
      id: "cs_test_1",
      customer: customerId,
      subscription: subscriptionId,
      metadata: { businessId },
    });

    const result = await handleStripeEvent(event);

    expect(result.duplicate).toBe(true);
    expect(mockedBusinessUpdate).not.toHaveBeenCalled();
  });

  it("registra error si falla el procesamiento", async () => {
    mockedBusinessFindFirst.mockRejectedValue(new Error("DB error"));

    const event = buildStripeEvent("invoice.payment_failed", {
      id: "inv_test_1",
      customer: customerId,
    });

    await expect(handleStripeEvent(event)).rejects.toThrow("DB error");
    expect(mockedStripeWebhookEventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastError: "DB error" }),
      })
    );
  });
});

describe("getBillingSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRICE_INICIO = priceId;
  });

  it("devuelve null si el negocio no existe", async () => {
    mockedBusinessFindUnique.mockResolvedValue(null);

    const result = await getBillingSummary(businessId);

    expect(result).toBeNull();
  });

  it("calcula minutos consumidos en el periodo actual", async () => {
    mockedBusinessFindUnique.mockResolvedValue(buildBusiness() as any);
    mockedCallAggregate.mockResolvedValue({ _sum: { durationSecs: 125 } } as any);

    const result = await getBillingSummary(businessId);

    expect(result).not.toBeNull();
    expect(result?.consumedMinutes).toBe(3); // 125s → ceil(125/60) = 3
    expect(result?.includedMinutes).toBe(100);
  });
});

describe("createCheckoutSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRICE_INICIO = priceId;
    process.env.FRONTEND_URL = "http://localhost:3001";
  });

  it("rechaza negocios con suscripción activa", async () => {
    mockedBusinessFindUnique.mockResolvedValue(
      buildBusiness({ subscriptionStatus: "ACTIVE" }) as any
    );

    await expect(
      createCheckoutSession({ businessId, userId: "user_123", planId: "inicio" })
    ).rejects.toThrow("already has an active subscription");
  });

  it("crea sesión de checkout con cliente y trial", async () => {
    mockedBusinessFindUnique.mockResolvedValue(
      buildBusiness({ subscriptionStatus: null, stripeCustomerId: null }) as any
    );
    const sessionsCreate = vi.fn().mockResolvedValue({
      id: "cs_test_1",
      client_secret: "secret_123",
    });
    const customersCreate = vi.fn().mockResolvedValue({ id: customerId });
    mockedGetStripeClient.mockReturnValue({
      customers: { create: customersCreate },
      checkout: { sessions: { create: sessionsCreate } },
    } as any);

    const result = await createCheckoutSession({
      businessId,
      userId: "user_123",
      planId: "inicio",
    });

    expect(result.clientSecret).toBe("secret_123");
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: expect.objectContaining({
          trial_period_days: 7,
        }),
      })
    );
  });
});

describe("reconcileCheckoutSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRICE_INICIO = priceId;
  });

  it("lanza error si la sesión no pertenece al negocio autenticado", async () => {
    mockedGetStripeClient.mockReturnValue({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cs_test_1",
            client_reference_id: "otro_negocio",
            metadata: { businessId: "otro_negocio" },
            status: "complete",
          }),
        },
      },
    } as any);

    await expect(
      reconcileCheckoutSession({ businessId, sessionId: "cs_test_1" })
    ).rejects.toThrow("does not belong to the authenticated business");
  });
});
