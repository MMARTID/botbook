import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AgendaPage from "@/app/agenda/page";
import { useBusiness } from "@/components/providers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/components/providers", () => ({
  useBusiness: vi.fn(),
}));

// La agenda de verdad pide datos por su cuenta; aquí solo interesa si la
// página llega a pintarla o la sustituye por la pantalla de error.
vi.mock("@/components/agenda-timeline", () => ({
  AgendaTimeline: () => <div data-testid="agenda-timeline">citas</div>,
}));

const mockedUseBusiness = vi.mocked(useBusiness);

const NEGOCIO = {
  id: "neg_1",
  name: "Peluquería Lola",
  timezone: "Europe/Madrid",
  calendarProvider: "google",
  googleCalendarConnected: true,
} as unknown as ReturnType<typeof useBusiness>["business"];

function estadoDeNegocio(overrides: Partial<ReturnType<typeof useBusiness>>) {
  mockedUseBusiness.mockReturnValue({
    business: null,
    hasToken: true,
    isLoadingBusiness: false,
    isError: false,
    errorMessage: null,
    ...overrides,
  } as ReturnType<typeof useBusiness>);
}

describe("AgendaPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enseña la pantalla de error si la carga falla y no hay negocio", () => {
    estadoDeNegocio({ isError: true, errorMessage: "Network Error" });

    render(<AgendaPage />);

    expect(screen.getByText("No se pudo cargar tu agenda")).toBeInTheDocument();
    expect(screen.queryByTestId("agenda-timeline")).not.toBeInTheDocument();
  });

  // Esta query se refresca al volver a la pestaña y React Query marca error sin
  // soltar los datos en caché. Si la pantalla de error ganara en ese caso, un
  // microcorte de red le borraría la agenda al usuario que la está mirando.
  it("mantiene la agenda en pantalla si lo que falla es un refresco con datos ya cargados", () => {
    estadoDeNegocio({ business: NEGOCIO, isError: true, errorMessage: "Network Error" });

    render(<AgendaPage />);

    expect(screen.getByTestId("agenda-timeline")).toBeInTheDocument();
    expect(screen.queryByText("No se pudo cargar tu agenda")).not.toBeInTheDocument();
  });

  it("pinta la agenda con normalidad cuando no hay ningún error", () => {
    estadoDeNegocio({ business: NEGOCIO });

    render(<AgendaPage />);

    expect(screen.getByTestId("agenda-timeline")).toBeInTheDocument();
  });

  it("no pinta nada mientras carga", () => {
    estadoDeNegocio({ isLoadingBusiness: true });

    render(<AgendaPage />);

    expect(screen.getByText("Cargando agenda…")).toBeInTheDocument();
  });
});
