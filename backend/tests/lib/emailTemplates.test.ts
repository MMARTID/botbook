import { describe, it, expect } from "vitest";
import {
  accountDeletedEmail,
  forwardingCheckedEmail,
  paymentApprovedEmail,
  paymentFailedEmail,
  passwordChangedEmail,
  passwordResetEmail,
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

describe("emails de seguridad de la cuenta", () => {
  it("avisa cuando cambia la contraseña", () => {
    const { subject, html } = passwordChangedEmail();

    expect(subject).toContain("contraseña");
    expect(html).toContain("Si no has sido tú");
  });

  it("confirma la eliminación y recuerda quitar el desvío", () => {
    const { subject, html } = accountDeletedEmail({
      businessName: "Peluquería Ana",
    });

    expect(subject).toContain("Peluquería Ana");
    expect(html).toContain("desvío de llamadas");
  });
});

describe("passwordResetEmail", () => {
  it("lleva el enlace de restablecimiento como CTA y avisa de la caducidad", () => {
    const { subject, html } = passwordResetEmail({
      resetUrl: "https://app.alhabla.ai/restablecer-contrasena?token=abc123",
    });

    expect(subject).toBe("Restablece tu contraseña de Alhabla");
    expect(html).toContain('href="https://app.alhabla.ai/restablecer-contrasena?token=abc123"');
    expect(html).toContain("1 hora");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("deja claro que ignorarlo no cambia nada, para quien no lo pidió", () => {
    const { html } = passwordResetEmail({ resetUrl: "https://app.alhabla.ai/x" });

    expect(html).toContain("Si no has pedido este cambio");
  });
});

describe("forwardingCheckedEmail", () => {
  it("es una buena noticia: asunto con el negocio, texto con mayúscula inicial y CTA a Ajustes › Teléfono", () => {
    const { subject, html } = forwardingCheckedEmail({
      businessName: "Peluquería Ana",
      texto: "tu desvío de llamadas está comprobado: todo bien.",
      panelUrl: "https://app.alhabla.ai/ajustes/telefono",
    });

    expect(subject).toBe("Tu desvío está comprobado — Peluquería Ana");
    expect(html).toContain("Todo listo en Peluquería Ana");
    expect(html).toContain("Tu desvío de llamadas está comprobado: todo bien.");
    expect(html).toContain('href="https://app.alhabla.ai/ajustes/telefono"');
    expect(html).not.toContain("Necesita tu atención");
    expect(html).toContain("<!DOCTYPE html>");
  });
});
