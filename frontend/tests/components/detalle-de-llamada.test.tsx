import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DetalleDeLlamada } from "@/components/escritorio/llamadas/detalle-de-llamada";
import { getCall, marcarRecado } from "@/lib/api";
import type { Call } from "@/lib/types";

vi.mock("@/lib/api", () => ({ getCall: vi.fn(), marcarRecado: vi.fn() }));

const mockedGetCall = vi.mocked(getCall);
const mockedMarcarRecado = vi.mocked(marcarRecado);

function buildCall(overrides: Partial<Call> = {}): Call {
  return {
    id: "call_1",
    businessId: "biz_1",
    agentId: null,
    callId: "vapi_1",
    fromNumber: null,
    status: "COMPLETED",
    outcome: "RESOLVED",
    sentiment: "POSITIVE",
    summary: null,
    successful: true,
    escalationReason: null,
    toolFailureDetected: null,
    requestedService: null,
    durationSecs: 95,
    voiceProvider: "telnyx",
    costCents: 120,
    startedAt: "2026-09-04T10:00:00Z",
    endedAt: "2026-09-04T10:01:35Z",
    createdAt: "2026-09-04T10:00:00Z",
    updatedAt: "2026-09-04T10:01:35Z",
    ...overrides,
  };
}

// El detalle de la llamada a la derecha del historial de escritorio. Antes
// era un modal (call-detail-modal.tsx); estas pruebas vienen de él.
function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const avisar = vi.fn();
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <DetalleDeLlamada callId="call_1" timeZone="Europe/Madrid" onCerrar={onClose} avisar={avisar} />
    </QueryClientProvider>
  );
  return { onClose, unmount, avisar };
}

describe("DetalleDeLlamada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    // Agrupado como se lee en voz alta, igual que en el resto del panel.
    expect(await screen.findByText("692 13 84 56")).toBeInTheDocument();
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
          externalUrl: "https://vapi.example/rec.mp3",
          storageKey: "k",
          storageUrl: "https://r2.example/rec.mp3",
          reviewed: false,
        } as any,
      })
    );

    renderModal();

    await waitFor(() => expect(document.querySelector("audio")).toHaveAttribute("src", "https://r2.example/rec.mp3"));
  });

  it("un chat de WhatsApp no tiene grabación y lo dice", async () => {
    mockedGetCall.mockResolvedValue(buildCall({ voiceProvider: "whatsapp", durationSecs: null }));

    renderModal();

    expect(await screen.findByText("Chat de WhatsApp: no hay grabación.")).toBeInTheDocument();
    expect(document.querySelector("audio")).toBeNull();
  });

  it("cierra con el botón de cerrar (Escape lo gestiona el historial)", async () => {
    mockedGetCall.mockResolvedValue(buildCall());
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await screen.findByText("Reserva vinculada");

    await user.click(screen.getByRole("button", { name: "Cerrar detalle" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("con un recado pendiente, ofrece llamar al número que dejó y marcarlo como devuelto", async () => {
    mockedGetCall.mockResolvedValue(
      buildCall({
        fromNumber: "+34611222333",
        recado: { id: "l1", nombre: "Pilar", telefono: "622905117", motivo: "Quiere hablar con la dueña.", atendidoAt: null },
      })
    );
    mockedMarcarRecado.mockResolvedValue({
      id: "l1",
      nombre: "Pilar",
      telefono: "622905117",
      motivo: "Quiere hablar con la dueña.",
      atendidoAt: "2026-10-02T10:00:00Z",
    });
    const user = userEvent.setup();
    const { avisar } = renderModal();

    expect(await screen.findByText("Por devolver")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Llamar/ })).toHaveAttribute("href", "tel:+34622905117");

    await user.click(screen.getByRole("button", { name: "Marcar como devuelta" }));

    expect(mockedMarcarRecado).toHaveBeenCalledWith("call_1", true);
    expect(await screen.findByText("Llamada devuelta")).toBeInTheDocument();
    expect(avisar).toHaveBeenCalledWith("Marcada como devuelta.");
  });
});
