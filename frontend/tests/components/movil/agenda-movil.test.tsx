import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgendaMovil } from "@/components/movil/agenda-movil";
import { getAgenda, getBookingSettings } from "@/lib/api";
import type { AgendaBooking, Business } from "@/lib/types";

const replace = vi.fn();
let busqueda = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/agenda",
  useSearchParams: () => new URLSearchParams(busqueda),
}));
vi.mock("@/lib/api", () => ({
  getAgenda: vi.fn(),
  getBookingSettings: vi.fn(),
  moverCita: vi.fn(),
  cancelarCita: vi.fn(),
  avisarClienteDeCita: vi.fn(),
}));

const NEGOCIO = { id: "biz_1", name: "Peluquería Aurora", timezone: "Europe/Madrid", schedule: {} } as unknown as Business;

function cita(id: string, pro: { id: string; name: string }, programedAt: string): AgendaBooking {
  return {
    id,
    callId: `call_${id}`,
    programedAt,
    durationMinutes: 30,
    numberPeople: 1,
    clientPhone: "+34611222333",
    clientName: `Cliente ${id}`,
    professional: pro,
    services: [{ id: "s1", name: "Corte", durationMinutes: 30, priceCents: 1800 }],
    externalEventId: null,
    externalCalendarProvider: null,
  };
}

const LUCIA = { id: "p1", name: "Lucía" };
const NOELIA = { id: "p2", name: "Noelia" };

function pintar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgendaMovil business={NEGOCIO} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T08:00:00Z"));
  busqueda = "";
  vi.mocked(getAgenda).mockResolvedValue({
    from: "",
    until: "",
    total: 2,
    limit: 50,
    offset: 0,
    hasMore: false,
    bookings: [cita("a", LUCIA, "2026-10-02T09:00:00Z"), cita("b", NOELIA, "2026-10-02T10:00:00Z")],
  });
  vi.mocked(getBookingSettings).mockResolvedValue({
    professionals: [
      { ...LUCIA, active: true, serviceIds: [] },
      { ...NOELIA, active: true, serviceIds: [] },
    ],
    services: [],
  } as never);
});
afterEach(() => vi.useRealTimers());

describe("AgendaMovil", () => {
  it("filtra por profesional desde la URL y lo cambia con sus pastillas", async () => {
    busqueda = "pro=p2";
    const user = userEvent.setup({ advanceTimers: () => undefined });
    pintar();

    expect(await screen.findByText("Cliente b", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("Cliente a", { exact: false })).not.toBeInTheDocument();

    await user.click(within(screen.getByRole("radiogroup", { name: "Profesional" })).getByRole("radio", { name: "Todos" }));
    expect(replace).toHaveBeenLastCalledWith("/agenda", { scroll: false });
  });

  it("abre la cita que pide la URL (desde el buscador o «Ver en la agenda»)", async () => {
    busqueda = "cita=a";
    pintar();

    const hoja = await screen.findByRole("dialog");
    expect(within(hoja).getByText("Cliente a")).toBeInTheDocument();
  });
});
