import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { telnyxHealthCheckJob } from "../../src/jobs/telnyxHealthCheck.js";
import { prisma } from "../../src/lib/prisma.js";
import { getRedis } from "../../src/lib/redis.js";
import { acquireLock, releaseLock } from "../../src/lib/bookingLock.js";
import { checkTelnyxAiInfraStatus } from "../../src/lib/telnyxStatusPage.js";
import { telnyxAiAdapter } from "../../src/adapters/telnyx/TelnyxAiAdapter.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findMany: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../src/lib/redis.js", () => ({
  getRedis: vi.fn(),
}));

vi.mock("../../src/lib/bookingLock.js", () => ({
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
}));

vi.mock("../../src/lib/telnyxStatusPage.js", () => ({
  checkTelnyxAiInfraStatus: vi.fn(),
}));

vi.mock("../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: { setPhoneNumberConnectionId: vi.fn() },
}));

const mockedBusinessFindMany = vi.mocked(prisma.business.findMany);
const mockedBusinessUpdate = vi.mocked(prisma.business.update);
const mockedGetRedis = vi.mocked(getRedis);
const mockedAcquireLock = vi.mocked(acquireLock);
const mockedReleaseLock = vi.mocked(releaseLock);
const mockedCheckStatus = vi.mocked(checkTelnyxAiInfraStatus);
const mockedSetConnectionId = vi.mocked(telnyxAiAdapter.setPhoneNumberConnectionId);

const mockRedisClient = { incr: vi.fn(), del: vi.fn() };

const ORIGINAL_ENV = {
  VOICE_FAILOVER_ENABLED: process.env.VOICE_FAILOVER_ENABLED,
  TELNYX_CALL_CONTROL_APP_ID: process.env.TELNYX_CALL_CONTROL_APP_ID,
  TELNYX_SIP_CONNECTION_ID: process.env.TELNYX_SIP_CONNECTION_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetRedis.mockReturnValue(mockRedisClient as any);
  mockedAcquireLock.mockResolvedValue("lock-token");
  process.env.VOICE_FAILOVER_ENABLED = "true";
  process.env.TELNYX_CALL_CONTROL_APP_ID = "cca_platform_1";
  process.env.TELNYX_SIP_CONNECTION_ID = "conn_retell_1";
});

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("telnyxHealthCheckJob", () => {
  it("no hace nada si VOICE_FAILOVER_ENABLED no está activo (kill switch)", async () => {
    delete process.env.VOICE_FAILOVER_ENABLED;

    await telnyxHealthCheckJob();

    expect(mockedCheckStatus).not.toHaveBeenCalled();
  });

  it("no hace nada si TELNYX_STATUS_COMPONENT_IDS no está configurado", async () => {
    mockedCheckStatus.mockResolvedValue({
      healthy: false,
      unconfigured: true,
      components: [],
    });

    await telnyxHealthCheckJob();

    expect(mockedGetRedis).not.toHaveBeenCalled();
    expect(mockedBusinessFindMany).not.toHaveBeenCalled();
  });

  it("no lanza y no evalúa nada si falla la consulta del status page", async () => {
    mockedCheckStatus.mockRejectedValue(new Error("network down"));

    await expect(telnyxHealthCheckJob()).resolves.toBeUndefined();
    expect(mockedGetRedis).not.toHaveBeenCalled();
  });

  it("con lectura sana, incrementa la racha buena y limpia la mala sin llegar al umbral de failback", async () => {
    mockedCheckStatus.mockResolvedValue({
      healthy: true,
      unconfigured: false,
      components: [],
    });
    mockRedisClient.incr.mockResolvedValue(3);

    await telnyxHealthCheckJob();

    expect(mockRedisClient.incr).toHaveBeenCalledWith("telnyx_health:consecutive_good");
    expect(mockRedisClient.del).toHaveBeenCalledWith("telnyx_health:consecutive_bad");
    expect(mockedBusinessFindMany).not.toHaveBeenCalled();
  });

  it("activa el failover a Retell tras 2 lecturas malas consecutivas", async () => {
    mockedCheckStatus.mockResolvedValue({
      healthy: false,
      unconfigured: false,
      components: [{ id: "comp_1", name: "AI", status: "major_outage" }],
    });
    mockRedisClient.incr.mockResolvedValue(2);
    mockedBusinessFindMany.mockResolvedValue([
      { id: "biz1", telnyxPhoneNumberId: "pn_1" },
    ] as any);
    mockedBusinessUpdate.mockResolvedValue({} as any);

    await telnyxHealthCheckJob();

    expect(mockedBusinessFindMany).toHaveBeenCalledWith({
      where: {
        orchestrator: "telnyx",
        voiceRoutingTarget: "telnyx",
        telnyxPhoneNumberId: { not: null },
      },
      select: { id: true, telnyxPhoneNumberId: true },
    });
    expect(mockedSetConnectionId).toHaveBeenCalledWith("pn_1", "conn_retell_1");
    expect(mockedBusinessUpdate).toHaveBeenCalledWith({
      where: { id: "biz1" },
      data: expect.objectContaining({
        voiceRoutingTarget: "retell",
        voiceFailoverActive: true,
      }),
    });
    expect(mockedReleaseLock).toHaveBeenCalledWith(
      "phone_provision_lock:biz1",
      "lock-token"
    );
  });

  it("no activa el failover con solo 1 lectura mala (por debajo del umbral)", async () => {
    mockedCheckStatus.mockResolvedValue({
      healthy: false,
      unconfigured: false,
      components: [],
    });
    mockRedisClient.incr.mockResolvedValue(1);

    await telnyxHealthCheckJob();

    expect(mockedBusinessFindMany).not.toHaveBeenCalled();
  });

  it("hace failback a Telnyx tras 5 lecturas buenas consecutivas", async () => {
    mockedCheckStatus.mockResolvedValue({
      healthy: true,
      unconfigured: false,
      components: [],
    });
    mockRedisClient.incr.mockResolvedValue(5);
    mockedBusinessFindMany.mockResolvedValue([
      { id: "biz1", telnyxPhoneNumberId: "pn_1" },
    ] as any);
    mockedBusinessUpdate.mockResolvedValue({} as any);

    await telnyxHealthCheckJob();

    expect(mockedSetConnectionId).toHaveBeenCalledWith("pn_1", "cca_platform_1");
    expect(mockedBusinessUpdate).toHaveBeenCalledWith({
      where: { id: "biz1" },
      data: expect.objectContaining({
        voiceRoutingTarget: "telnyx",
        voiceFailoverActive: false,
        voiceFailoverReason: null,
      }),
    });
  });

  it("no cambia ningún negocio si no hay ninguno en orchestrator=telnyx", async () => {
    mockedCheckStatus.mockResolvedValue({
      healthy: false,
      unconfigured: false,
      components: [],
    });
    mockRedisClient.incr.mockResolvedValue(2);
    mockedBusinessFindMany.mockResolvedValue([]);

    await telnyxHealthCheckJob();

    expect(mockedAcquireLock).not.toHaveBeenCalled();
    expect(mockedSetConnectionId).not.toHaveBeenCalled();
  });

  it("salta un negocio sin bloquearlo y sigue sin lanzar si no consigue el lock", async () => {
    mockedCheckStatus.mockResolvedValue({
      healthy: false,
      unconfigured: false,
      components: [],
    });
    mockRedisClient.incr.mockResolvedValue(2);
    mockedBusinessFindMany.mockResolvedValue([
      { id: "biz1", telnyxPhoneNumberId: "pn_1" },
    ] as any);
    mockedAcquireLock.mockResolvedValue(null);

    await expect(telnyxHealthCheckJob()).resolves.toBeUndefined();

    expect(mockedSetConnectionId).not.toHaveBeenCalled();
  });

  it("no cambia ningún negocio si falta la variable de entorno del connection_id de destino", async () => {
    delete process.env.TELNYX_SIP_CONNECTION_ID;
    mockedCheckStatus.mockResolvedValue({
      healthy: false,
      unconfigured: false,
      components: [],
    });
    mockRedisClient.incr.mockResolvedValue(2);
    mockedBusinessFindMany.mockResolvedValue([
      { id: "biz1", telnyxPhoneNumberId: "pn_1" },
    ] as any);

    await telnyxHealthCheckJob();

    expect(mockedAcquireLock).not.toHaveBeenCalled();
    expect(mockedSetConnectionId).not.toHaveBeenCalled();
  });
});
