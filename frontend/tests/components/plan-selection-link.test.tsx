import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanSelectionLink } from "@/components/plan-selection-link";

describe("PlanSelectionLink", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("no navega ni guarda el plan mientras el registro está desactivado — muestra el aviso de 'en desarrollo'", async () => {
    const user = userEvent.setup();
    render(<PlanSelectionLink planId="pro" planName="Pro" featured />);

    await user.click(screen.getByRole("button", { name: "Elegir Pro" }));

    expect(window.localStorage.getItem("alhabla_pending_plan")).toBeNull();
    expect(screen.getByText(/social@alhabla\.ai/)).toBeInTheDocument();
  });
});
