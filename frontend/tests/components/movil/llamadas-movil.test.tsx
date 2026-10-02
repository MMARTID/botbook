import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LlamadasMovil } from "@/components/movil/llamadas-movil";
import { HojaLlamada } from "@/components/movil/hoja-llamada";
import { exportarLlamadasCsv, getCall, getLlamadas, marcarRecado } from "@/lib/api";
import { inicioDelDia } from "@/lib/fechas-negocio";
import type { Call } from "@/lib/types";

const replace = vi.fn();
let busqueda = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/llamadas",
  useSearchParams: () => new URLSearchParams(busqueda),
}));
vi.mock("@/lib/api", () => ({
  getLlamadas: vi.fn(),
  getCall: vi.fn(),
  marcarRecado: vi.fn(),
  exportarLlamadasCsv: vi.fn(),
}));
vi.mock("@/components/providers", () => ({
  useBusiness: () => ({ business: { timezone: "Europe/Madrid" }, hasToken: true }),
}));

const mockedGetLlamadas = vi.mocked(getLlamadas);
const mockedExportar = vi.mocked(exportarLlamadasCsv);
const mockedGetCall = vi.mocked(getCall);
const mockedMarcarRecado = vi.mocked(marcarRecado);

function llamada(overrides: Partial<Call> = {}): Call {
  return {
    id: "call_1",
    businessId: "biz_1",
    agentId: null,
    callId: "telnyx_1",
    fromNumber: "+34622905117",
    status: "COMPLETED",
    outcome: "ESCALATED",
    sentiment: "NEGATIVE",
    summary: "Pide hablar con la dueña.",
    successful: null,
    escalationReason: "CLIENTE_LO_PIDIO",
    toolFailureDetected: null,
    requestedService: null,
    durationSecs: 34,
    costCents: 4,
    voiceProvider: "telnyx",
    startedAt: "2026-10-01T15:05:00Z",
    endedAt: "2026-10-01T15:05:34Z",
    createdAt: "2026-10-01T15:05:00Z",
    updatedAt: "2026-10-01T15:05:34Z",
    recado: { id: "lead_1", nombre: "Pilar", telefono: "622905117", motivo: "Quiere hablar con la dueña.", atendidoAt: null },
    ...overrides,
  };
}

function conCliente(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const PAGINA = {
  total: 1,
  limit: 20,
  offset: 0,
  conteos: { todas: 37, conCita: 18, porDevolver: 2 },
  hoy: { desde: "2026-10-01T22:00:00.000Z", llamadas: 4, conCita: 1, duracionMediaSecs: 93 },
};

describe("LlamadasMovil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    busqueda = "";
  });

  it("enseña el resumen de hoy y los resultados con sus recuentos; elegir uno va a la URL", async () => {
    mockedGetLlamadas.mockResolvedValue({ ...PAGINA, data: [llamada()] });
    conCliente(<LlamadasMovil />);

    expect(await screen.findByText("Hoy: 4 conversaciones · 1 con cita · 1:33 de media")).toBeInTheDocument();
    const filtros = screen.getByRole("group", { name: "Filtrar llamadas" });
    expect(within(filtros).getByRole("button", { name: /Por devolver\s*2/ })).toBeInTheDocument();
    expect(within(filtros).getByRole("button", { name: "Sin cita" })).toBeInTheDocument();
    expect(mockedGetLlamadas).toHaveBeenLastCalledWith({ filtro: "todas", orden: "reciente", limit: 20, offset: 0, resumen: "hoy" });

    await userEvent.click(within(filtros).getByRole("button", { name: /Por devolver/ }));
    expect(replace).toHaveBeenLastCalledWith("/llamadas?filtro=por_devolver", { scroll: false });
  });

  it("pide al servidor lo que dice la URL: resultado, canal, fechas y búsqueda", async () => {
    busqueda = "filtro=sin_cita&canal=whatsapp&periodo=7&q=marta";
    mockedGetLlamadas.mockResolvedValue({ ...PAGINA, data: [] });
    conCliente(<LlamadasMovil />);

    expect(await screen.findByText("Ninguna conversación cumple estos filtros.")).toBeInTheDocument();
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
    const [a, m, d] = hoy.split("-").map(Number);
    const haceSeis = new Date(Date.UTC(a, m - 1, d - 6, 12)).toISOString().slice(0, 10);
    expect(mockedGetLlamadas).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filtro: "sin_cita",
        canal: "whatsapp",
        q: "marta",
        desde: inicioDelDia(haceSeis, "Europe/Madrid"),
      })
    );
    expect(screen.getByRole("button", { name: "Filtros, 2 puestos" })).toBeInTheDocument();
  });

  it("agrupa por día y pide la página siguiente con «Cargar más»", async () => {
    mockedGetLlamadas
      .mockResolvedValueOnce({
        ...PAGINA,
        data: [llamada({ id: "a" }), llamada({ id: "b", startedAt: "2026-09-29T09:30:00Z" })],
        total: 3,
      })
      .mockResolvedValueOnce({ ...PAGINA, data: [llamada({ id: "c", startedAt: "2026-09-28T09:30:00Z" })], total: 3, offset: 2 });
    conCliente(<LlamadasMovil />);

    expect(await screen.findByText("Mostrando 2 de 3 llamadas")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Martes, 29 de septiembre" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cargar 1 más" }));
    expect(await screen.findByText("Mostrando 3 de 3 llamadas")).toBeInTheDocument();
    expect(mockedGetLlamadas).toHaveBeenLastCalledWith({ filtro: "todas", orden: "reciente", limit: 20, offset: 2 });
  });

  it("la hoja de filtros cambia canal y ánimo, y exporta a CSV lo filtrado", async () => {
    busqueda = "filtro=con_cita";
    mockedGetLlamadas.mockResolvedValue({ ...PAGINA, data: [llamada()] });
    mockedExportar.mockResolvedValue({ blob: new Blob(["x"]), nombre: "llamadas.csv", omitidas: 0 });
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:csv"), revokeObjectURL: vi.fn() });
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    conCliente(<LlamadasMovil />);

    await userEvent.click(await screen.findByRole("button", { name: "Filtros" }));
    const hoja = await screen.findByRole("dialog", { name: "Filtrar llamadas" });
    await userEvent.click(within(hoja).getByRole("radio", { name: "WhatsApp" }));
    expect(replace).toHaveBeenLastCalledWith("/llamadas?filtro=con_cita&canal=whatsapp", { scroll: false });

    await userEvent.click(within(hoja).getByRole("button", { name: /Exportar a CSV/ }));
    expect(mockedExportar).toHaveBeenCalledWith({ filtro: "con_cita", orden: "reciente" });
    expect(clic).toHaveBeenCalled();
    clic.mockRestore();
  });

  it("abre la llamada que pide la URL (desde el buscador o el Panel)", async () => {
    busqueda = "llamada=call_1";
    mockedGetLlamadas.mockResolvedValue({ ...PAGINA, data: [llamada()] });
    vi.mocked(getCall).mockResolvedValue(llamada());
    conCliente(<LlamadasMovil />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(getCall).toHaveBeenCalledWith("call_1");
  });
});

describe("HojaLlamada", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marca el recado como devuelto y deja deshacerlo", async () => {
    mockedGetCall.mockResolvedValue(llamada());
    mockedMarcarRecado
      .mockResolvedValueOnce({ id: "lead_1", nombre: "Pilar", telefono: "622905117", motivo: null, atendidoAt: "2026-10-02T08:00:00Z" })
      .mockResolvedValueOnce({ id: "lead_1", nombre: "Pilar", telefono: "622905117", motivo: null, atendidoAt: null });
    const avisar = vi.fn();
    conCliente(<HojaLlamada callId="call_1" timeZone="Europe/Madrid" onCerrar={() => {}} avisar={avisar} />);

    const dialogo = await screen.findByRole("dialog");
    expect(await within(dialogo).findByRole("heading", { name: "622 90 51 17" })).toBeInTheDocument();
    expect(within(dialogo).getByRole("link", { name: "Llamar" })).toHaveAttribute("href", "tel:+34622905117");

    await userEvent.click(await within(dialogo).findByRole("button", { name: "Marcar como devuelta" }));
    expect(mockedMarcarRecado).toHaveBeenCalledWith("call_1", true);
    expect(await within(dialogo).findByText("Llamada devuelta")).toBeInTheDocument();
    expect(avisar).toHaveBeenCalledWith("Marcada como devuelta.");

    await userEvent.click(within(dialogo).getByRole("button", { name: "Deshacer" }));
    expect(mockedMarcarRecado).toHaveBeenLastCalledWith("call_1", false);
    expect(await within(dialogo).findByRole("button", { name: "Marcar como devuelta" })).toBeInTheDocument();
  });

  it("enseña la transcripción en su propia pestaña", async () => {
    mockedGetCall.mockResolvedValue(
      llamada({
        recado: null,
        transcript: {
          id: "t1",
          callId: "call_1",
          fullText: "",
          createdAt: "2026-10-01T15:05:34Z",
          messages: [
            { role: "assistant", content: "Peluquería Aurora, ¿en qué puedo ayudarte?" },
            { role: "user", content: "¿Hacéis microblading?" },
          ],
        },
      })
    );
    conCliente(<HojaLlamada callId="call_1" timeZone="Europe/Madrid" onCerrar={() => {}} avisar={() => {}} />);

    await userEvent.click(await screen.findByRole("tab", { name: "Transcripción" }));
    expect(screen.getByText("¿Hacéis microblading?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar como devuelta" })).not.toBeInTheDocument();
  });
});
