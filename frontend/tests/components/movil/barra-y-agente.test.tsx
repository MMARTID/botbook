import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BarraDePestañas, esRutaDePestaña } from "@/components/movil/barra-de-pestanas";
import { AgenteMovil } from "@/components/movil/agente-movil";
import { getBookingSettings } from "@/lib/api";
import type { Business } from "@/lib/types";
import { CATALOGO_DE_IDIOMAS } from "../../fixtures/catalogo-de-idiomas";

const replace = vi.fn();
let parametros = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => parametros,
}));
vi.mock("@/lib/api", () => ({
  getBookingSettings: vi.fn(),
  getCalls: vi.fn(),
  getCatalogoDeIdiomas: vi.fn(async () => CATALOGO_DE_IDIOMAS),
}));

describe("BarraDePestañas", () => {
  it("son las cinco pestañas, sin «Más», y marca la actual", () => {
    render(<BarraDePestañas pathname="/llamadas" porDevolver={2} avisoDeMinutos />);
    const barra = screen.getByRole("navigation", { name: "Navegación principal" });
    const enlaces = within(barra).getAllByRole("link");
    expect(enlaces.map((enlace) => enlace.textContent?.replace(/\d+ por devolver|Quedan pocos minutos del plan/, "").trim())).toEqual([
      "Inicio",
      "Agenda",
      "Llamadas",
      "Agente",
      "Cuenta",
    ]);
    expect(within(barra).getByRole("link", { name: /Llamadas/ })).toHaveAttribute("aria-current", "page");
    expect(within(barra).getByText("por devolver", { exact: false })).toBeInTheDocument();
    expect(within(barra).getByText("Quedan pocos minutos del plan")).toBeInTheDocument();
  });

  it("sin nada por devolver no pinta insignia", () => {
    render(<BarraDePestañas pathname="/" porDevolver={0} avisoDeMinutos={false} />);
    expect(screen.queryByText("por devolver", { exact: false })).not.toBeInTheDocument();
  });

  it("las pantallas de detalle no llevan barra", () => {
    expect(esRutaDePestaña("/agente")).toBe(true);
    expect(esRutaDePestaña("/ajustes")).toBe(true);
    expect(esRutaDePestaña("/agente/horario")).toBe(false);
    expect(esRutaDePestaña("/ajustes/telefono")).toBe(false);
  });
});

const negocio = {
  id: "biz_1",
  name: "Peluquería Aurora",
  timezone: "Europe/Madrid",
  bookingCapacity: 2,
  businessDetails: "",
  calendarProvider: "google",
  activeCalendar: { provider: "google", connected: false, calendarId: null, accountEmail: null, disconnectedAt: null, lastError: null },
  agentSettings: { tone: "professional", primaryGoal: "customer_service", languages: ["es-ES", "en-GB"] },
  schedule: {
    version: 1,
    week: {
      monday: { enabled: true, intervals: [{ start: "09:00", end: "14:00" }] },
      tuesday: { enabled: true, intervals: [{ start: "09:00", end: "14:00" }] },
      wednesday: { enabled: false, intervals: [] },
      thursday: { enabled: false, intervals: [] },
      friday: { enabled: false, intervals: [] },
      saturday: { enabled: false, intervals: [] },
      sunday: { enabled: false, intervals: [] },
    },
  },
} as unknown as Business;

function conCliente(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("AgenteMovil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parametros = new URLSearchParams();
    vi.mocked(getBookingSettings).mockResolvedValue({ bookingCapacity: 2, services: [], professionals: [] });
  });

  it("resume cada ajuste en una línea y marca lo que falta", async () => {
    conCliente(<AgenteMovil business={negocio} />);

    expect(screen.getByRole("link", { name: /Horario del negocio\s*L–M 9:00–14:00/ })).toHaveAttribute("href", "/agente/horario");
    expect(await screen.findByText("Sin servicios configurados")).toBeInTheDocument();
    expect(screen.getByText("Sin conectar")).toBeInTheDocument();
    expect(screen.getByText("Español, Inglés · Profesional · Atender consultas")).toBeInTheDocument();
  });

  it("el resumen de cómo atiende empieza por el idioma en que saluda", async () => {
    const enCatalan = {
      ...negocio,
      agentSettings: { ...negocio.agentSettings, languages: ["es-ES", "en-GB", "ca-ES"], voiceLanguage: "ca-ES" },
    } as Business;
    conCliente(<AgenteMovil business={enCatalan} />);

    expect(await screen.findByText("Catalán, Español, Inglés · Profesional · Atender consultas")).toBeInTheDocument();
  });

  it("los enlaces de siempre (?section=) abren la pantalla del ajuste", async () => {
    parametros = new URLSearchParams("section=services");
    conCliente(<AgenteMovil business={negocio} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/agente/servicios"));
  });
});
