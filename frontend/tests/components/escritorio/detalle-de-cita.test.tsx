import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DetalleDeCita, origenDeLaCita } from "@/components/escritorio/agenda/detalle-de-cita";
import { moverCita } from "@/lib/api";
import type { AgendaBooking, BusinessSchedule } from "@/lib/types";
import type { CalendarState } from "@/lib/calendar-state";

vi.mock("@/lib/api", () => ({ moverCita: vi.fn() }));
const mockedMover = vi.mocked(moverCita);

const AHORA = new Date("2026-10-02T12:00:00Z");
const tramos = { enabled: true, intervals: [{ start: "09:00", end: "20:00" }] };
const HORARIO: BusinessSchedule = {
  version: 1,
  week: {
    monday: tramos,
    tuesday: tramos,
    wednesday: tramos,
    thursday: tramos,
    friday: tramos,
    saturday: tramos,
    sunday: { enabled: false, intervals: [] },
  },
};
const CALENDARIO = { connected: true, label: "Google Calendar", shortLabel: "Google", webUrl: "https://calendar.google.com" } as CalendarState;

function cita(extra: Partial<AgendaBooking> = {}): AgendaBooking {
  return {
    id: "bk_1",
    callId: "call_1",
    programedAt: "2026-10-03T15:00:00Z", // sábado 17:00 en Madrid
    durationMinutes: 45,
    numberPeople: 1,
    clientPhone: "+34611222333",
    clientName: "Marta Ruiz",
    professional: { id: "p1", name: "Lucía" },
    services: [{ id: "s1", name: "Corte", durationMinutes: 45, priceCents: 1800 }],
    externalEventId: "evt",
    externalCalendarProvider: "google",
    createdAt: "2026-09-30T10:12:00Z",
    createdVia: null,
    origen: { canal: "voz", startedAt: "2026-09-30T10:10:00Z", durationSecs: 134 },
    ...extra,
  };
}

function pintar(laCita: AgendaBooking, extra: Partial<React.ComponentProps<typeof DetalleDeCita>> = {}) {
  const props = {
    cita: laCita,
    timeZone: "Europe/Madrid",
    ahora: AHORA,
    horario: HORARIO,
    profesionales: [
      { id: "p1", name: "Lucía", active: true, serviceIds: [] },
      { id: "p2", name: "Noelia", active: true, serviceIds: [] },
    ] as never,
    calendario: CALENDARIO,
    onCerrar: vi.fn(),
    onMover: vi.fn(),
    moviendo: false,
    onCancelar: vi.fn(),
    cancelando: false,
    avisar: vi.fn(),
    ...extra,
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DetalleDeCita {...props} />
    </QueryClientProvider>
  );
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
});
afterEach(() => vi.useRealTimers());

describe("origenDeLaCita", () => {
  it("cuenta quién la reservó y por dónde", () => {
    expect(origenDeLaCita(cita(), "Europe/Madrid")).toBe("Reservada por la recepcionista el 30 sep, en una llamada de 2:14.");
    expect(origenDeLaCita(cita({ origen: { canal: "whatsapp", startedAt: "2026-09-30T10:10:00Z", durationSecs: null } }), "Europe/Madrid")).toBe(
      "Reservada por la recepcionista el 30 sep, en un chat de WhatsApp."
    );
    expect(origenDeLaCita(cita({ createdVia: "owner_chat", origen: null }), "Europe/Madrid")).toBe("La apuntaste tú con el gestor.");
    expect(origenDeLaCita(cita({ createdVia: "whatsapp_lista_espera" }), "Europe/Madrid")).toBe(
      "La cogió de la lista de espera por WhatsApp el 30 sep."
    );
  });
});

describe("DetalleDeCita", () => {
  it("enseña la cita, el cliente y la conversación en la que se reservó", () => {
    pintar(cita());

    expect(screen.getByRole("heading", { name: "Corte" })).toBeInTheDocument();
    expect(screen.getByText("Sábado, 3 de octubre · 17:00 – 17:45")).toBeInTheDocument();
    expect(screen.getByText("45 min · 18 €")).toBeInTheDocument();
    expect(screen.getByText("Marta Ruiz")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Llamar/ })).toHaveAttribute("href", "tel:+34611222333");
    expect(screen.getByRole("link", { name: /Ver la llamada/ })).toHaveAttribute("href", "/llamadas?llamada=call_1");
  });

  it("cancela solo después de confirmarlo", async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    const { onCancelar } = pintar(cita());

    await user.click(screen.getByRole("button", { name: "Cancelar cita" }));
    expect(screen.getByRole("dialog", { name: "¿Cancelar esta cita?" })).toBeInTheDocument();
    expect(onCancelar).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Sí, cancelar la cita" }));
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it("al moverla comprueba el hueco antes de dejar confirmar", async () => {
    mockedMover.mockResolvedValue({ ok: true });
    const user = userEvent.setup({ advanceTimers: () => undefined });
    const { onMover } = pintar(cita());

    await user.click(screen.getByRole("button", { name: "Mover" }));
    const boton = screen.getByRole("button", { name: /Mover a las/ });
    expect(boton).toBeDisabled(); // misma hora: no hay nada que mover

    await user.selectOptions(screen.getByLabelText("Hora"), "18:30");
    await user.selectOptions(screen.getByLabelText("Profesional"), "p2");
    expect(await screen.findByText("Hueco libre")).toBeInTheDocument();
    expect(mockedMover).toHaveBeenCalledWith("bk_1", { fechaHora: "2026-10-03T18:30", profesionalId: "p2", soloComprobar: true });

    await user.click(screen.getByRole("button", { name: "Mover a las 18:30" }));
    expect(onMover).toHaveBeenCalledWith({ fechaHora: "2026-10-03T18:30", profesionalId: "p2" });
  });

  it("si el hueco no está libre, dice por qué y no deja mover", async () => {
    mockedMover.mockRejectedValue(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: { status: 409, data: { error: "El negocio ya tiene todas sus plazas ocupadas en ese horario." } },
      })
    );
    const user = userEvent.setup({ advanceTimers: () => undefined });
    pintar(cita());

    await user.click(screen.getByRole("button", { name: "Mover" }));
    await user.selectOptions(screen.getByLabelText("Hora"), "10:00");

    expect(await screen.findByText("El negocio ya tiene todas sus plazas ocupadas en ese horario.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mover a las 10:00" })).toBeDisabled();
  });

  it("una cita pasada no se mueve ni se cancela", () => {
    pintar(cita({ programedAt: "2026-10-01T08:00:00Z" }));

    expect(screen.getByText("Cita pasada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mover" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar cita" })).not.toBeInTheDocument();
  });
});
