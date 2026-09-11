import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkTelnyxAiInfraStatus } from "../../src/lib/telnyxStatusPage.js";

const originalFetch = global.fetch;
const originalEnv = process.env.TELNYX_STATUS_COMPONENT_IDS;

beforeEach(() => {
  global.fetch = vi.fn() as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalEnv === undefined) {
    delete process.env.TELNYX_STATUS_COMPONENT_IDS;
  } else {
    process.env.TELNYX_STATUS_COMPONENT_IDS = originalEnv;
  }
});

describe("checkTelnyxAiInfraStatus", () => {
  it("es 'no evaluable' si no hay componentes configurados, sin llamar al status page", async () => {
    delete process.env.TELNYX_STATUS_COMPONENT_IDS;

    const result = await checkTelnyxAiInfraStatus();

    expect(result).toEqual({ healthy: false, unconfigured: true, components: [] });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("es sano si todos los componentes configurados están operational", async () => {
    process.env.TELNYX_STATUS_COMPONENT_IDS = "comp_1, comp_2";
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        components: [
          { id: "comp_1", name: "A", status: "operational" },
          { id: "comp_2", name: "B", status: "operational" },
          { id: "comp_3", name: "Sin vigilar", status: "major_outage" },
        ],
      }),
    });

    const result = await checkTelnyxAiInfraStatus();

    expect(result.healthy).toBe(true);
    expect(result.unconfigured).toBe(false);
    expect(result.components).toHaveLength(2);
  });

  it("es degradado si algún componente configurado no está operational", async () => {
    process.env.TELNYX_STATUS_COMPONENT_IDS = "comp_1";
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        components: [{ id: "comp_1", name: "A", status: "partial_outage" }],
      }),
    });

    const result = await checkTelnyxAiInfraStatus();

    expect(result.healthy).toBe(false);
  });

  it("es degradado si ninguno de los componentes configurados aparece en la respuesta", async () => {
    process.env.TELNYX_STATUS_COMPONENT_IDS = "comp_inexistente";
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        components: [{ id: "comp_1", name: "A", status: "operational" }],
      }),
    });

    const result = await checkTelnyxAiInfraStatus();

    expect(result.healthy).toBe(false);
    expect(result.components).toHaveLength(0);
  });

  it("lanza si el status page responde con error HTTP", async () => {
    process.env.TELNYX_STATUS_COMPONENT_IDS = "comp_1";
    (global.fetch as any).mockResolvedValue({ ok: false, status: 503 });

    await expect(checkTelnyxAiInfraStatus()).rejects.toThrow("503");
  });
});
