import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { repointTelnyxPhoneNumber } from "../../src/lib/voiceRouting.js";
import { acquireLock, releaseLock } from "../../src/lib/bookingLock.js";
import { telnyxAiAdapter } from "../../src/adapters/telnyx/TelnyxAiAdapter.js";

vi.mock("../../src/lib/bookingLock.js", () => ({
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
}));

vi.mock("../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: { setPhoneNumberConnectionId: vi.fn() },
}));

const mockedAcquireLock = vi.mocked(acquireLock);
const mockedReleaseLock = vi.mocked(releaseLock);
const mockedSetConnectionId = vi.mocked(telnyxAiAdapter.setPhoneNumberConnectionId);

const ORIGINAL_ENV = {
  TELNYX_CALL_CONTROL_APP_ID: process.env.TELNYX_CALL_CONTROL_APP_ID,
  TELNYX_SIP_CONNECTION_ID: process.env.TELNYX_SIP_CONNECTION_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedAcquireLock.mockResolvedValue("lock-token");
  process.env.TELNYX_CALL_CONTROL_APP_ID = "cca_platform_1";
  process.env.TELNYX_SIP_CONNECTION_ID = "conn_retell_1";
});

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("repointTelnyxPhoneNumber", () => {
  it("repunta al Call Control App cuando el destino es telnyx", async () => {
    const result = await repointTelnyxPhoneNumber("biz1", "pn_1", "telnyx");

    expect(result).toEqual({ success: true });
    expect(mockedSetConnectionId).toHaveBeenCalledWith("pn_1", "cca_platform_1");
    expect(mockedReleaseLock).toHaveBeenCalledWith(
      "phone_provision_lock:biz1",
      "lock-token"
    );
  });

  it("repunta al SIP trunk de Retell cuando el destino es retell", async () => {
    const result = await repointTelnyxPhoneNumber("biz1", "pn_1", "retell");

    expect(result).toEqual({ success: true });
    expect(mockedSetConnectionId).toHaveBeenCalledWith("pn_1", "conn_retell_1");
  });

  it("falla sin llamar a Telnyx si falta la variable de entorno del destino", async () => {
    delete process.env.TELNYX_SIP_CONNECTION_ID;

    const result = await repointTelnyxPhoneNumber("biz1", "pn_1", "retell");

    expect(result.success).toBe(false);
    expect(mockedAcquireLock).not.toHaveBeenCalled();
    expect(mockedSetConnectionId).not.toHaveBeenCalled();
  });

  it("falla sin lanzar si no consigue el lock", async () => {
    mockedAcquireLock.mockResolvedValue(null);

    const result = await repointTelnyxPhoneNumber("biz1", "pn_1", "telnyx");

    expect(result.success).toBe(false);
    expect(mockedSetConnectionId).not.toHaveBeenCalled();
  });

  it("libera el lock incluso si la llamada a Telnyx falla, y devuelve el error", async () => {
    mockedSetConnectionId.mockRejectedValue(new Error("Telnyx 500"));

    const result = await repointTelnyxPhoneNumber("biz1", "pn_1", "telnyx");

    expect(result).toEqual({ success: false, error: "Telnyx 500" });
    expect(mockedReleaseLock).toHaveBeenCalledWith(
      "phone_provision_lock:biz1",
      "lock-token"
    );
  });
});
