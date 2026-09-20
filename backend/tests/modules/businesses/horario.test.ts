import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { invalidarCacheDeVoz } from "../../../src/lib/voiceConfigCache.js";
import { syncAgentToRetell } from "../../../src/lib/agentBootstrap.js";
import { syncAgentToTelnyx } from "../../../src/lib/telnyxAgentSync.js";
import { calendarService } from "../../../src/modules/calendar/service.js";
import { DEFAULT_BUSINESS_SCHEDULE } from "../../../src/lib/businessSchedule.js";
import { guardarHorarioDelNegocio } from "../../../src/modules/businesses/horario.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: { business: { update: vi.fn() } },
}));
vi.mock("../../../src/lib/voiceConfigCache.js", () => ({
  invalidarCacheDeVoz: vi.fn(),
}));
vi.mock("../../../src/lib/agentBootstrap.js", () => ({
  syncAgentToRetell: vi.fn(),
}));
vi.mock("../../../src/lib/telnyxAgentSync.js", () => ({
  syncAgentToTelnyx: vi.fn(),
}));
vi.mock("../../../src/modules/calendar/service.js", () => ({
  calendarService: { syncCalendarToolsToAgents: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(prisma.business.update).mockResolvedValue({} as never);
});

describe("guardarHorarioDelNegocio", () => {
  it("guarda, invalida la caché de voz y sincroniza recepcionista y tools de calendario, en ese orden", async () => {
    const orden: string[] = [];
    vi.mocked(prisma.business.update).mockImplementation((async () => {
      orden.push("update");
      return {};
    }) as never);
    vi.mocked(invalidarCacheDeVoz).mockImplementation(async () => {
      orden.push("cache");
    });
    vi.mocked(syncAgentToRetell).mockImplementation(async () => {
      orden.push("retell");
    });
    vi.mocked(syncAgentToTelnyx).mockImplementation(async () => {
      orden.push("telnyx");
    });
    vi.mocked(calendarService.syncCalendarToolsToAgents).mockImplementation(
      async () => {
        orden.push("tools");
      }
    );

    const r = await guardarHorarioDelNegocio(
      "biz_1",
      DEFAULT_BUSINESS_SCHEDULE
    );

    expect(r).toEqual({ sincronizado: true });
    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: { schedule: DEFAULT_BUSINESS_SCHEDULE },
    });
    expect(orden).toEqual(["update", "cache", "telnyx", "retell", "tools"]);
  });

  it("si la sincronización lanza, el horario ya está guardado: no lanza, lo registra y devuelve sincronizado false", async () => {
    vi.mocked(syncAgentToRetell).mockRejectedValueOnce(
      new Error("Retell caído")
    );
    const r = await guardarHorarioDelNegocio(
      "biz_1",
      DEFAULT_BUSINESS_SCHEDULE
    );
    expect(r).toEqual({ sincronizado: false });
    expect(invalidarCacheDeVoz).toHaveBeenCalledWith("biz_1");
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("no se pudo sincronizar")
    );
  });

  it("si el update falla, lanza y no sincroniza nada", async () => {
    vi.mocked(prisma.business.update).mockRejectedValueOnce(new Error("bd"));
    await expect(
      guardarHorarioDelNegocio("biz_1", DEFAULT_BUSINESS_SCHEDULE)
    ).rejects.toThrow("bd");
    expect(syncAgentToRetell).not.toHaveBeenCalled();
  });
});
