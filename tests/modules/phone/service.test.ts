import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  provisionPhoneNumber,
  getPhoneNumberStatus,
} from "../../../src/modules/phone/service.js";
import { prisma } from "../../../src/lib/prisma.js";
import { twilioAdapter } from "../../../src/adapters/twilio/TwilioAdapter.js";
import { vapiAdapter } from "../../../src/adapters/vapi/VapiAdapter.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../../src/adapters/twilio/TwilioAdapter.js", () => ({
  twilioAdapter: {
    searchAvailableNumbers: vi.fn(),
    purchaseNumber: vi.fn(),
  },
}));

vi.mock("../../../src/adapters/vapi/VapiAdapter.js", () => ({
  vapiAdapter: {
    createPhoneNumber: vi.fn(),
  },
}));

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedBusinessUpdate = vi.mocked(prisma.business.update);
const mockedSearchAvailableNumbers = vi.mocked(twilioAdapter.searchAvailableNumbers);
const mockedPurchaseNumber = vi.mocked(twilioAdapter.purchaseNumber);
const mockedCreatePhoneNumber = vi.mocked(vapiAdapter.createPhoneNumber);

const businessId = "biz_123";
const agentId = "agent_123";
const vapiAssistantId = "vapi_assistant_123";

describe("provisionPhoneNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "auth_token_test";
    process.env.TWILIO_SPAIN_BUNDLE_SID = "BU_test";
  });

  afterEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_SPAIN_BUNDLE_SID;
  });

  it("returns existing active number without purchasing again", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      twilioPhoneNumberStatus: "active",
      twilioPhoneNumber: "+34910000001",
      orchestrator: "vapi",
      agents: [],
    } as any);

    const result = await provisionPhoneNumber(businessId);

    expect(result.success).toBe(true);
    expect(result.phoneNumber).toBe("+34910000001");
    expect(result.status).toBe("active");
    expect(mockedSearchAvailableNumbers).not.toHaveBeenCalled();
  });

  it("purchases a number and links it to Vapi when agent exists", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      name: "Peluquería Test",
      twilioPhoneNumberStatus: "pending",
      twilioPhoneNumber: null,
      orchestrator: "vapi",
      agents: [{ id: agentId, vapiAssistantId, active: true }],
    } as any);

    mockedSearchAvailableNumbers.mockResolvedValue([
      { phoneNumber: "+34910000001", friendlyName: "Madrid" },
    ]);
    mockedPurchaseNumber.mockResolvedValue({
      sid: "PN123",
      phoneNumber: "+34910000001",
    });
    mockedCreatePhoneNumber.mockResolvedValue({
      id: "vapi_phone_123",
      number: "+34910000001",
    } as any);

    const result = await provisionPhoneNumber(businessId);

    expect(result.success).toBe(true);
    expect(result.phoneNumber).toBe("+34910000001");
    expect(result.status).toBe("active");
    expect(mockedBusinessUpdate).toHaveBeenCalledTimes(2);
    expect(mockedPurchaseNumber).toHaveBeenCalledWith("+34910000001", {
      bundleSid: "BU_test",
    });
    expect(mockedCreatePhoneNumber).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "twilio",
        number: "+34910000001",
        assistantId: vapiAssistantId,
      })
    );
  });

  it("falla con un mensaje claro si falta configurar el bundle de España", async () => {
    delete process.env.TWILIO_SPAIN_BUNDLE_SID;

    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      name: "Peluquería Test",
      twilioPhoneNumberStatus: "pending",
      twilioPhoneNumber: null,
      orchestrator: "retell",
      agents: [],
    } as any);

    const result = await provisionPhoneNumber(businessId);

    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/TWILIO_SPAIN_BUNDLE_SID/);
    expect(mockedSearchAvailableNumbers).not.toHaveBeenCalled();
  });

  it("descarta números que exigen dirección y elige uno que no la exige", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      name: "Peluquería Test",
      twilioPhoneNumberStatus: "pending",
      twilioPhoneNumber: null,
      orchestrator: "retell",
      agents: [],
    } as any);

    mockedSearchAvailableNumbers.mockResolvedValue([
      { phoneNumber: "+34910000002", friendlyName: "Bilbao", addressRequirements: "local" },
      { phoneNumber: "+34910000001", friendlyName: "Madrid", addressRequirements: "none" },
    ]);
    mockedPurchaseNumber.mockResolvedValue({
      sid: "PN123",
      phoneNumber: "+34910000001",
    });

    const result = await provisionPhoneNumber(businessId);

    expect(result.success).toBe(true);
    expect(mockedPurchaseNumber).toHaveBeenCalledWith("+34910000001", {
      bundleSid: "BU_test",
    });
  });

  it("falla con un mensaje claro si todos los números disponibles exigen dirección", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      name: "Peluquería Test",
      twilioPhoneNumberStatus: "pending",
      twilioPhoneNumber: null,
      orchestrator: "retell",
      agents: [],
    } as any);

    mockedSearchAvailableNumbers.mockResolvedValue([
      { phoneNumber: "+34910000002", friendlyName: "Bilbao", addressRequirements: "local" },
    ]);

    const result = await provisionPhoneNumber(businessId);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/dirección/);
    expect(mockedPurchaseNumber).not.toHaveBeenCalled();
  });

  it("purchases number but leaves it as purchased when no agent has vapiAssistantId", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      name: "Peluquería Test",
      twilioPhoneNumberStatus: "pending",
      twilioPhoneNumber: null,
      orchestrator: "vapi",
      agents: [{ id: agentId, vapiAssistantId: null, active: true }],
    } as any);

    mockedSearchAvailableNumbers.mockResolvedValue([
      { phoneNumber: "+34910000001", friendlyName: "Madrid" },
    ]);
    mockedPurchaseNumber.mockResolvedValue({
      sid: "PN123",
      phoneNumber: "+34910000001",
    });

    const result = await provisionPhoneNumber(businessId);

    expect(result.success).toBe(true);
    expect(result.status).toBe("purchased");
    expect(mockedCreatePhoneNumber).not.toHaveBeenCalled();
  });

  it("returns failed status when no numbers are available", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      name: "Peluquería Test",
      twilioPhoneNumberStatus: "pending",
      twilioPhoneNumber: null,
      orchestrator: "vapi",
      agents: [],
    } as any);

    mockedSearchAvailableNumbers.mockResolvedValue([]);

    const result = await provisionPhoneNumber(businessId);

    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(mockedBusinessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ twilioPhoneNumberStatus: "failed" }),
      })
    );
  });

  it("returns failed status on unexpected error and updates DB", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      name: "Peluquería Test",
      twilioPhoneNumberStatus: "pending",
      twilioPhoneNumber: null,
      orchestrator: "vapi",
      agents: [],
    } as any);

    mockedSearchAvailableNumbers.mockRejectedValue(new Error("Twilio down"));

    const result = await provisionPhoneNumber(businessId);

    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
  });
});

describe("getPhoneNumberStatus", () => {
  it("returns phone number info for a business", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      twilioPhoneNumber: "+34910000001",
      twilioPhoneNumberSid: "PN123",
      twilioPhoneNumberPurchasedAt: new Date("2024-01-01"),
      twilioPhoneNumberStatus: "active",
      vapiPhoneNumberId: "vapi_phone_123",
      retellPhoneNumberId: null,
      orchestrator: "vapi",
    } as any);

    const result = await getPhoneNumberStatus(businessId);

    expect(result).toEqual({
      phoneNumber: "+34910000001",
      sid: "PN123",
      purchasedAt: expect.any(Date),
      status: "active",
      orchestrator: "vapi",
      vapiPhoneNumberId: "vapi_phone_123",
      retellPhoneNumberId: null,
    });
  });

  it("returns null when business is not found", async () => {
    mockedBusinessFindUnique.mockResolvedValue(null);

    const result = await getPhoneNumberStatus(businessId);

    expect(result).toBeNull();
  });
});
