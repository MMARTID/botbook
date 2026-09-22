import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestorChat } from "@/components/gestor-chat";
import { decideGestorAction, getGestor, sendGestorMessage } from "@/lib/api";
import type { EstadoDelGestor } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  getGestor: vi.fn(),
  sendGestorMessage: vi.fn(),
  decideGestorAction: vi.fn(),
}));

const mockedGet = vi.mocked(getGestor);
const mockedSend = vi.mocked(sendGestorMessage);
const mockedDecide = vi.mocked(decideGestorAction);

function estado(overrides: Partial<EstadoDelGestor> = {}): EstadoDelGestor {
  return {
    disponible: true,
    activoEnNegocio: true,
    whatsapp: "activo",
    mensajes: [],
    propuesta: null,
    ...overrides,
  };
}

function renderChat() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <GestorChat hasToken={true} />
    </QueryClientProvider>
  );
  return queryClient;
}

describe("GestorChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("no disponible y desactivado en el negocio enseñan su aviso, sin cuadro de texto", async () => {
    mockedGet.mockResolvedValueOnce(estado({ disponible: false }));
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <GestorChat hasToken={true} />
      </QueryClientProvider>
    );
    expect(
      await screen.findByText(/todavía no está disponible/)
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Mensaje para tu asistente")).toBeNull();
    unmount();

    mockedGet.mockResolvedValueOnce(estado({ activoEnNegocio: false }));
    renderChat();
    expect(
      await screen.findByText(/Tienes el asistente desactivado/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Ajustes › Teléfono/ })
    ).toHaveAttribute("href", "/ajustes/telefono#whatsapp");
  });

  it("pinta el historial y la propuesta pendiente con sus botones", async () => {
    mockedGet.mockResolvedValue(
      estado({
        mensajes: [
          {
            de: "dueno",
            texto: "¿qué tengo mañana?",
            en: "2026-09-21T08:00:00Z",
          },
          { de: "gestor", texto: "Dos citas.", en: "2026-09-21T08:01:00Z" },
        ],
        propuesta: {
          id: "acc_1",
          resumen: "¿Le aviso a Marta?",
          expiresAt: "2026-09-22T08:00:00Z",
          botones: { confirmar: "Sí, avísale", cancelar: "Le llamo yo" },
        },
      })
    );
    renderChat();
    expect(await screen.findByText("¿qué tengo mañana?")).toBeInTheDocument();
    expect(screen.getByText("Dos citas.")).toBeInTheDocument();
    expect(screen.getByText("¿Le aviso a Marta?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sí, avísale" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Le llamo yo" })
    ).toBeInTheDocument();
  });

  it("enviar un mensaje añade la burbuja, muestra la respuesta y la propuesta; el botón la decide y añade el seguimiento", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(estado());
    mockedSend.mockResolvedValue({
      ok: true,
      respuesta: "Si confirmas, cierro el viernes.",
      propuesta: {
        id: "acc_2",
        resumen: "Cierro el viernes.",
        expiresAt: "2026-09-22T08:00:00Z",
        botones: { confirmar: "Confirmar", cancelar: "Cancelar" },
      },
    });
    mockedDecide.mockResolvedValue({
      ok: true,
      estado: "ejecutada",
      mensaje: "Hecho: el viernes queda cerrado.",
      propuesta: null,
      seguimiento: "¿Algo más?",
    });
    const queryClient = renderChat();
    const invalidar = vi.spyOn(queryClient, "invalidateQueries");

    const campo = await screen.findByLabelText("Mensaje para tu asistente");
    await user.type(campo, "cierra el viernes{Enter}");

    await waitFor(() =>
      expect(mockedSend).toHaveBeenCalledWith("cierra el viernes")
    );
    expect(screen.getByText("cierra el viernes")).toBeInTheDocument();
    expect(
      await screen.findByText("Si confirmas, cierro el viernes.")
    ).toBeInTheDocument();
    expect(campo).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(mockedDecide).toHaveBeenCalledWith("acc_2", "confirmar")
    );
    expect(
      await screen.findByText("Hecho: el viernes queda cerrado.")
    ).toBeInTheDocument();
    expect(screen.getByText("¿Algo más?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ["my-business"] });
  });

  it("un error del backend se enseña sin perder lo escrito en el hilo", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(estado());
    mockedSend.mockRejectedValue(new Error("caído"));
    renderChat();
    await user.type(
      await screen.findByLabelText("Mensaje para tu asistente"),
      "hola{Enter}"
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no ha podido responder/
    );
    expect(screen.getByText("hola")).toBeInTheDocument();
  });
});
