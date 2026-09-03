import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanSelectionLink } from "@/components/plan-selection-link";

function mockLocation(search = "") {
  const original = window.location;
  const assign = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...original, search, assign },
  });
  return { assign, restore: () => Object.defineProperty(window, "location", { configurable: true, value: original }) };
}

describe("PlanSelectionLink", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("sin sesión, guarda el plan y va a /register con el plan en la URL", async () => {
    const { assign, restore } = mockLocation();
    const user = userEvent.setup();
    render(<PlanSelectionLink planId="pro" planName="Pro" featured />);

    await user.click(screen.getByRole("button", { name: "Elegir Pro" }));

    expect(window.localStorage.getItem("alhabla_pending_plan")).toBe("pro");
    expect(assign).toHaveBeenCalledWith("/register?plan=pro");
    restore();
  });

  it("con sesión iniciada, va directo a /checkout", async () => {
    window.localStorage.setItem("alhabla_token", "jwt_123");
    const { assign, restore } = mockLocation();
    const user = userEvent.setup();
    render(<PlanSelectionLink planId="scale" planName="Scale" featured={false} />);

    await user.click(screen.getByRole("button", { name: "Elegir Scale" }));

    expect(assign).toHaveBeenCalledWith("/checkout?plan=scale");
    restore();
  });

  it("propaga el nicho de la URL actual, normalizado", async () => {
    const { assign, restore } = mockLocation("?niche=centro-de-estetica");
    const user = userEvent.setup();
    render(<PlanSelectionLink planId="inicio" planName="Inicio" featured={false} />);

    await user.click(screen.getByRole("button", { name: "Elegir Inicio" }));

    expect(assign).toHaveBeenCalledWith("/register?plan=inicio&niche=centro-de-estetica");
    restore();
  });

  it("muestra 'Continuando…' mientras navega", async () => {
    const { restore } = mockLocation();
    const user = userEvent.setup();
    render(<PlanSelectionLink planId="pro" planName="Pro" featured />);

    await user.click(screen.getByRole("button", { name: "Elegir Pro" }));

    expect(screen.getByRole("button", { name: /Continuando/ })).toBeDisabled();
    restore();
  });
});
