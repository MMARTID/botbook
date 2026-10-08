import { beforeEach, describe, expect, it, vi } from "vitest";
import { processUsageReportJob } from "../../src/jobs/processUsageReport.js";
import { prisma } from "../../src/lib/prisma.js";
import { getStripeClient } from "../../src/lib/stripe.js";
import { acquireLock, releaseLock } from "../../src/lib/bookingLock.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    call: { aggregate: vi.fn() },
    billingUsagePeriod: {
      upsert: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    billingUsageReport: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../../src/lib/stripe.js", () => ({ getStripeClient: vi.fn() }));
vi.mock("../../src/lib/cloudTasks.js", () => ({ enqueueEmailJob: vi.fn() }));
vi.mock("../../src/modules/whatsapp/alertas.js", () => ({
  alertarMinutos: vi.fn().mockResolvedValue({ via: "interactivo" }),
}));
vi.mock("../../src/lib/bookingLock.js", () => ({ acquireLock: vi.fn(), releaseLock: vi.fn() }));

const mockedFindBusiness = vi.mocked(prisma.business.findUnique);
const mockedAggregate = vi.mocked(prisma.call.aggregate);
const mockedUpsertPeriod = vi.mocked(prisma.billingUsagePeriod.upsert);
const mockedFindPeriod = vi.mocked(prisma.billingUsagePeriod.findUniqueOrThrow);
const mockedFindPreviousPeriod = vi.mocked(prisma.billingUsagePeriod.findFirst);
const mockedFindReport = vi.mocked(prisma.billingUsageReport.findFirst);
const mockedCreateReport = vi.mocked(prisma.billingUsageReport.create);
const mockedTransaction = vi.mocked(prisma.$transaction);
const mockedGetStripeClient = vi.mocked(getStripeClient);
const mockedAcquireLock = vi.mocked(acquireLock);
const mockedReleaseLock = vi.mocked(releaseLock);

describe("processUsageReportJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRICE_INICIO = "price_inicio";
    mockedAcquireLock.mockResolvedValue("lock-token");
    mockedFindBusiness.mockResolvedValue({
      stripeCustomerId: "cus_123",
      stripePriceId: "price_inicio",
      subscriptionCurrentPeriodStart: new Date("2026-09-01T00:00:00.000Z"),
      subscriptionCurrentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
      usageBillingStartsAt: null,
      name: "Peluquería Test",
      users: [],
    } as any);
    mockedAggregate.mockResolvedValue({ _sum: { durationSecs: 125 } } as any);
    mockedUpsertPeriod.mockResolvedValue({
      id: "period_123",
      reportedMinutes: 0,
      warningEmailSentAt: null,
    } as any);
    mockedFindPeriod.mockResolvedValueOnce({ reportedMinutes: 0 } as any)
      .mockResolvedValueOnce({ reportedMinutes: 3 } as any);
    mockedFindReport.mockResolvedValue(null);
    // Sin periodo anterior que reconciliar, salvo en los tests que lo piden.
    mockedFindPreviousPeriod.mockResolvedValue(null);
    mockedCreateReport.mockResolvedValue({ id: "report_123", minutes: 3, identifier: "alhabla-minutes-period_123-3" } as any);
    mockedTransaction.mockResolvedValue([] as any);
  });

  it("envía a Stripe solamente el incremento de minutos y confirma el informe", async () => {
    const createMeterEvent = vi.fn().mockResolvedValue({ identifier: "alhabla-minutes-period_123-3" });
    mockedGetStripeClient.mockReturnValue({ billing: { meterEvents: { create: createMeterEvent } } } as any);

    await processUsageReportJob({ businessId: "business_123" });

    expect(createMeterEvent).toHaveBeenCalledWith(
      {
        event_name: "alhabla_call_minutes",
        identifier: "alhabla-minutes-period_123-3",
        payload: { stripe_customer_id: "cus_123", value: "3" },
      },
      { idempotencyKey: "alhabla-minutes-period_123-3" }
    );
    expect(mockedCreateReport).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ minutes: 3 }) })
    );
    expect(mockedReleaseLock).toHaveBeenCalledWith("billing_usage:business_123", "lock-token");
  });

  it("al 80 % de los minutos avisa por email y por WhatsApp (alerta #5) una sola vez", async () => {
    const { enqueueEmailJob } = await import("../../src/lib/cloudTasks.js");
    const { alertarMinutos } = await import("../../src/modules/whatsapp/alertas.js");
    const createMeterEvent = vi.fn().mockResolvedValue({ identifier: "x" });
    mockedGetStripeClient.mockReturnValue({ billing: { meterEvents: { create: createMeterEvent } } } as any);
    mockedFindBusiness.mockResolvedValue({
      stripeCustomerId: "cus_123",
      stripePriceId: "price_inicio",
      subscriptionCurrentPeriodStart: new Date("2026-09-01T00:00:00.000Z"),
      subscriptionCurrentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
      usageBillingStartsAt: null,
      name: "Peluquería Test",
      users: [{ email: "dueno@example.com" }],
    } as any);
    // 150 minutos incluidos en Inicio: 130 consumidos pasan del 80 %.
    mockedAggregate.mockResolvedValue({ _sum: { durationSecs: 130 * 60 } } as any);
    mockedFindPeriod.mockReset();
    mockedFindPeriod.mockResolvedValue({ reportedMinutes: 130 } as any);

    await processUsageReportJob({ businessId: "business_123" });

    expect(enqueueEmailJob).toHaveBeenCalledWith(
      expect.objectContaining({ toAddress: "dueno@example.com" })
    );
    expect(alertarMinutos).toHaveBeenCalledWith({
      businessId: "business_123",
      periodId: "period_123",
      consumidos: 130,
      incluidos: 150,
      extraMinuteCents: expect.any(Number),
    });
  });

  it("no informa consumo antes del periodo activado para una suscripción existente", async () => {
    mockedFindBusiness.mockResolvedValue({
      stripeCustomerId: "cus_123",
      stripePriceId: "price_inicio",
      subscriptionCurrentPeriodStart: new Date("2026-09-01T00:00:00.000Z"),
      subscriptionCurrentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
      usageBillingStartsAt: new Date("2026-10-01T00:00:00.000Z"),
      name: "Peluquería Test",
      users: [],
    } as any);

    await processUsageReportJob({ businessId: "business_123" });

    expect(mockedAggregate).not.toHaveBeenCalled();
    expect(mockedGetStripeClient).not.toHaveBeenCalled();
  });

  // La regresión: una llamada que empieza en un periodo y termina en el
  // siguiente se cuenta en el anterior, pero el job ya miraba el nuevo y sus
  // minutos no se informaban nunca.
  it("informa los minutos del periodo anterior que quedaron sin informar, fechados en ese periodo", async () => {
    const createMeterEvent = vi.fn().mockResolvedValue({});
    mockedGetStripeClient.mockReturnValue({ billing: { meterEvents: { create: createMeterEvent } } } as any);
    const finAnterior = new Date(Date.now() - 10 * 60 * 1000);
    mockedFindBusiness.mockResolvedValue({
      stripeCustomerId: "cus_123",
      stripePriceId: "price_inicio",
      subscriptionCurrentPeriodStart: finAnterior,
      subscriptionCurrentPeriodEnd: new Date(finAnterior.getTime() + 30 * 24 * 60 * 60 * 1000),
      usageBillingStartsAt: null,
      name: "Peluquería Test",
      users: [],
    } as any);
    mockedFindPreviousPeriod.mockResolvedValue({
      id: "period_anterior",
      periodStart: new Date(finAnterior.getTime() - 30 * 24 * 60 * 60 * 1000),
      periodEnd: finAnterior,
    } as any);
    // Periodo anterior: 125 s → 3 min, ya informados 1. Periodo actual: nada.
    mockedAggregate
      .mockResolvedValueOnce({ _sum: { durationSecs: 0 } } as any)
      .mockResolvedValueOnce({ _sum: { durationSecs: 125 } } as any);
    mockedFindPeriod.mockReset();
    mockedFindPeriod
      .mockResolvedValueOnce({ reportedMinutes: 1 } as any)
      .mockResolvedValueOnce({ reportedMinutes: 3 } as any)
      .mockResolvedValue({ reportedMinutes: 0 } as any);
    mockedCreateReport.mockResolvedValueOnce({
      id: "report_anterior",
      minutes: 2,
      identifier: "alhabla-minutes-period_anterior-3",
    } as any);

    await processUsageReportJob({ businessId: "business_123" });

    expect(mockedAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startedAt: { gte: expect.any(Date), lt: finAnterior },
        }),
      })
    );
    expect(createMeterEvent).toHaveBeenCalledTimes(1);
    expect(createMeterEvent).toHaveBeenCalledWith(
      {
        event_name: "alhabla_call_minutes",
        identifier: "alhabla-minutes-period_anterior-3",
        payload: { stripe_customer_id: "cus_123", value: "2" },
        timestamp: Math.floor(finAnterior.getTime() / 1000) - 1,
      },
      { idempotencyKey: "alhabla-minutes-period_anterior-3" }
    );
  });
});
