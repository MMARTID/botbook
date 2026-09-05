import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CallDetailModal } from "@/components/call-detail-modal";
import { getCall } from "@/lib/api";
import type { Call } from "@/lib/types";

vi.mock("@/lib/api", () => ({ getCall: vi.fn() }));

const mockedGetCall = vi.mocked(getCall);

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
    summary: null,
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

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <CallDetailModal callId="call_1" onClose={onClose} />
    </QueryClientProvider>
  );
  return { onClose, unmount };
}

describe("CallDetailModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = "";
  });

  it("muestra un estado de carga mientras llega el detalle", () => {
    mockedGetCall.mockReturnValue(new Promise(() => {}));

    renderModal();

    expect(screen.getByText("Cargando llamada…")).toBeInTheDocument();
  });

  it("muestra un error si falla la petición", async () => {
    mockedGetCall.mockRejectedValue(new Error("network error"));

    renderModal();

    expect(await screen.findByText("No se pudo cargar el detalle de esta llamada.")).toBeInTheDocument();
  });

  it("muestra el resumen, coste y estado de la llamada", async () => {
    mockedGetCall.mockResolvedValue(buildCall({ summary: "El cliente reservó cita para mañana." }));

    renderModal();

    expect(await screen.findByText("El cliente reservó cita para mañana.")).toBeInTheDocument();
    expect(screen.getByText("1,20 €")).toBeInTheDocument();
    expect(screen.getByText("Resuelta")).toBeInTheDocument();
  });

  it("muestra el teléfono de quien llama cuando la llamada lo trae", async () => {
    mockedGetCall.mockResolvedValue(buildCall({ fromNumber: "692138456" }));

    renderModal();

    expect(await screen.findByText(/692138456/)).toBeInTheDocument();
  });

  it("no muestra nada de teléfono si la llamada no lo trae", async () => {
    mockedGetCall.mockResolvedValue(buildCall({ fromNumber: null }));

    renderModal();

    await screen.findByText("Resuelta");
    expect(screen.queryByText(/\d{6,}/)).not.toBeInTheDocument();
  });

  it("muestra los datos de la reserva vinculada cuando existe y no está cancelada", async () => {
    mockedGetCall.mockResolvedValue(
      buildCall({
        booking: {
          id: "b1",
          programedAt: "2026-09-05T09:00:00Z",
          durationMinutes: 30,
          numberPeople: 1,
          isCancelled: false,
          clientPhone: null,
          serviceIds: ["s1"],
          professional: { id: "p1", name: "Ana" },
          services: [{ id: "s1", name: "Corte", durationMinutes: 30 }],
        },
      })
    );

    renderModal();

    expect(await screen.findByText("Corte")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
  });

  it("muestra varios servicios juntos cuando la reserva tiene más de uno", async () => {
    mockedGetCall.mockResolvedValue(
      buildCall({
        booking: {
          id: "b1",
          programedAt: "2026-09-05T09:00:00Z",
          durationMinutes: 150,
          numberPeople: 1,
          isCancelled: false,
          clientPhone: null,
          serviceIds: ["s1", "s2"],
          professional: { id: "p1", name: "Marta" },
          services: [
            { id: "s1", name: "Corte", durationMinutes: 30 },
            { id: "s2", name: "Mechas", durationMinutes: 120 },
          ],
        },
      })
    );

    renderModal();

    expect(await screen.findByText("Corte y Mechas")).toBeInTheDocument();
  });

  it("avisa si la reserva se canceló después", async () => {
    mockedGetCall.mockResolvedValue(
      buildCall({
        booking: {
          id: "b1",
          programedAt: "2026-09-05T09:00:00Z",
          durationMinutes: 30,
          numberPeople: 1,
          isCancelled: true,
          clientPhone: null,
          serviceIds: [],
        },
      })
    );

    renderModal();

    expect(await screen.findByText("La reserva creada en esta llamada se canceló después.")).toBeInTheDocument();
  });

  it("dice que no hay reserva si la llamada no generó ninguna", async () => {
    mockedGetCall.mockResolvedValue(buildCall({ booking: null }));

    renderModal();

    expect(await screen.findByText("Esta llamada no generó ninguna reserva.")).toBeInTheDocument();
  });

  it("renderiza los mensajes de la transcripción distinguiendo cliente y agente", async () => {
    mockedGetCall.mockResolvedValue(
      buildCall({
        transcript: {
          id: "t1",
          callId: "call_1",
          fullText: "texto completo",
          messages: [
            { role: "user", content: "Hola, quiero reservar" },
            { role: "assistant", content: "Claro, ¿qué día te viene bien?" },
          ],
          createdAt: "2026-09-04T10:00:00Z",
        },
      })
    );

    renderModal();

    expect(await screen.findByText("Hola, quiero reservar")).toBeInTheDocument();
    expect(screen.getByText("Claro, ¿qué día te viene bien?")).toBeInTheDocument();
  });

  it("si la transcripción no trae mensajes estructurados, usa el texto completo", async () => {
    mockedGetCall.mockResolvedValue(
      buildCall({
        transcript: {
          id: "t1",
          callId: "call_1",
          fullText: "Transcripción en texto plano",
          messages: "no-es-un-array" as any,
          createdAt: "2026-09-04T10:00:00Z",
        },
      })
    );

    renderModal();

    expect(await screen.findByText("Transcripción en texto plano")).toBeInTheDocument();
  });

  it("dice que no hay transcripción disponible si la llamada no tiene ninguna", async () => {
    mockedGetCall.mockResolvedValue(buildCall({ transcript: null }));

    renderModal();

    expect(await screen.findByText("Todavía no hay transcripción disponible para esta llamada.")).toBeInTheDocument();
  });

  it("muestra el reproductor de audio si hay grabación disponible", async () => {
    mockedGetCall.mockResolvedValue(
      buildCall({
        recording: {
          id: "r1",
          callId: "call_1",
          vapiUrl: "https://vapi.example/rec.mp3",
          storageKey: "k",
          storageUrl: "https://r2.example/rec.mp3",
          reviewed: false,
        } as any,
      })
    );

    renderModal();
    await screen.findByText("Grabación");

    const audio = document.querySelector("audio");
    expect(audio).toHaveAttribute("src", "https://r2.example/rec.mp3");
  });

  it("cierra al pulsar Escape y al pulsar el botón de cerrar", async () => {
    mockedGetCall.mockResolvedValue(buildCall());
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await screen.findByText("Reserva vinculada");

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cerrar detalle de llamada" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("bloquea el scroll del body mientras está abierto y lo restaura al desmontar", async () => {
    mockedGetCall.mockResolvedValue(buildCall());
    const { unmount } = renderModal();

    await waitFor(() => expect(document.body.style.overflow).toBe("hidden"));

    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
