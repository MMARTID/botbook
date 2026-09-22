import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  marcarPataSinCall,
  motivoDePataSinCall,
} from "../../../src/adapters/telnyx/patasSinCall.js";

const { mockRedis } = vi.hoisted(() => ({
  mockRedis: { set: vi.fn(), get: vi.fn() },
}));

vi.mock("../../../src/lib/redis.js", () => ({
  getRedis: () => mockRedis,
}));

describe("patas sin Call (transferencia al dueño, entrante de la comprobación)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.get.mockResolvedValue(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marca la pata con su motivo y un TTL de un día, y la recupera por call_control_id", async () => {
    await marcarPataSinCall("v3:abc", "transferencia");

    expect(mockRedis.set).toHaveBeenCalledWith(
      "telnyx:pata_sin_call:v3:abc",
      "transferencia",
      "EX",
      24 * 3600
    );

    mockRedis.get.mockResolvedValue("transferencia");
    await expect(motivoDePataSinCall("v3:abc")).resolves.toBe("transferencia");
    expect(mockRedis.get).toHaveBeenCalledWith("telnyx:pata_sin_call:v3:abc");
  });

  it("sin marca (o con un valor extraño) devuelve null", async () => {
    await expect(motivoDePataSinCall("v3:nada")).resolves.toBeNull();
    mockRedis.get.mockResolvedValue("otra cosa");
    await expect(motivoDePataSinCall("v3:nada")).resolves.toBeNull();
  });

  it("si Redis falla no lanza: lo dice en el log y se comporta como si no hubiera marca", async () => {
    mockRedis.set.mockRejectedValue(new Error("Redis caído"));
    mockRedis.get.mockRejectedValue(new Error("Redis caído"));

    await expect(
      marcarPataSinCall("v3:abc", "comprobacion")
    ).resolves.toBeUndefined();
    await expect(motivoDePataSinCall("v3:abc")).resolves.toBeNull();

    expect(console.error).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("motivo=comprobacion")
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Redis caído")
    );
  });
});
