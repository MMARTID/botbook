import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { dismissOnboarding, getOnboardingState } from "@/lib/api";
import type { OnboardingState, OnboardingSteps } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  getOnboardingState: vi.fn(),
  dismissOnboarding: vi.fn(),
}));

const mockedGetOnboardingState = vi.mocked(getOnboardingState);
const mockedDismissOnboarding = vi.mocked(dismissOnboarding);

function buildState(
  steps: Partial<OnboardingSteps> = {},
  overrides: Partial<OnboardingState> = {}
): OnboardingState {
  const pasos: OnboardingSteps = {
    schedule: false,
    services: false,
    professionals: false,
    calendar: false,
    ...steps,
  };
  const completados = Object.values(pasos).filter(Boolean).length;

  return {
    steps: pasos,
    progress: Math.round((completados / 4) * 100),
    dismissedAt: null,
    completedAt: null,
    isActive: completados < 4,
    ...overrides,
  };
}

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OnboardingChecklist />
    </QueryClientProvider>
  );
}

describe("OnboardingChecklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no muestra nada mientras carga el estado", () => {
    mockedGetOnboardingState.mockReturnValue(new Promise(() => {}));

    const { container } = renderWithClient();

    expect(container).toBeEmptyDOMElement();
  });

  it("no muestra nada si la petición falla", async () => {
    mockedGetOnboardingState.mockRejectedValue(new Error("network error"));

    const { container } = renderWithClient();

    await waitFor(() => expect(mockedGetOnboardingState).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("no muestra nada cuando el onboarding ya no está activo", async () => {
    mockedGetOnboardingState.mockResolvedValue(
      buildState({ schedule: true, services: true, professionals: true, calendar: true })
    );

    const { container } = renderWithClient();

    await waitFor(() => expect(mockedGetOnboardingState).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("no muestra nada si el negocio ya lo descartó, aunque falten pasos", async () => {
    mockedGetOnboardingState.mockResolvedValue(
      buildState({ schedule: true }, { isActive: false, dismissedAt: "2026-09-05T10:00:00Z" })
    );

    const { container } = renderWithClient();

    await waitFor(() => expect(mockedGetOnboardingState).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("lista solo los pasos pendientes, con enlace a su sección de ajustes", async () => {
    mockedGetOnboardingState.mockResolvedValue(buildState({ schedule: true, services: true }));

    renderWithClient();

    expect(await screen.findByText("Termina de configurar tu asistente")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Añade a tu equipo/ })).toHaveAttribute(
      "href",
      "/ajustes?section=professionals"
    );
    expect(screen.getByRole("link", { name: /Conecta tu calendario/ })).toHaveAttribute(
      "href",
      "/ajustes?section=calendar-section"
    );

    // Los ya completados no aparecen como enlace accionable, solo como resumen.
    expect(screen.queryByRole("link", { name: /Configura tu horario/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Añade tus servicios/ })).not.toBeInTheDocument();
  });

  it("enlaza el horario y los servicios a sus anclas reales cuando están pendientes", async () => {
    mockedGetOnboardingState.mockResolvedValue(buildState());

    renderWithClient();

    expect(await screen.findByRole("link", { name: /Configura tu horario/ })).toHaveAttribute(
      "href",
      "/ajustes?section=business-hours"
    );
    expect(screen.getByRole("link", { name: /Añade tus servicios/ })).toHaveAttribute(
      "href",
      "/ajustes?section=services"
    );
  });

  it("muestra el progreso real devuelto por el backend", async () => {
    mockedGetOnboardingState.mockResolvedValue(buildState({ schedule: true, services: true }));

    renderWithClient();

    const barra = await screen.findByRole("progressbar", { name: "Progreso de configuración" });
    expect(barra).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("2 de 4")).toBeInTheDocument();
  });

  it("descarta la guía y refresca el estado al pulsar ocultar", async () => {
    const user = userEvent.setup();
    mockedGetOnboardingState.mockResolvedValue(buildState({ schedule: true }));
    mockedDismissOnboarding.mockResolvedValue({ dismissedAt: "2026-09-05T10:00:00Z" });

    renderWithClient();

    await user.click(
      await screen.findByRole("button", { name: "Ocultar la guía de configuración" })
    );

    await waitFor(() => expect(mockedDismissOnboarding).toHaveBeenCalledTimes(1));
    // La invalidación dispara un refetch: el estado se vuelve a pedir al backend.
    await waitFor(() => expect(mockedGetOnboardingState).toHaveBeenCalledTimes(2));
  });
});
