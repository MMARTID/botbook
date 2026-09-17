import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentOperationalSummary } from "@/components/agent-operational-summary";
import {
  useOperationalStatus,
  type OperationalStatusItem,
  type OperationalTone,
} from "@/components/operational-status";
import type { Business } from "@/lib/types";

vi.mock("@/components/operational-status", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/operational-status")>()),
  useOperationalStatus: vi.fn(),
}));

const mockedUseOperationalStatus = vi.mocked(useOperationalStatus);

const NEGOCIO = { id: "neg_1", name: "Peluquería Lola" } as unknown as Business;

function item(key: OperationalStatusItem["key"], tone: OperationalTone, value: string): OperationalStatusItem {
  return { key, label: key, icon: (() => null) as never, value, tone };
}

function estado(items: OperationalStatusItem[], isLoading = false) {
  mockedUseOperationalStatus.mockReturnValue({
    items,
    isLoading,
  } as unknown as ReturnType<typeof useOperationalStatus>);
}

describe("AgentOperationalSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("da el visto bueno solo si todas las comprobaciones han salido bien", () => {
    estado([item("agent", "ok", "Atendiendo llamadas"), item("phone", "ok", "+34 600 000 000")]);

    render(<AgentOperationalSummary business={NEGOCIO} agentActive />);

    expect(screen.getByText("La recepción está preparada para atender llamadas.")).toBeInTheDocument();
  });

  it("avisa de los ajustes pendientes cuando algo requiere atención", () => {
    estado([item("agent", "ok", "Atendiendo llamadas"), item("calendar", "warning", "Sin conectar")]);

    render(<AgentOperationalSummary business={NEGOCIO} agentActive />);

    expect(screen.getByText(/requieren atención/)).toBeInTheDocument();
  });

  // El tono `unknown` existe para no mentirle al negocio: si la consulta del
  // teléfono o del onboarding falla, este titular no puede dar el visto bueno
  // mientras las tarjetas de debajo dicen "No se ha podido comprobar".
  it("no da el visto bueno si alguna comprobación no ha contestado", () => {
    estado([item("agent", "ok", "Atendiendo llamadas"), item("phone", "unknown", "No se ha podido comprobar")]);

    render(<AgentOperationalSummary business={NEGOCIO} agentActive />);

    expect(screen.getByText(/No hemos podido comprobar todo el estado/)).toBeInTheDocument();
    expect(
      screen.queryByText("La recepción está preparada para atender llamadas.")
    ).not.toBeInTheDocument();
  });

  it("un problema real manda sobre una comprobación sin contestar", () => {
    estado([item("phone", "unknown", "No se ha podido comprobar"), item("calendar", "error", "Conexión caducada")]);

    render(<AgentOperationalSummary business={NEGOCIO} agentActive />);

    expect(screen.getByText(/requieren atención/)).toBeInTheDocument();
  });

  it("mientras comprueba no adelanta ningún veredicto", () => {
    estado([item("agent", "ok", "Atendiendo llamadas")], true);

    render(<AgentOperationalSummary business={NEGOCIO} agentActive />);

    expect(screen.getByText("Comprobando el estado de la recepción…")).toBeInTheDocument();
    expect(
      screen.queryByText("La recepción está preparada para atender llamadas.")
    ).not.toBeInTheDocument();
  });
});
