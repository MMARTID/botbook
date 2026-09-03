import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RevenueLossCalculator } from "@/components/revenue-loss-calculator";
import { starterPlan } from "@/lib/plans";

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("RevenueLossCalculator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("usa 35€ y 3 citas perdidas por defecto sin contenido ni estimate guardado", () => {
    render(<RevenueLossCalculator />);

    // 3 citas/semana * 35€ * 4 semanas = 420€/mes
    expect(screen.getByText("420 €")).toBeInTheDocument();
  });

  it("usa el ticket inicial del contenido del nicho si se proporciona", () => {
    render(
      <RevenueLossCalculator
        content={{
          badge: "b",
          title: "t",
          description: "d",
          ticketLabel: "Ticket",
          appointmentsLabel: "Citas",
          initialTicket: 50,
        }}
      />
    );

    // 3 * 50 * 4 = 600€/mes
    expect(screen.getByText("600 €")).toBeInTheDocument();
  });

  it("recupera un estimate guardado previamente y lo usa en vez de los valores por defecto", () => {
    window.localStorage.setItem(
      "alhabla_roi_estimate_v1",
      JSON.stringify({ version: 1, averageTicket: 80, missedAppointmentsPerWeek: 5, updatedAt: Date.now() })
    );

    render(<RevenueLossCalculator />);

    // 5 * 80 * 4 = 1600€/mes
    expect(screen.getByText("1600 €")).toBeInTheDocument();
  });

  it("actualiza la pérdida estimada al mover el slider de ticket medio", () => {
    render(<RevenueLossCalculator />);
    const ticketSlider = screen.getByRole("slider", { name: /ticket medio/i });

    fireEvent.change(ticketSlider, { target: { value: "100" } });

    // 3 * 100 * 4 = 1200€/mes
    expect(screen.getByText("1200 €")).toBeInTheDocument();
  });

  it("recuerda el nuevo valor en localStorage tras cambiarlo", () => {
    render(<RevenueLossCalculator />);
    const ticketSlider = screen.getByRole("slider", { name: /ticket medio/i });

    fireEvent.change(ticketSlider, { target: { value: "90" } });

    const stored = JSON.parse(window.localStorage.getItem("alhabla_roi_estimate_v1")!);
    expect(stored.averageTicket).toBe(90);
  });

  it("el botón de recuperar pérdida activa el contexto ROI y navega a /planes", async () => {
    const user = userEvent.setup();
    render(<RevenueLossCalculator />);

    await user.click(screen.getByRole("button", { name: /Recuperar mis/ }));

    expect(mockPush).toHaveBeenCalledWith("/planes");
    expect(window.sessionStorage.getItem("alhabla_roi_context_v1")).not.toBeNull();
  });

  it("muestra cuántas citas cubrirían el plan de entrada", () => {
    render(<RevenueLossCalculator />);

    // ceil(starterPlan.price / 35)
    const appointmentsToCover = Math.ceil(starterPlan.price / 35);
    expect(
      screen.getByText(new RegExp(`recuperar solo ${appointmentsToCover} citas al mes`, "i"))
    ).toBeInTheDocument();
  });
});
