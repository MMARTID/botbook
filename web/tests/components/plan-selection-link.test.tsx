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

  it("avisa de que con cuenta va al pago, sin ella la crea, y que no cobra durante la prueba", () => {
    render(<PlanSelectionLink planId="inicio" planName="Inicio" featured={false} />);

    expect(screen.getByRole("button", { name: "Elegir Inicio" })).toHaveAccessibleDescription(
      "Si ya tienes cuenta vas directo al pago; si no, la creas. Se pide tarjeta, pero no se cobra nada hasta que termina la prueba."
    );
  });

  // La web no ve la sesión de la app: manda a /elegir-plan de la app, que
  // decide entre checkout y registro.
  it("navega a /elegir-plan de la app con el plan (y el sector) en la query", async () => {
    const location = mockLocationAssign();
    const user = userEvent.setup();
    render(<PlanSelectionLink planId="pro" planName="Pro" featured />);

    await user.click(screen.getByRole("button", { name: "Elegir Pro" }));

    expect(window.localStorage.getItem("alhabla_pending_plan")).toBeNull();
    expect(location.assign).toHaveBeenCalledWith("http://localhost:3001/elegir-plan?plan=pro");
    expect(screen.queryByText(/social@alhabla\.ai/)).not.toBeInTheDocument();

    location.restore();
  });
});
