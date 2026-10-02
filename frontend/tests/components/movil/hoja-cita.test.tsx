import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HojaCita } from "@/components/movil/hoja-cita";
import { avisarClienteDeCita, cancelarCita, getBookingSettings, moverCita } from "@/lib/api";
import type { AgendaBooking, Business } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  getBookingSettings: vi.fn(),
  moverCita: vi.fn(),
  cancelarCita: vi.fn(),
  avisarClienteDeCita: vi.fn(),
}));

const AHORA = new Date("2026-10-02T12:00:00Z");
const tramos = { enabled: true, intervals: [{ start: "09:00", end: "20:00" }] };
const NEGOCIO = {
  id: "biz_1",
  name: "Peluquería Aurora",
  timezone: "Europe/Madrid",
  schedule: {
    version: 1,
    week: { monday: tramos, tuesday: tramos, wednesday: tramos, thursday: tramos, friday: tramos, saturday: tramos, sunday: { enabled: false, intervals: [] } },
  },
  calendarProvider: "google",
  activeCalendar: { provider: "google", connected: true, calendarId: "primary", accountEmail: null, disconnectedAt: null, lastError: null },
} as unknown as Business;

const CITA: AgendaBooking = {
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
  createdVia: null,
  origen: { canal: "voz", startedAt: "2026-09-30T10:10:00Z", durationSecs: 134 },
};

function pintar(extra: Partial<React.ComponentProps<typeof HojaCita>> = {}) {
  const props = { cita: CITA, business: NEGOCIO, onCerrar: vi.fn(), avisar: vi.fn(), onMovida: vi.fn(), ...extra };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const resultado = render(
    <QueryClientProvider client={queryClient}>
      <HojaCita {...props} />
    </QueryClientProvider>
  );
  return { ...props, ...resultado, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  vi.mocked(getBookingSettings).mockResolvedValue({ professionals: [], services: [] } as never);
});
afterEach(() => vi.useRealTimers());

describe("HojaCita (móvil)", () => {
  it("enseña el cliente y la conversación en la que se reservó", async () => {
    pintar();
    const hoja = await screen.findByRole("dialog");
    expect(within(hoja).getByText("Marta Ruiz")).toBeInTheDocument();
    expect(within(hoja).getByText("Reservada por la recepcionista el 30 sep, en una llamada de 2:14.")).toBeInTheDocument();
    expect(within(hoja).getByRole("link", { name: /Ver la llamada/ })).toHaveAttribute("href", "/llamadas?llamada=call_1");
  });

  it("mueve la cita con el hueco comprobado, avisa a la agenda del día nuevo y ofrece avisar al cliente", async () => {
    vi.mocked(moverCita).mockImplementation(async (_id, cuerpo) =>
      cuerpo.soloComprobar
        ? { ok: true }
        : {
            ok: true,
            mensaje: "Cita movida al sábado 3 de octubre a las 18:30.",
            avisoAlCliente: { telefono: "+34611222333", cliente: "Marta Ruiz" },
          }
    );
    vi.mocked(avisarClienteDeCita).mockResolvedValue({ ok: true, mensaje: "Le estamos mandando el aviso por WhatsApp." });
    const user = userEvent.setup({ advanceTimers: () => undefined });
    const { onCerrar, onMovida, avisar, rerender, queryClient } = pintar();

    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Mover" }));
    await user.selectOptions(screen.getByLabelText("Hora"), "18:30");
    expect(await screen.findByText("Hueco libre")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mover a las 18:30" }));

    expect(moverCita).toHaveBeenLastCalledWith("bk_1", { fechaHora: "2026-10-03T18:30", profesionalId: undefined });
    expect(onCerrar).toHaveBeenCalled();
    expect(onMovida).toHaveBeenCalledWith("2026-10-03");
    expect(avisar).toHaveBeenCalledWith("Cita movida al sábado 3 de octubre a las 18:30.");

    // El padre cierra la hoja de la cita; queda la pregunta de avisar.
    rerender(
      <QueryClientProvider client={queryClient}>
        <HojaCita cita={null} business={NEGOCIO} onCerrar={onCerrar} avisar={avisar} onMovida={onMovida} />
      </QueryClientProvider>
    );
    const pregunta = await screen.findByRole("dialog", { name: "¿Avisamos a Marta Ruiz por WhatsApp?" });
    await user.click(within(pregunta).getByRole("button", { name: "Avisar por WhatsApp" }));
    expect(avisarClienteDeCita).toHaveBeenCalledWith("bk_1", "cambio");
  });

  it("cancela solo después de confirmarlo", async () => {
    vi.mocked(cancelarCita).mockResolvedValue({ ok: true, mensaje: "Cita cancelada y quitada de tu calendario.", avisoAlCliente: null });
    const user = userEvent.setup({ advanceTimers: () => undefined });
    const { onCerrar, avisar } = pintar();

    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancelar cita" }));
    expect(cancelarCita).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sí, cancelar la cita" }));

    expect(cancelarCita).toHaveBeenCalledWith("bk_1");
    expect(onCerrar).toHaveBeenCalled();
    expect(avisar).toHaveBeenCalledWith("Cita cancelada y quitada de tu calendario.");
  });

  it("una cita pasada no se mueve ni se cancela", async () => {
    pintar({ cita: { ...CITA, programedAt: "2026-10-01T08:00:00Z" } });
    const hoja = await screen.findByRole("dialog");
    expect(within(hoja).queryByRole("button", { name: "Mover" })).not.toBeInTheDocument();
    expect(within(hoja).queryByRole("button", { name: "Cancelar cita" })).not.toBeInTheDocument();
  });
});
