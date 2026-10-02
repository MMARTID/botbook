import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InicioMovil } from "@/components/movil/inicio-movil";
import {
  getAgenda,
  getBillingSummary,
  getCalls,
  getOnboardingState,
  getPendingBookings,
  getPhoneNumberInfo,
  getStats,
  resolverCitaPendiente,
} from "@/lib/api";
import type { Business } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  getAgenda: vi.fn(),
  getBillingSummary: vi.fn(),
  getCalls: vi.fn(),
  getCall: vi.fn(),
  getOnboardingState: vi.fn(),
  getPendingBookings: vi.fn(),
  getPhoneNumberInfo: vi.fn(),
  getStats: vi.fn(),
  dismissOnboarding: vi.fn(),
  marcarRecado: vi.fn(),
  provisionPhoneNumber: vi.fn(),
  resolverCitaPendiente: vi.fn(),
}));
vi.mock("@/components/providers", () => ({ useBusiness: () => ({ hasToken: true }) }));

const negocio = {
  id: "biz_1",
  name: "Peluquería Aurora",
  phone: "+34912345678",
  timezone: "Europe/Madrid",
  schedule: {},
  plan: "basic",
  active: true,
  bookingCapacity: 2,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  subscriptionStatus: "ACTIVE",
  calendarProvider: "google",
  activeCalendar: { provider: "google", connected: true, calendarId: "primary", accountEmail: "a@b.es", disconnectedAt: null, lastError: null },
  agents: [],
} as unknown as Business;

function conCliente(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("InicioMovil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Solo el reloj: los temporizadores reales siguen para que esperen los findBy.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T04:00:00Z")); // 06:00 en Madrid
    vi.mocked(getAgenda).mockResolvedValue({
      from: "",
      until: "",
      total: 2,
      limit: 50,
      offset: 0,
      hasMore: false,
      bookings: [
        {
          id: "bk_1",
          callId: "c1",
          programedAt: "2026-10-02T08:30:00Z",
          durationMinutes: 150,
          numberPeople: 1,
          clientPhone: "+34633901274",
          professional: { id: "p3", name: "Marisol" },
          services: [{ id: "s3", name: "Mechas balayage", durationMinutes: 150, priceCents: 11000 }],
          externalEventId: null,
          externalCalendarProvider: null,
        },
        {
          id: "bk_2",
          callId: "c2",
          programedAt: "2026-10-02T15:30:00Z",
          durationMinutes: 90,
          numberPeople: 1,
          clientPhone: "+34655214409",
          professional: { id: "p1", name: "Lucía" },
          services: [{ id: "s2", name: "Corte y color", durationMinutes: 90, priceCents: 6500 }],
          externalEventId: null,
          externalCalendarProvider: null,
        },
      ],
    });
    vi.mocked(getPendingBookings).mockResolvedValue([
      {
        id: "lead_1",
        callId: "c9",
        createdAt: "2026-10-01T17:10:00Z",
        clientName: "Rosa",
        clientPhone: "634559021",
        requestedAt: "2026-10-03T09:00:00Z",
        failureCode: "BOOKING_LOCK_TIMEOUT",
      },
    ]);
    vi.mocked(getPhoneNumberInfo).mockResolvedValue({ phoneNumber: "+34910004127", sid: null, purchasedAt: null, status: "active" });
    vi.mocked(getOnboardingState).mockResolvedValue({
      steps: { schedule: true, services: true, professionals: true, calendar: true, whatsapp: true, forwarding: true },
      progress: 100,
      dismissedAt: null,
      completedAt: null,
      isActive: false,
      forwarding: { status: "done", phoneNumber: "+34910004127", confirmedAt: null, firstCallAt: null },
    });
    vi.mocked(getBillingSummary).mockResolvedValue({ includedMinutes: 100, consumedMinutes: 30, extraMinuteCents: 45 } as never);
    vi.mocked(getCalls).mockResolvedValue({ data: [], total: 0, limit: 6, offset: 0, conteos: { todas: 0, conCita: 0, porDevolver: 0 } });
    vi.mocked(getStats).mockResolvedValue({} as never);
  });

  afterEach(() => vi.useRealTimers());

  it("ordena por urgencia: la cita caída, luego la próxima con su cuenta atrás", async () => {
    conCliente(<InicioMovil business={negocio} avisoDeCalendario={null} />);

    expect(await screen.findByRole("heading", { name: "Una cita se quedó sin reservar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Llamar a Rosa/ })).toHaveAttribute("href", "tel:+34634559021");
    const proxima = await screen.findByRole("region", { name: "Próxima cita" });
    expect(within(proxima).getByText("10:30")).toBeInTheDocument();
    expect(within(proxima).getByText("en 4 h 30 min")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Más tarde hoy" })).toBeInTheDocument();
    expect(screen.getByText("Corte y color")).toBeInTheDocument();
  });

  it("«Ya la he confirmado» cierra la cita pendiente", async () => {
    vi.mocked(resolverCitaPendiente).mockResolvedValue({ ok: true, yaResuelta: false });
    conCliente(<InicioMovil business={negocio} avisoDeCalendario={null} />);

    await userEvent.click(await screen.findByRole("button", { name: "Ya la he confirmado" }));
    expect(resolverCitaPendiente).toHaveBeenCalledWith("lead_1", expect.anything());
    expect(await screen.findByText("Cita marcada como confirmada.")).toBeInTheDocument();
  });

  it("el chip de estado cuenta los avisos y abre su hoja", async () => {
    conCliente(<InicioMovil business={negocio} avisoDeCalendario={null} />);

    const chip = await screen.findByRole("button", { name: "Estado del servicio: 1 aviso" });
    await userEvent.click(chip);
    const hoja = await screen.findByRole("dialog", { name: "Estado del servicio" });
    expect(within(hoja).getByText("Un asunto requiere tu atención")).toBeInTheDocument();
    expect(within(hoja).getByText("Cita sin reservar")).toBeInTheDocument();
  });
});
