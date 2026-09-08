import { describe, expect, it } from "vitest";
import { selectRetellInboundAgent } from "../../../src/modules/phone/retellInbound.js";

const now = new Date("2026-09-15T10:00:00.000Z");
const activeBusiness = {
  callsSuspendedAt: null,
  paymentFailureSuspensionAt: new Date("2026-09-16T10:00:00.000Z"),
  agents: [{ retellAgentId: "agent_123" }],
};

describe("selectRetellInboundAgent", () => {
  it("elige el agente mientras el plazo de pago sigue vigente", () => {
    expect(selectRetellInboundAgent(activeBusiness, now)).toBe("agent_123");
  });

  it("rechaza la llamada desde el instante en que vence el séptimo día", () => {
    expect(
      selectRetellInboundAgent(
        { ...activeBusiness, paymentFailureSuspensionAt: now },
        now
      )
    ).toBeNull();
  });

  it("mantiene el rechazo después de que el job deje la marca de suspensión", () => {
    expect(
      selectRetellInboundAgent(
        { ...activeBusiness, callsSuspendedAt: new Date("2026-09-15T10:00:01.000Z") },
        now
      )
    ).toBeNull();
  });
});
