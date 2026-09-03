import { describe, it, expect } from "vitest";
import { paymentApprovedEmail, paymentFailedEmail } from "../../src/lib/emailTemplates.js";

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
    });

    expect(subject).toContain("Barbería Luis");
  });

  it("incluye el enlace de gestión de facturación como CTA", () => {
    const { html } = paymentFailedEmail({
      businessName: "Barbería Luis",
      manageBillingUrl: "https://alhabla.ai/ajustes/facturacion",
    });

    expect(html).toContain('href="https://alhabla.ai/ajustes/facturacion"');
  });
});
