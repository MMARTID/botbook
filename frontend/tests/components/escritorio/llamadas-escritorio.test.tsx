import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LlamadasEscritorio } from "@/components/escritorio/llamadas/llamadas-escritorio";
import { exportarLlamadasCsv, getCall, getLlamadas } from "@/lib/api";
import { inicioDelDia } from "@/lib/fechas-negocio";
import type { Business, Call } from "@/lib/types";

const replace = vi.fn();
let busqueda = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/llamadas",
  useSearchParams: () => new URLSearchParams(busqueda),
}));
vi.mock("@/lib/api", () => ({
  getLlamadas: vi.fn(),
  exportarLlamadasCsv: vi.fn(),
  getCall: vi.fn(),
  marcarRecado: vi.fn(),
}));

const mockedGetLlamadas = vi.mocked(getLlamadas);
const mockedExportar = vi.mocked(exportarLlamadasCsv);

const negocio = { id: "biz_1", name: "Peluquería Aurora", timezone: "Europe/Madrid" } as unknown as Business;

function llamada(extra: Partial<Call> = {}): Call {
  return {
    id: "call_1",
    businessId: "biz_1",
    agentId: null,
    callId: "telnyx:1",
    fromNumber: "+34611222333",
    status: "COMPLETED",
    outcome: "RESOLVED",
    sentiment: "POSITIVE",
    summary: "Pregunta por el horario del sábado.",
    successful: true,
    escalationReason: null,
    toolFailureDetected: null,
    requestedService: null,
    durationSecs: 95,
    costCents: 10,
    voiceProvider: "telnyx",
    startedAt: "2026-10-02T07:41:00Z",
    endedAt: null,
    createdAt: "2026-10-02T07:41:00Z",
    updatedAt: "2026-10-02T07:41:00Z",
    booking: null,
    recado: null,
    ...extra,
  };
}

function pintar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LlamadasEscritorio business={negocio} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  busqueda = "";
  mockedGetLlamadas.mockResolvedValue({
    data: [
      llamada(),
      llamada({
        id: "call_2",
        fromNumber: "+34699431588",
        voiceProvider: "whatsapp",
        durationSecs: null,
        booking: {
          id: "bk_1",
          programedAt: "2026-10-03T09:30:00Z",
          durationMinutes: 45,
          numberPeople: 1,
          isCancelled: false,
          clientPhone: null,
          clientName: "Rocío Martín",
          serviceIds: ["s4"],
          professional: { id: "p2", name: "Noelia" },
          services: [{ id: "s4", name: "Manicura semipermanente", durationMinutes: 45, priceCents: 2200 }],
        },
      }),
    ],
    total: 2,
    limit: 50,
    offset: 0,
    conteos: { todas: 2, conCita: 1, porDevolver: 3 },
    hoy: { desde: "2026-10-01T22:00:00.000Z", llamadas: 14, conCita: 9, duracionMediaSecs: 128 },
  });
  vi.mocked(getCall).mockReturnValue(new Promise(() => {}));
});

afterEach(() => vi.useRealTimers());

describe("LlamadasEscritorio", () => {
  it("pide la página con los filtros de la URL y el resumen de hoy", async () => {
    busqueda = "filtro=sin_cita&canal=whatsapp&animo=NEGATIVE&periodo=hoy&q=marta&orden=mas_larga&pagina=2&por=25";
    pintar();

    await screen.findByText("14 conversaciones");
    expect(mockedGetLlamadas).toHaveBeenCalledWith({
      filtro: "sin_cita",
      canal: "whatsapp",
      sentimiento: "NEGATIVE",
      desde: inicioDelDia("2026-10-02", "Europe/Madrid"),
      q: "marta",
      orden: "mas_larga",
      limit: 25,
      offset: 50,
      resumen: "hoy",
    });
    expect(screen.getByText("9 con cita")).toBeInTheDocument();
    expect(screen.getByText("2:08 de media")).toBeInTheDocument();
    expect(screen.getByText("3 recados por devolver")).toBeInTheDocument();
  });

  it("por defecto: todos los resultados de los últimos 30 días, lo más reciente primero", async () => {
    pintar();

    await screen.findByText("611 22 23 33");
    expect(mockedGetLlamadas).toHaveBeenCalledWith(
      expect.objectContaining({
        filtro: "todas",
        desde: inicioDelDia("2026-09-03", "Europe/Madrid"),
        orden: "reciente",
        limit: 50,
        offset: 0,
      })
    );
  });

  it("pinta cada fila con canal, duración, resultado y la reserva o el resumen", async () => {
    pintar();

    const filaChat = (await screen.findByText("699 43 15 88")).closest("[role=row]") as HTMLElement;
    expect(filaChat).toHaveTextContent("WhatsApp");
    expect(filaChat).toHaveTextContent("Rocío Martín");
    expect(filaChat).toHaveTextContent("Reserva creada");
    expect(filaChat).toHaveTextContent("Manicura semipermanente · Noelia · 22 €");
    const filaVoz = screen.getByText("611 22 23 33").closest("[role=row]") as HTMLElement;
    expect(filaVoz).toHaveTextContent("1:35");
    expect(filaVoz).toHaveTextContent("Consulta");
  });

  it("al cambiar un filtro vuelve a la primera página y abrir una fila la deja en la URL", async () => {
    busqueda = "pagina=3";
    const user = userEvent.setup({ advanceTimers: () => undefined });
    pintar();

    await user.selectOptions(await screen.findByLabelText("Resultado"), "con_cita");
    expect(replace).toHaveBeenLastCalledWith("/llamadas?filtro=con_cita", { scroll: false });

    await user.click(screen.getByText("611 22 23 33"));
    expect(replace).toHaveBeenLastCalledWith("/llamadas?pagina=3&llamada=call_1", { scroll: false });
  });

  it("ordena por duración desde la cabecera", async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    pintar();

    await user.click(await screen.findByRole("button", { name: "Duración" }));
    expect(replace).toHaveBeenLastCalledWith("/llamadas?orden=mas_larga", { scroll: false });
  });

  it("exporta a CSV exactamente lo filtrado", async () => {
    busqueda = "filtro=por_devolver&periodo=7";
    mockedExportar.mockResolvedValue({ blob: new Blob(["x"]), nombre: "llamadas-2026-10-02.csv", omitidas: 0 });
    const crear = vi.fn(() => "blob:csv");
    Object.assign(URL, { createObjectURL: crear, revokeObjectURL: vi.fn() });
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const user = userEvent.setup({ advanceTimers: () => undefined });
    pintar();

    await user.click(await screen.findByRole("button", { name: /Exportar CSV/ }));

    expect(mockedExportar).toHaveBeenCalledWith({
      filtro: "por_devolver",
      canal: undefined,
      sentimiento: undefined,
      desde: inicioDelDia("2026-09-26", "Europe/Madrid"),
      q: undefined,
      orden: "reciente",
    });
    expect(clic).toHaveBeenCalled();
    expect(await screen.findByText("Historial descargado.")).toBeInTheDocument();
    clic.mockRestore();
  });
});
