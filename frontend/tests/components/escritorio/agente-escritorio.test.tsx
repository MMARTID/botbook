import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgenteEscritorio } from "@/components/escritorio/agente/agente-escritorio";
import { getBookingSettings, updateBookingProfessional, updateBookingService } from "@/lib/api";
import type { BookingSettings, Business } from "@/lib/types";

const replace = vi.fn();
let busqueda = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/agente",
  useSearchParams: () => new URLSearchParams(busqueda),
}));
vi.mock("@/lib/api", () => ({
  getBookingSettings: vi.fn(),
  updateBookingService: vi.fn(),
  updateBookingProfessional: vi.fn(),
  createBookingService: vi.fn(),
  deleteBookingService: vi.fn(),
  createBookingProfessional: vi.fn(),
  deleteBookingProfessional: vi.fn(),
  updateBookingCapacity: vi.fn(),
  updateMyBusiness: vi.fn(),
  getPhoneNumberInfo: vi.fn(async () => ({ phoneNumber: null })),
  getOnboardingState: vi.fn(async () => ({})),
  getCalendarList: vi.fn(),
  getGoogleCalendarAuthUrl: vi.fn(),
  getMicrosoftCalendarAuthUrl: vi.fn(),
  selectCalendar: vi.fn(),
  getBillingSummary: vi.fn(async () => ({ planFeatures: [] })),
}));

const tramos = { enabled: true, intervals: [{ start: "09:00", end: "20:00" }] };
const NEGOCIO = {
  id: "biz_1",
  name: "Peluquería Aurora",
  timezone: "Europe/Madrid",
  schedule: {
    version: 1,
    week: { monday: tramos, tuesday: tramos, wednesday: tramos, thursday: tramos, friday: tramos, saturday: tramos, sunday: { enabled: false, intervals: [] } },
  },
  businessDetails: "",
  agents: [{ active: true }],
  calendarProvider: "google",
  activeCalendar: { provider: "google", connected: true, calendarId: "primary", accountEmail: null, disconnectedAt: null, lastError: null },
} as unknown as Business;

const AJUSTES = {
  bookingCapacity: 2,
  services: [
    { id: "s_corte", name: "Corte", durationMinutes: 30, priceCents: 1800, active: true },
    { id: "s_color", name: "Color", durationMinutes: 90, priceCents: null, active: true },
  ],
  professionals: [
    { id: "p_lucia", name: "Lucía", active: true, serviceIds: [], serviceLevels: { s_corte: "especialista" } },
  ],
} as unknown as BookingSettings;

function pintar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgenteEscritorio business={NEGOCIO} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  busqueda = "ajuste=servicios";
  vi.mocked(getBookingSettings).mockResolvedValue(AJUSTES);
  vi.mocked(updateBookingService).mockResolvedValue({} as never);
  vi.mocked(updateBookingProfessional).mockResolvedValue({} as never);
});

describe("AgenteEscritorio", () => {
  it("edita servicios y niveles en la tabla y lo guarda todo de una vez desde la barra", async () => {
    const user = userEvent.setup();
    pintar();

    const precio = await screen.findByLabelText("Precio de Corte en euros");
    await user.clear(precio);
    await user.type(precio, "20");
    await user.selectOptions(screen.getByLabelText("Lucía en Color"), "no_sugerir");

    const barra = screen.getByRole("region", { name: "Cambios sin guardar" });
    expect(within(barra).getByText("2 cambios sin guardar")).toBeInTheDocument();
    // Color sigue sin precio: se avisa, pero no impide guardar.
    expect(within(barra).getByText(/1 servicio sin precio/)).toBeInTheDocument();
    await user.click(within(barra).getByRole("button", { name: "Guardar cambios" }));

    expect(updateBookingService).toHaveBeenCalledWith("s_corte", { name: "Corte", durationMinutes: 30, priceCents: 2000, active: true });
    expect(updateBookingProfessional).toHaveBeenCalledWith("p_lucia", { serviceLevels: { s_corte: "especialista", s_color: "no_sugerir" } });
    expect(await screen.findByText("Cambios guardados.")).toBeInTheDocument();
  });

  it("volver al valor guardado deja de contar como cambio, y una duración imposible no se puede guardar", async () => {
    const user = userEvent.setup();
    pintar();

    const duracion = await screen.findByLabelText("Duración de Corte en minutos");
    await user.clear(duracion);
    await user.type(duracion, "2");
    const barra = screen.getByRole("region", { name: "Cambios sin guardar" });
    expect(within(barra).getByText(/revisa la fila marcada en rojo/)).toBeInTheDocument();
    expect(within(barra).getByRole("button", { name: "Guardar cambios" })).toBeDisabled();

    await user.clear(duracion);
    await user.type(duracion, "30");
    expect(screen.queryByRole("region", { name: "Cambios sin guardar" })).not.toBeInTheDocument();
  });

  it("avisa antes de cambiar de ajuste con cambios sin guardar", async () => {
    const user = userEvent.setup();
    pintar();

    await user.click(await screen.findByLabelText("Color activo"));
    await user.click(screen.getByRole("button", { name: /^Horario/ }));

    const dialogo = screen.getByRole("dialog", { name: "Tienes cambios sin guardar" });
    expect(replace).not.toHaveBeenCalled();
    await user.click(within(dialogo).getByRole("button", { name: "Descartar cambios" }));
    expect(replace).toHaveBeenCalledWith("/agente?ajuste=horario", { scroll: false });
  });

  it("los enlaces de siempre (?section=) abren su ajuste, y el índice marca lo que falta", async () => {
    busqueda = "section=professionals";
    pintar();

    const indice = screen.getByRole("navigation", { name: "Ajustes del agente" });
    expect(await screen.findByRole("heading", { name: "Profesionales" })).toBeInTheDocument();
    const profesionales = await within(indice).findByRole("button", { name: /Profesionales\s*·\s*1/ });
    expect(profesionales).toHaveAttribute("aria-current", "page");
    expect(within(indice).getByRole("button", { name: /Información\s*\(sin rellenar\)/ })).toBeInTheDocument();
  });
});
