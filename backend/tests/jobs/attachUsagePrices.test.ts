import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachUsagePricesJob } from "../../src/jobs/attachUsagePrices.js";
import { prisma } from "../../src/lib/prisma.js";
import { getStripeClient } from "../../src/lib/stripe.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { business: { findMany: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("../../src/lib/stripe.js", () => ({ getStripeClient: vi.fn() }));

const mockedFindMany = vi.mocked(prisma.business.findMany);
const mockedUpdateMany = vi.mocked(prisma.business.updateMany);
const mockedGetStripeClient = vi.mocked(getStripeClient);

const businessId = "business_123";
const subscriptionId = "sub_123";
const basePriceId = "price_inicio";
const usagePriceId = "price_extra_inicio";

describe("attachUsagePricesJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRICE_INICIO = basePriceId;
    process.env.STRIPE_PRICE_EXTRA_INICIO = usagePriceId;
    process.env.STRIPE_PRICE_PRO = "price_pro";
    process.env.STRIPE_PRICE_EXTRA_PRO = "price_extra_pro";
    process.env.STRIPE_PRICE_SCALE = "price_scale";
    process.env.STRIPE_PRICE_EXTRA_SCALE = "price_extra_scale";
  });

  it("añade el precio medido y retrasa el inicio al siguiente periodo", async () => {
    const create = vi.fn().mockResolvedValue({ id: "si_usage" });
    mockedFindMany.mockResolvedValue([
      { id: businessId, stripeSubscriptionId: subscriptionId, stripePriceId: basePriceId },
    ] as any);
    mockedUpdateMany.mockResolvedValue({ count: 1 } as any);
    mockedGetStripeClient.mockReturnValue({
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          id: subscriptionId,
          status: "active",
          cancel_at_period_end: false,
          items: {
            data: [{ price: { id: basePriceId }, current_period_end: 1_789_171_200 }],
          },
        }),
      },
      subscriptionItems: { create },
    } as any);

    await expect(attachUsagePricesJob()).resolves.toBe(1);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription: subscriptionId,
        price: usagePriceId,
        proration_behavior: "none",
        metadata: { alhabla_usage_migration: "2026-09-extra-minutes" },
      }),
      expect.objectContaining({ idempotencyKey: `alhabla-usage-price-${subscriptionId}-${usagePriceId}` })
    );
    expect(mockedUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: businessId, usageBillingStartsAt: null },
        data: { usageBillingStartsAt: new Date("2026-09-12T00:00:00.000Z") },
      })
    );
  });

  it("no retrasa una suscripción nueva que ya trae su precio medido", async () => {
    mockedFindMany.mockResolvedValue([
      { id: businessId, stripeSubscriptionId: subscriptionId, stripePriceId: basePriceId },
    ] as any);
    const create = vi.fn();
    mockedGetStripeClient.mockReturnValue({
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          id: subscriptionId,
          status: "active",
          cancel_at_period_end: false,
          items: {
            data: [
              { price: { id: basePriceId }, current_period_end: 1_789_171_200 },
              { price: { id: usagePriceId }, current_period_end: 1_789_171_200, metadata: {} },
            ],
          },
        }),
      },
      subscriptionItems: { create },
    } as any);

    await expect(attachUsagePricesJob()).resolves.toBe(0);

    expect(create).not.toHaveBeenCalled();
    expect(mockedUpdateMany).not.toHaveBeenCalled();
  });
});
