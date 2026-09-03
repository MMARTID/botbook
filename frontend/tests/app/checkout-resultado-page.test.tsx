import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CheckoutResultPage from "@/app/checkout/resultado/page";
import { getBillingSummary, reconcileCheckoutSession } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getBillingSummary: vi.fn(),
  reconcileCheckoutSession: vi.fn(),
}));

const mockedGetBillingSummary = vi.mocked(getBillingSummary);
const mockedReconcileCheckoutSession = vi.mocked(reconcileCheckoutSession);

function renderPage(sessionId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CheckoutResultPage searchParams={{ session_id: sessionId }} />
    </QueryClientProvider>
  );
}

describe("CheckoutResultPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("con session_id, reconcilia esa sesión de checkout en vez de pedir el resumen general", async () => {
    mockedReconcileCheckoutSession.mockResolvedValue({ status: "ACTIVE" } as any);

    renderPage("cs_test_123");

    await waitFor(() => expect(mockedReconcileCheckoutSession).toHaveBeenCalledWith("cs_test_123"));
    expect(mockedGetBillingSummary).not.toHaveBeenCalled();
  });

  it("sin session_id, pide el resumen de facturación general", async () => {
    mockedGetBillingSummary.mockResolvedValue({ status: "TRIALING" } as any);

    renderPage(undefined);

    await waitFor(() => expect(mockedGetBillingSummary).toHaveBeenCalled());
    expect(mockedReconcileCheckoutSession).not.toHaveBeenCalled();
  });

  it("con estado ACTIVE, muestra la confirmación y el CTA a ajustes", async () => {
    mockedGetBillingSummary.mockResolvedValue({ status: "ACTIVE" } as any);

    renderPage();

    expect(await screen.findByText("Suscripción confirmada")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Configurar mi negocio" });
    expect(cta).toHaveAttribute("href", "/ajustes?from=checkout");
    expect(screen.queryByRole("button", { name: /Actualizar/ })).not.toBeInTheDocument();
  });

  it("con estado TRIALING, también se considera confirmado", async () => {
    mockedGetBillingSummary.mockResolvedValue({ status: "TRIALING" } as any);

    renderPage();

    expect(await screen.findByText("Suscripción confirmada")).toBeInTheDocument();
  });

  it("con un estado pendiente, muestra el mensaje de espera y permite reintentar", async () => {
    mockedGetBillingSummary.mockResolvedValue({ status: "INCOMPLETE" } as any);

    renderPage();

    expect(await screen.findByText("Estamos confirmando tu suscripción")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Ver facturación" });
    expect(cta).toHaveAttribute("href", "/ajustes/facturacion");
    expect(screen.getByRole("button", { name: /Actualizar/ })).toBeInTheDocument();
  });

  it("el botón Actualizar vuelve a pedir el estado de la suscripción", async () => {
    mockedGetBillingSummary.mockResolvedValue({ status: "INCOMPLETE" } as any);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Estamos confirmando tu suscripción");
    mockedGetBillingSummary.mockClear();

    await user.click(screen.getByRole("button", { name: /Actualizar/ }));

    await waitFor(() => expect(mockedGetBillingSummary).toHaveBeenCalled());
  });

  it("propaga hasPlaceSchedule al CTA si el flag estaba en localStorage, y lo consume", async () => {
    window.localStorage.setItem("alhabla_place_schedule_imported", "true");
    mockedGetBillingSummary.mockResolvedValue({ status: "ACTIVE" } as any);

    renderPage();

    const cta = await screen.findByRole("link", { name: "Configurar mi negocio" });
    expect(cta).toHaveAttribute("href", "/ajustes?from=checkout&hasPlaceSchedule=true");
    expect(window.localStorage.getItem("alhabla_place_schedule_imported")).toBeNull();
  });
});
