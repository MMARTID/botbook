import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CapacidadMovil } from "@/components/movil/agente/capacidad-movil";
import { HorarioMovil } from "@/components/movil/agente/horario-movil";
import { ServiciosMovil } from "@/components/movil/agente/servicios-movil";
import { createBookingService, getBookingSettings, updateBookingCapacity, updateMyBusiness } from "@/lib/api";
import type { Business } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  getBookingSettings: vi.fn(),
  updateBookingCapacity: vi.fn(),
  updateMyBusiness: vi.fn(),
  createBookingService: vi.fn(),
  updateBookingService: vi.fn(),
  deleteBookingService: vi.fn(),
}));

function conCliente(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const tramo = (start: string, end: string) => ({ enabled: true, intervals: [{ start, end }] });
const negocio = {
  id: "biz_1",
  timezone: "Europe/Madrid",
  schedule: {
    version: 1,
    week: {
      monday: { enabled: true, intervals: [{ start: "09:00", end: "14:00" }, { start: "16:30", end: "20:30" }] },
      tuesday: tramo("10:00", "14:00"),
      wednesday: tramo("10:00", "14:00"),
      thursday: tramo("10:00", "14:00"),
      friday: tramo("10:00", "14:00"),
      saturday: { enabled: false, intervals: [] },
      sunday: { enabled: false, intervals: [] },
    },
  },
} as unknown as Business;

describe("pantallas de ajuste del agente (móvil)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBookingSettings).mockResolvedValue({
      bookingCapacity: 2,
      services: [
        { id: "s1", name: "Corte", durationMinutes: 30, priceCents: 1800, active: true, createdAt: "", updatedAt: "" },
      ],
      professionals: [],
    });
  });

  it("capacidad: el contador sube y Guardar manda el valor nuevo", async () => {
    vi.mocked(updateBookingCapacity).mockResolvedValue({} as never);
    conCliente(<CapacidadMovil />);

    expect(await screen.findByText("2 citas simultáneas")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Más plazas" }));
    expect(screen.getByText("3 citas simultáneas")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar capacidad" }));
    expect(updateBookingCapacity).toHaveBeenCalledWith(3, expect.anything());
    expect(await screen.findByText("Capacidad actualizada.")).toBeInTheDocument();
  });

  it("horario: copiar el lunes, explicar el error bajo el día y no dejar guardar con él", async () => {
    vi.mocked(updateMyBusiness).mockResolvedValue(negocio);
    conCliente(<HorarioMovil business={negocio} />);

    await userEvent.click(screen.getByRole("button", { name: "Copiar el lunes a martes–viernes" }));
    const martes = screen.getByRole("region", { name: "Martes" });
    expect(within(martes).getByText("09:00–14:00 · 16:30–20:30")).toBeInTheDocument();

    const lunes = screen.getByRole("region", { name: "Lunes" });
    const cierre = within(lunes).getByLabelText("Lunes, cierre del tramo 1");
    await userEvent.clear(cierre);
    await userEvent.type(cierre, "17:00");
    expect(within(lunes).getByRole("alert")).toHaveTextContent("Los tramos no pueden solaparse.");
    expect(screen.getByRole("button", { name: "Guardar horario" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(within(screen.getByRole("region", { name: "Martes" })).getByText("10:00–14:00")).toBeInTheDocument();
  });

  it("servicios: la hoja crea uno nuevo con los atajos de duración", async () => {
    vi.mocked(createBookingService).mockResolvedValue({} as never);
    conCliente(<ServiciosMovil />);

    expect(await screen.findByText("30 min · 18 €")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Añadir servicio" })[0]);
    const hoja = await screen.findByRole("dialog", { name: "Nuevo servicio" });
    await userEvent.type(within(hoja).getByLabelText("Nombre del servicio"), "Peinado");
    await userEvent.click(within(hoja).getByRole("button", { name: "45 min" }));
    await userEvent.type(within(hoja).getByLabelText("Precio en euros (opcional)"), "20,5");
    await userEvent.click(within(hoja).getByRole("button", { name: "Guardar" }));
    expect(createBookingService).toHaveBeenCalledWith({ name: "Peinado", durationMinutes: 45, priceCents: 2050 });
    expect(await screen.findByText("Servicio creado.")).toBeInTheDocument();
  });
});
