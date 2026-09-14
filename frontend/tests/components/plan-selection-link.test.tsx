import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanSelectionLink } from "@/components/plan-selection-link";
import { isProductionBuild } from "@/lib/env";

vi.mock("@/lib/env", () => ({ isProductionBuild: vi.fn() }));

const mockedIsProductionBuild = vi.mocked(isProductionBuild);

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

  it("en producción no navega ni guarda el plan — muestra el aviso de 'en desarrollo'", async () => {
    mockedIsProductionBuild.mockReturnValue(true);
    const user = userEvent.setup();
    render(<PlanSelectionLink planId="pro" planName="Pro" featured />);

    await user.click(screen.getByRole("button", { name: "Elegir Pro" }));

    expect(window.localStorage.getItem("alhabla_pending_plan")).toBeNull();
    expect(screen.getByText(/social@alhabla\.ai/)).toBeInTheDocument();
  });

  // Fuera de producción (npm run dev, puerto 3001) navega de verdad, para
  // poder probar el flujo de registro/onboarding completo sin el aviso de
  // "en desarrollo" de por medio — decisión explícita del usuario 2026-09-14.
  it("fuera de producción guarda el plan pendiente y navega a /register", async () => {
    mockedIsProductionBuild.mockReturnValue(false);
    const location = mockLocationAssign();
    const user = userEvent.setup();
    render(<PlanSelectionLink planId="pro" planName="Pro" featured />);

    await user.click(screen.getByRole("button", { name: "Elegir Pro" }));

    expect(window.localStorage.getItem("alhabla_pending_plan")).toBe("pro");
    expect(location.assign).toHaveBeenCalledWith(expect.stringContaining("/register?plan=pro"));
    expect(screen.queryByText(/social@alhabla\.ai/)).not.toBeInTheDocument();

    location.restore();
  });
});
