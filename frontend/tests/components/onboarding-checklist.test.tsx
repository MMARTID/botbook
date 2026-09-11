import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { dismissOnboarding, getOnboardingState } from "@/lib/api";
import type { OnboardingForwarding, OnboardingState, OnboardingSteps } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  getOnboardingState: vi.fn(),
  dismissOnboarding: vi.fn(),
}));

const mockedGetOnboardingState = vi.mocked(getOnboardingState);
const mockedDismissOnboarding = vi.mocked(dismissOnboarding);

const TOTAL_PASOS = 5;

function buildState(
  steps: Partial<OnboardingSteps> = {},
  overrides: Partial<OnboardingState> = {},
  forwarding: Partial<OnboardingForwarding> = {}
): OnboardingState {
  const pasos: OnboardingSteps = {
    schedule: false,
    services: false,
    professionals: false,
    calendar: false,
    forwarding: false,
    ...steps,
  };
  const completados = Object.values(pasos).filter(Boolean).length;

  return {
    steps: pasos,
    progress: Math.round((completados / TOTAL_PASOS) * 100),
    dismissedAt: null,
    completedAt: null,
    isActive: completados < TOTAL_PASOS,
    forwarding: {
      status: pasos.forwarding ? "done" : "ready",
      phoneNumber: "+34930453218",
      confirmedAt: null,
      firstCallAt: null,
      ...forwarding,
    },
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
      buildState({
        schedule: true,
        services: true,
        professionals: true,
        calendar: true,
        forwarding: true,
      })
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

    expect(await screen.findByText("Termina de configurar tu recepcionista")).toBeInTheDocument();

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

  it("enlaza el desvío al panel, no a ajustes, cuando el número ya está activo", async () => {
    mockedGetOnboardingState.mockResolvedValue(
      buildState({ schedule: true, services: true, professionals: true, calendar: true })
    );

    renderWithClient();

    expect(await screen.findByRole("link", { name: /Desvía tu teléfono/ })).toHaveAttribute(
      "href",
      "#desvio"
    );
  });

  it("bloquea el desvío mientras el número se está activando", async () => {
    mockedGetOnboardingState.mockResolvedValue(
      buildState(
        { schedule: true, services: true, professionals: true, calendar: true },
        {},
        { status: "waiting_number", phoneNumber: null }
      )
    );

    renderWithClient();

    // El paso se ve, pero no lleva a unas instrucciones que todavía no aplican.
    expect(await screen.findByText("Desvía tu teléfono")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Desvía tu teléfono/ })).not.toBeInTheDocument();
    expect(screen.getByText("Disponible en cuanto tu número esté activo.")).toBeInTheDocument();
  });

  it("muestra el progreso real devuelto por el backend", async () => {
    mockedGetOnboardingState.mockResolvedValue(buildState({ schedule: true, services: true }));

    renderWithClient();

    const barra = await screen.findByRole("progressbar", { name: "Progreso de configuración" });
    expect(barra).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText("2 de 5")).toBeInTheDocument();
  });

  it("tolera la respuesta anterior del backend mientras termina un despliegue escalonado", async () => {
    // Antes de este cambio el endpoint no incluía `forwarding`. Vercel puede
    // publicar la UI antes que Cloud Run, así que ese contrato anterior no
    // debe tirar abajo el panel en los minutos intermedios.
    mockedGetOnboardingState.mockResolvedValue({
      steps: {
        schedule: true,
        services: true,
        professionals: true,
        calendar: true,
      },
      progress: 100,
      dismissedAt: null,
      completedAt: null,
      isActive: true,
    } as any);

    renderWithClient();

    expect(
      await screen.findByText("Termina de configurar tu recepcionista")
    ).toBeInTheDocument();
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
