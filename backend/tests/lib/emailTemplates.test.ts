import { describe, it, expect } from "vitest";
import {
  paymentApprovedEmail,
  paymentFailedEmail,
  subscriptionCancellationInstructionsEmail,
} from "../../src/lib/emailTemplates.js";

describe("paymentApprovedEmail", () => {
  it("incluye el nombre del negocio en el asunto", () => {
    const { subject } = paymentApprovedEmail({ businessName: "Peluquería Ana", planName: "pro" });

    expect(subject).toContain("Peluquería Ana");
  });

  it("incluye el negocio y el plan en el cuerpo del email", () => {
    const { html } = paymentApprovedEmail({ businessName: "Peluquería Ana", planName: "pro" });

    expect(html).toContain("Peluquería Ana");
    expect(html).toContain("pro");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("escapa caracteres especiales del nombre tal cual vienen, sin lanzar", () => {
    expect(() =>
      paymentApprovedEmail({ businessName: "Peluquería <Ana> & Co.", planName: "pro" })
    ).not.toThrow();
  });
});

describe("paymentFailedEmail", () => {
  it("incluye el nombre del negocio en el asunto", () => {
    const { subject } = paymentFailedEmail({
      businessName: "Barbería Luis",
      manageBillingUrl: "https://alhabla.ai/ajustes/facturacion",
      suspensionAt: new Date("2026-09-15T00:00:00.000Z"),
    });

    expect(subject).toContain("Barbería Luis");
  });

  it("incluye el enlace de gestión de facturación como CTA", () => {
    const { html } = paymentFailedEmail({
      businessName: "Barbería Luis",
      manageBillingUrl: "https://alhabla.ai/ajustes/facturacion",
      suspensionAt: new Date("2026-09-15T00:00:00.000Z"),
    });

    expect(html).toContain('href="https://alhabla.ai/ajustes/facturacion"');
  });

  it("indica la fecha límite de suspensión", () => {
    const { html } = paymentFailedEmail({
      businessName: "Barbería Luis",
      manageBillingUrl: "https://alhabla.ai/ajustes/facturacion",
      suspensionAt: new Date("2026-09-15T00:00:00.000Z"),
    });

    expect(html).toContain("15 de septiembre de 2026");
    expect(html).toContain("suspenderemos las llamadas");
  });
});

describe("subscriptionCancellationInstructionsEmail", () => {
  it("pide retirar el desvío de llamadas antes de terminar el servicio", () => {
    const { subject, html } = subscriptionCancellationInstructionsEmail({
      businessName: "Barbería Luis",
      serviceEndsAt: new Date("2026-09-30T00:00:00.000Z"),
      manageBillingUrl: "https://alhabla.ai/ajustes/facturacion",
    });

    expect(subject).toContain("Barbería Luis");
    expect(html).toContain("desactiva el desvío de llamadas");
    expect(html).toContain("30 de septiembre de 2026");
  });
});
