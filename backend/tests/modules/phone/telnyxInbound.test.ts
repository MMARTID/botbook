import { describe, it, expect } from "vitest";
import { selectTelnyxInboundAgent } from "../../../src/modules/phone/telnyxInbound.js";

const AGENT = { id: "agent1", telnyxAssistantId: "assistant_1" };

describe("selectTelnyxInboundAgent", () => {
  it("devuelve el primer agente con assistant Telnyx operativo", () => {
    const result = selectTelnyxInboundAgent({
      callsSuspendedAt: null,
      paymentFailureSuspensionAt: null,
      agents: [AGENT],
    });

    expect(result).toEqual(AGENT);
  });

  it("devuelve null si el negocio está suspendido manualmente", () => {
    const result = selectTelnyxInboundAgent({
      callsSuspendedAt: new Date("2020-01-01"),
      paymentFailureSuspensionAt: null,
      agents: [AGENT],
    });

    expect(result).toBeNull();
  });

  it("devuelve null si la suspensión por impago ya venció", () => {
    const result = selectTelnyxInboundAgent(
      {
        callsSuspendedAt: null,
        paymentFailureSuspensionAt: new Date("2024-01-01"),
        agents: [AGENT],
      },
      new Date("2024-06-01")
    );

    expect(result).toBeNull();
  });

  it("ignora una suspensión por impago futura (aviso todavía no efectivo)", () => {
    const result = selectTelnyxInboundAgent(
      {
        callsSuspendedAt: null,
        paymentFailureSuspensionAt: new Date("2024-06-01"),
        agents: [AGENT],
      },
      new Date("2024-01-01")
    );

    expect(result).toEqual(AGENT);
  });

  it("devuelve null si no hay ningún agente con telnyxAssistantId", () => {
    const result = selectTelnyxInboundAgent({
      callsSuspendedAt: null,
      paymentFailureSuspensionAt: null,
      agents: [],
    });

    expect(result).toBeNull();
  });
});
