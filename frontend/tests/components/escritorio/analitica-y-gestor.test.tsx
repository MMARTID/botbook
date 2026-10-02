import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";
import { AnaliticaEscritorio } from "@/components/escritorio/analitica/analitica-escritorio";
import { GestorEscritorio } from "@/components/escritorio/gestor/gestor-escritorio";
import { getAgenda, getCallAnalytics, getCambiosDelGestor, getGestor } from "@/lib/api";
import type { Business, CallAnalytics } from "@/lib/types";

const replace = vi.fn();
let busqueda = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/llamadas/analitica",
  useSearchParams: () => new URLSearchParams(busqueda),
}));
vi.mock("@/lib/api", () => ({
  getCallAnalytics: vi.fn(),
  getGestor: vi.fn(),
  getCambiosDelGestor: vi.fn(),
  getAgenda: vi.fn(),
  sendGestorMessage: vi.fn(),
  decideGestorAction: vi.fn(),
}));

const NEGOCIO = { id: "biz_1", name: "Peluquería Aurora", timezone: "Europe/Madrid", schedule: null } as unknown as Business;

function conCliente(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  busqueda = "";
});

describe("AnaliticaEscritorio", () => {
  const DATOS: CallAnalytics = {
    days: 30,
    totals: { calls: 164, minutes: 412, averageDurationSecs: 151, bookings: 71, cancelledBookings: 1, waitlistLeads: 9 },
    outcomes: [{ outcome: "RESOLVED", count: 98 }],
    sentiments: [{ sentiment: "POSITIVE", count: 112 }],
    byHour: [],
    byWeekday: [],
    byWeekdayHour: [{ weekday: 5, hour: 11, count: 7 }],
    topServices: [{ service: "Corte", count: 58 }],
  };

  it("pinta las cifras, el mapa de calor por día y hora y cambia el periodo en la URL", async () => {
    vi.mocked(getCallAnalytics).mockResolvedValue(DATOS);
    conCliente(<AnaliticaEscritorio business={NEGOCIO} />);

    expect(await screen.findByText("2m 31s")).toBeInTheDocument();
    expect(screen.getByText("1 cancelada")).toBeInTheDocument();
    const mapa = screen.getByRole("table", { name: /Llamadas por día de la semana y hora/ });
    expect(within(mapa).getByText("Viernes de 11 a 12 h: 7 llamadas")).toBeInTheDocument();
    expect(getCallAnalytics).toHaveBeenCalledWith(30);

    await userEvent.click(screen.getByRole("radio", { name: "90 días" }));
    expect(replace).toHaveBeenLastCalledWith("/llamadas/analitica?dias=90", { scroll: false });
  });

  it("sin el plan Scale enseña la vista previa difuminada con la invitación, no una pantalla vacía", async () => {
    const respuesta = { status: 403, data: { code: "PLAN_LIMIT_ANALYTICS", planId: "pro" }, statusText: "", headers: {}, config: { headers: new AxiosHeaders() } };
    vi.mocked(getCallAnalytics).mockRejectedValue(new AxiosError("403", "ERR_BAD_REQUEST", undefined, undefined, respuesta));
    conCliente(<AnaliticaEscritorio business={NEGOCIO} />);

    expect(await screen.findByRole("heading", { name: "Analítica avanzada, con el plan Scale" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ampliar a Scale" })).toHaveAttribute("href", "/ajustes/facturacion");
    // La vista previa no se lee ni se puede elegir periodo.
    expect(screen.queryByRole("radiogroup", { name: "Periodo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("GestorEscritorio", () => {
  it("al lado del chat: la propuesta que espera, la agenda de hoy y el registro de cambios filtrable", async () => {
    const ahora = Date.now();
    vi.mocked(getGestor).mockResolvedValue({ disponible: true, activoEnNegocio: true, whatsapp: "activo", mensajes: [], propuesta: null });
    vi.mocked(getCambiosDelGestor).mockResolvedValue([
      {
        id: "a1",
        resumen: "Apuntar a Marta el jueves a las 17:00",
        estado: "pendiente",
        en: new Date(ahora - 3_600_000).toISOString(),
        caduca: new Date(ahora + 20 * 3_600_000).toISOString(),
      },
      { id: "a2", resumen: "Mover a Laura de 10:00 a 10:30", estado: "hecho", en: new Date(ahora - 7_200_000).toISOString(), caduca: null },
      { id: "a3", resumen: "Cancelar la cita de las 12:00", estado: "descartado", en: new Date(ahora - 9_000_000).toISOString(), caduca: null },
    ]);
    vi.mocked(getAgenda).mockResolvedValue({
      from: "",
      until: "",
      total: 1,
      limit: 200,
      offset: 0,
      hasMore: false,
      bookings: [
        {
          id: "bk_1",
          callId: null,
          programedAt: new Date(ahora).toISOString(),
          durationMinutes: 30,
          numberPeople: 1,
          clientPhone: null,
          clientName: "Marta",
          professional: { id: "p1", name: "Lucía" },
          services: [{ id: "s1", name: "Corte", durationMinutes: 30, priceCents: 1800 }],
          externalEventId: null,
          externalCalendarProvider: null,
        },
      ],
    } as never);
    conCliente(<GestorEscritorio business={NEGOCIO} hasToken />);

    const contexto = await screen.findByRole("complementary", { name: "Contexto del gestor" });
    expect(await within(contexto).findByRole("heading", { name: "1 propuesta pendiente" })).toBeInTheDocument();
    expect(await within(contexto).findByRole("link", { name: /Corte\s*·\s*Lucía/ })).toHaveAttribute("href", "/agenda?cita=bk_1");
    expect(screen.getByText("Misma conversación que en")).toBeInTheDocument();

    const registro = within(contexto).getByRole("heading", { name: "Cambios del gestor" }).parentElement!;
    expect(within(registro).getAllByRole("listitem")).toHaveLength(3);
    await userEvent.click(within(registro).getByRole("radio", { name: "Hechos" }));
    expect(within(registro).getAllByRole("listitem")).toHaveLength(1);
    expect(within(registro).getByText("Mover a Laura de 10:00 a 10:30")).toBeInTheDocument();
  });

  it("con el gestor apagado no enseña el contexto", async () => {
    vi.mocked(getGestor).mockResolvedValue({ disponible: true, activoEnNegocio: false, whatsapp: "sin_numero", mensajes: [], propuesta: null });
    conCliente(<GestorEscritorio business={NEGOCIO} hasToken />);

    expect(await screen.findByText(/Tienes el gestor desactivado/)).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Contexto del gestor" })).not.toBeInTheDocument();
    expect(getCambiosDelGestor).not.toHaveBeenCalled();
  });
});
