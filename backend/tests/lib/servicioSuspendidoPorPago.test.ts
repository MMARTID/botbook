import { describe, it, expect } from "vitest";
import { servicioSuspendidoPorPago } from "../../src/lib/planFeatures.js";

const AHORA = new Date("2026-10-08T12:00:00Z");
const dias = (n: number) => new Date(AHORA.getTime() + n * 24 * 60 * 60 * 1000);

describe("servicioSuspendidoPorPago", () => {
  it("no corta nada durante los siete días de gracia de un primer impago", () => {
    expect(
      servicioSuspendidoPorPago(
        { subscriptionStatus: "PAST_DUE", paymentFailureSuspensionAt: dias(5) },
        AHORA
      )
    ).toBe(false);
  });

  it("corta cuando vence la gracia o el job ya suspendió el servicio", () => {
    expect(
      servicioSuspendidoPorPago(
        { subscriptionStatus: "PAST_DUE", paymentFailureSuspensionAt: dias(-1) },
        AHORA
      )
    ).toBe(true);
    expect(
      servicioSuspendidoPorPago(
        { subscriptionStatus: "ACTIVE", callsSuspendedAt: dias(-2) },
        AHORA
      )
    ).toBe(true);
  });

  it("acepta fechas en texto, como llegan desde la caché de voz", () => {
    expect(
      servicioSuspendidoPorPago(
        { subscriptionStatus: "PAST_DUE", paymentFailureSuspensionAt: dias(-1).toISOString() },
        AHORA
      )
    ).toBe(true);
  });

  it("corta en los estados sin cobro posible y deja pasar las cuentas sin Stripe", () => {
    for (const subscriptionStatus of ["CANCELED", "UNPAID", "INCOMPLETE_EXPIRED"]) {
      expect(servicioSuspendidoPorPago({ subscriptionStatus }, AHORA)).toBe(true);
    }
    expect(servicioSuspendidoPorPago({ subscriptionStatus: null }, AHORA)).toBe(false);
  });
});
