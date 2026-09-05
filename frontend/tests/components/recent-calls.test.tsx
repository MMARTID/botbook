import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecentCalls } from "@/components/recent-calls";
import { getCalls } from "@/lib/api";
import type { Call } from "@/lib/types";

vi.mock("@/lib/api", () => ({ getCalls: vi.fn() }));
vi.mock("@/components/call-detail-modal", () => ({
  CallDetailModal: ({ callId, onClose }: { callId: string; onClose: () => void }) => (
    <div role="dialog">
      Detalle de {callId}
      <button type="button" onClick={onClose}>
        cerrar
      </button>
    </div>
  ),
}));

const mockedGetCalls = vi.mocked(getCalls);

function buildCall(overrides: Partial<Call> = {}): Call {
  return {
    id: "call_1",
    businessId: "biz_1",
    agentId: null,
    vapiCallId: "vapi_1",
    fromNumber: null,
    status: "COMPLETED",
    outcome: "RESOLVED",
    sentiment: "POSITIVE",
    summary: "Cliente reservó un corte de pelo.",
    successful: true,
    durationSecs: 95,
    costCents: 120,
    startedAt: "2026-09-04T10:00:00Z",
    endedAt: "2026-09-04T10:01:35Z",
    createdAt: "2026-09-04T10:00:00Z",
    updatedAt: "2026-09-04T10:01:35Z",
    ...overrides,
  };
}

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RecentCalls />
    </QueryClientProvider>
  );
}

describe("RecentCalls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra un estado de carga mientras llegan las llamadas", () => {
    mockedGetCalls.mockReturnValue(new Promise(() => {}));

    renderWithClient();

    expect(screen.getByLabelText("Cargando llamadas recientes")).toBeInTheDocument();
  });

  it("muestra un error con botón de reintentar si falla la petición", async () => {
    mockedGetCalls.mockRejectedValue(new Error("network error"));

    renderWithClient();

    expect(await screen.findByText("No se pudieron cargar las llamadas.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
  });

  it("muestra el estado vacío si no hay llamadas todavía", async () => {
    mockedGetCalls.mockResolvedValue({ data: [], total: 0, limit: 6, offset: 0 });

    renderWithClient();

    expect(await screen.findByText("Aún no hay llamadas")).toBeInTheDocument();
  });

  it("lista las llamadas con su resultado y marca las que generaron reserva", async () => {
    mockedGetCalls.mockResolvedValue({
      data: [
        buildCall({
          id: "call_1",
          booking: {
            id: "booking_1",
            isCancelled: false,
          } as any,
        }),
      ],
      total: 1,
      limit: 6,
      offset: 0,
    });

    renderWithClient();

    expect(await screen.findByText("Resuelta")).toBeInTheDocument();
    expect(screen.getByText("Reserva creada")).toBeInTheDocument();
    expect(screen.getByText("Cliente reservó un corte de pelo.")).toBeInTheDocument();
  });

  it("no marca 'Reserva creada' si la reserva está cancelada", async () => {
    mockedGetCalls.mockResolvedValue({
      data: [buildCall({ booking: { id: "booking_1", isCancelled: true } as any })],
      total: 1,
      limit: 6,
      offset: 0,
    });

    renderWithClient();

    await screen.findByText("Resuelta");
    expect(screen.queryByText("Reserva creada")).not.toBeInTheDocument();
  });

  it("abre el detalle de la llamada al hacer click y lo cierra desde el modal", async () => {
    mockedGetCalls.mockResolvedValue({ data: [buildCall()], total: 1, limit: 6, offset: 0 });
    const user = userEvent.setup();

    renderWithClient();
    await user.click(await screen.findByText("Cliente reservó un corte de pelo."));

    expect(screen.getByRole("dialog")).toHaveTextContent("Detalle de call_1");

    await user.click(screen.getByRole("button", { name: "cerrar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
