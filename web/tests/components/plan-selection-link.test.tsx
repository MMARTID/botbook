import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanSelectionLink } from "@/components/plan-selection-link";

function mockLocationAssign() {
  const assign = vi.fn();
  const original = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...original, assign },
  });
  return {
    assign,
    restore: () =>
      Object.defineProperty(window, "location", { configurable: true, value: original }),
  };
}

describe("PlanSelectionLink", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("avisa de que crea cuenta, pide tarjeta y no cobra durante la prueba", () => {
    render(<PlanSelectionLink planId="inicio" planName="Inicio" featured={false} />);

    expect(screen.getByRole("button", { name: "Elegir Inicio" })).toHaveAccessibleDescription(
      "Crea tu cuenta y añade una tarjeta: no se cobra nada hasta que termina la prueba."
    );
  });

  // Registro abierto desde 2026-09-21 (antes había un bloqueo «por
  // invitación» solo en producción): siempre navega de verdad.
  it("navega a /register con el plan (y el sector) en la query: en la web nunca hay sesión", async () => {
    const location = mockLocationAssign();
    const user = userEvent.setup();
    render(<PlanSelectionLink planId="pro" planName="Pro" featured />);

    await user.click(screen.getByRole("button", { name: "Elegir Pro" }));

    expect(window.localStorage.getItem("alhabla_pending_plan")).toBeNull();
    expect(location.assign).toHaveBeenCalledWith("/register?plan=pro");
    expect(screen.queryByText(/social@alhabla\.ai/)).not.toBeInTheDocument();

    location.restore();
  });
});
