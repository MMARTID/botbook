import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LlamadasMovil } from "@/components/movil/llamadas-movil";
import { HojaLlamada } from "@/components/movil/hoja-llamada";
import { getCall, getCalls, marcarRecado } from "@/lib/api";
import type { Call } from "@/lib/types";

vi.mock("@/lib/api", () => ({ getCalls: vi.fn(), getCall: vi.fn(), marcarRecado: vi.fn() }));
vi.mock("@/components/providers", () => ({
  useBusiness: () => ({ business: { timezone: "Europe/Madrid" }, hasToken: true }),
}));

const mockedGetCalls = vi.mocked(getCalls);
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

describe("LlamadasMovil", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enseña los filtros con sus recuentos y filtra en el servidor", async () => {
    mockedGetCalls.mockResolvedValue({
      data: [llamada()],
      total: 1,
      limit: 20,
      offset: 0,
      conteos: { todas: 37, conCita: 18, porDevolver: 2 },
    });
    conCliente(<LlamadasMovil />);

    const filtros = await screen.findByRole("group", { name: "Filtrar llamadas" });
    expect(within(filtros).getByRole("button", { name: /Por devolver\s*2/ })).toBeInTheDocument();
    expect(mockedGetCalls).toHaveBeenLastCalledWith(20, 0, "todas");

    await userEvent.click(within(filtros).getByRole("button", { name: /Por devolver/ }));
    await waitFor(() => expect(mockedGetCalls).toHaveBeenLastCalledWith(20, 0, "por_devolver"));
    expect(within(filtros).getByRole("button", { name: /Por devolver/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("sin recuentos (backend anterior) no enseña filtros que no filtrarían", async () => {
    mockedGetCalls.mockResolvedValue({ data: [llamada({ recado: undefined })], total: 1, limit: 20, offset: 0 });
    conCliente(<LlamadasMovil />);

    expect(await screen.findByText("Pide hablar con la dueña.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filtrar llamadas" })).not.toBeInTheDocument();
  });

  it("agrupa por día y pide la página siguiente con «Cargar más»", async () => {
    mockedGetCalls
      .mockResolvedValueOnce({
        data: [llamada({ id: "a" }), llamada({ id: "b", startedAt: "2026-09-29T09:30:00Z" })],
        total: 3,
        limit: 20,
        offset: 0,
        conteos: { todas: 3, conCita: 0, porDevolver: 3 },
      })
      .mockResolvedValueOnce({
        data: [llamada({ id: "c", startedAt: "2026-09-28T09:30:00Z" })],
        total: 3,
        limit: 20,
        offset: 2,
        conteos: { todas: 3, conCita: 0, porDevolver: 3 },
      });
    conCliente(<LlamadasMovil />);

    expect(await screen.findByText("Mostrando 2 de 3 llamadas")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Martes, 29 de septiembre" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cargar 1 más" }));
    expect(await screen.findByText("Mostrando 3 de 3 llamadas")).toBeInTheDocument();
    expect(mockedGetCalls).toHaveBeenLastCalledWith(20, 2, "todas");
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
