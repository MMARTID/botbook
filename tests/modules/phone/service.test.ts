import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  provisionPhoneNumber,
  getPhoneNumberStatus,
} from "../../../src/modules/phone/service.js";
import { prisma } from "../../../src/lib/prisma.js";
import { telnyxAdapter } from "../../../src/adapters/telnyx/TelnyxAdapter.js";
import { retellAdapter } from "../../../src/adapters/retell/RetellAdapter.js";
import { vapiAdapter } from "../../../src/adapters/vapi/VapiAdapter.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../../src/adapters/telnyx/TelnyxAdapter.js", () => ({
  telnyxAdapter: {
    searchAvailableNumbers: vi.fn(),
    purchaseNumber: vi.fn(),
    getNumberOrder: vi.fn(),
  },
}));

vi.mock("../../../src/adapters/retell/RetellAdapter.js", () => ({
  retellAdapter: {
    importPhoneNumber: vi.fn(),
  },
}));

vi.mock("../../../src/adapters/vapi/VapiAdapter.js", () => ({
  vapiAdapter: {
    createPhoneNumber: vi.fn(),
  },
}));

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedBusinessUpdate = vi.mocked(prisma.business.update);
const mockedSearchAvailableNumbers = vi.mocked(telnyxAdapter.searchAvailableNumbers);
const mockedPurchaseNumber = vi.mocked(telnyxAdapter.purchaseNumber);
const mockedGetNumberOrder = vi.mocked(telnyxAdapter.getNumberOrder);
const mockedImportPhoneNumber = vi.mocked(retellAdapter.importPhoneNumber);
const mockedCreatePhoneNumber = vi.mocked(vapiAdapter.createPhoneNumber);

const businessId = "biz_123";
const agentId = "agent_123";
const retellAgentId = "retell_agent_123";
const vapiAssistantId = "vapi_assistant_123";

describe("provisionPhoneNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELNYX_SPAIN_REQUIREMENT_GROUP_ID = "req_group_test";
    process.env.TELNYX_SIP_CONNECTION_ID = "conn_test";
    process.env.RETELL_SIP_TERMINATION_URI = "botbook-inbound.sip.telnyx.com";
    process.env.RETELL_SIP_TRUNK_AUTH_USERNAME = "botbookadmin";
    process.env.RETELL_SIP_TRUNK_AUTH_PASSWORD = "secret";
  });

  afterEach(() => {
    delete process.env.TELNYX_SPAIN_REQUIREMENT_GROUP_ID;
    delete process.env.TELNYX_SIP_CONNECTION_ID;
    delete process.env.RETELL_SIP_TERMINATION_URI;
    delete process.env.RETELL_SIP_TRUNK_AUTH_USERNAME;
    delete process.env.RETELL_SIP_TRUNK_AUTH_PASSWORD;
    vi.useRealTimers();
  });

  it("returns existing active number without purchasing again", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      twilioPhoneNumberStatus: "active",
      telnyxPhoneNumber: "+34886020712",
      twilioPhoneNumber: null,
      orchestrator: "retell",
      agents: [],
    } as any);

    const result = await provisionPhoneNumber(businessId);

    expect(result.success).toBe(true);
    expect(result.phoneNumber).toBe("+34886020712");
    expect(result.status).toBe("active");
    expect(mockedSearchAvailableNumbers).not.toHaveBeenCalled();
  });

  it("compra un número, lo importa en Retell y lo vincula al agente", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      name: "Peluquería Test",
      twilioPhoneNumberStatus: "pending",
      telnyxPhoneNumber: null,
      telnyxNumberOrderId: null,
      orchestrator: "retell",
      agents: [{ id: agentId, retellAgentId, active: true }],
    } as any);

    mockedSearchAvailableNumbers.mockResolvedValue([
      { phoneNumber: "+34886020712", region: "PONTEVEDRA" },
    ]);
    mockedPurchaseNumber.mockResolvedValue({
      orderId: "order_123",
      status: "success",
      phoneNumber: "+34886020712",
      phoneNumberId: "pn_123",
    });
    mockedImportPhoneNumber.mockResolvedValue({
      phone_number_id: "phone_123",
      phone_number: "+34886020712",
    } as any);

    const result = await provisionPhoneNumber(businessId);

    expect(result.success).toBe(true);
    expect(result.phoneNumber).toBe("+34886020712");
    expect(result.status).toBe("active");
    expect(mockedPurchaseNumber).toHaveBeenCalledWith("+34886020712", {
      requirementGroupId: "req_group_test",
      connectionId: "conn_test",
    });
    expect(mockedImportPhoneNumber).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumber: "+34886020712",
        terminationUri: "botbook-inbound.sip.telnyx.com",
        sipTrunkAuthUsername: "botbookadmin",
        sipTrunkAuthPassword: "secret",
        inboundAgentId: retellAgentId,
      })
    );
    expect(mockedBusinessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ twilioPhoneNumberStatus: "active" }),
      })
    );
  });

  it("falla con un mensaje claro si falta configurar el Requirement Group de España", async () => {
    delete process.env.TELNYX_SPAIN_REQUIREMENT_GROUP_ID;

    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      name: "Peluquería Test",
      twilioPhoneNumberStatus: "pending",
      telnyxPhoneNumber: null,
      orchestrator: "retell",
      agents: [],
    } as any);

    const result = await provisionPhoneNumber(businessId);

    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/TELNYX_SPAIN_REQUIREMENT_GROUP_ID/);
    expect(mockedSearchAvailableNumbers).not.toHaveBeenCalled();
  });

  it("purchases number but leaves it as purchased when no agent has retellAgentId", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      name: "Peluquería Test",
      twilioPhoneNumberStatus: "pending",
      telnyxPhoneNumber: null,
      orchestrator: "retell",
      agents: [],
    } as any);

    mockedSearchAvailableNumbers.mockResolvedValue([
      { phoneNumber: "+34886020712" },
    ]);
    mockedPurchaseNumber.mockResolvedValue({
      orderId: "order_123",
      status: "success",
      phoneNumber: "+34886020712",
      phoneNumberId: "pn_123",
    });

    const result = await provisionPhoneNumber(businessId);

    expect(result.success).toBe(true);
    expect(result.status).toBe("purchased");
    expect(mockedImportPhoneNumber).not.toHaveBeenCalled();
  });

  it("returns failed status when no numbers are available", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      name: "Peluquería Test",
      twilioPhoneNumberStatus: "pending",
      telnyxPhoneNumber: null,
      orchestrator: "retell",
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
      telnyxPhoneNumber: null,
      orchestrator: "retell",
      agents: [],
    } as any);

    mockedSearchAvailableNumbers.mockRejectedValue(new Error("Telnyx down"));

    const result = await provisionPhoneNumber(businessId);

    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
  });

  it("marca el pedido como 'failure' de Telnyx como fallo claro", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      name: "Peluquería Test",
      twilioPhoneNumberStatus: "pending",
      telnyxPhoneNumber: null,
      orchestrator: "retell",
      agents: [],
    } as any);

    mockedSearchAvailableNumbers.mockResolvedValue([
      { phoneNumber: "+34886020712" },
    ]);
    mockedPurchaseNumber.mockResolvedValue({
      orderId: "order_123",
      status: "failure",
      phoneNumber: "+34886020712",
    });

    const result = await provisionPhoneNumber(businessId);

    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
  });

  it("deja el pedido en 'pending' si Telnyx sigue revisando los requisitos tras el margen de espera, sin dar error genérico", async () => {
    vi.useFakeTimers();

    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      name: "Peluquería Test",
      twilioPhoneNumberStatus: "pending",
      telnyxPhoneNumber: null,
      orchestrator: "retell",
      agents: [],
    } as any);

    mockedSearchAvailableNumbers.mockResolvedValue([
      { phoneNumber: "+34886020712" },
    ]);
    mockedPurchaseNumber.mockResolvedValue({
      orderId: "order_123",
      status: "pending",
      phoneNumber: "+34886020712",
    });
    mockedGetNumberOrder.mockResolvedValue({
      orderId: "order_123",
      status: "pending",
      phoneNumber: "+34886020712",
    });

    const resultPromise = provisionPhoneNumber(businessId);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.status).toBe("pending");
    expect(mockedBusinessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ telnyxNumberOrderId: "order_123" }),
      })
    );
    expect(mockedImportPhoneNumber).not.toHaveBeenCalled();
  });

  it("reanuda un pedido ya en curso (telnyxNumberOrderId) en vez de comprar un número nuevo", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      name: "Peluquería Test",
      twilioPhoneNumberStatus: "pending",
      telnyxPhoneNumber: null,
      telnyxNumberOrderId: "order_456",
      orchestrator: "retell",
      agents: [{ id: agentId, retellAgentId, active: true }],
    } as any);

    mockedGetNumberOrder.mockResolvedValue({
      orderId: "order_456",
      status: "success",
      phoneNumber: "+34886020712",
      phoneNumberId: "pn_456",
    });
    mockedImportPhoneNumber.mockResolvedValue({
      phone_number_id: "phone_456",
      phone_number: "+34886020712",
    } as any);

    const result = await provisionPhoneNumber(businessId);

    expect(result.success).toBe(true);
    expect(result.status).toBe("active");
    expect(mockedSearchAvailableNumbers).not.toHaveBeenCalled();
    expect(mockedPurchaseNumber).not.toHaveBeenCalled();
    expect(mockedGetNumberOrder).toHaveBeenCalledWith("order_456");
  });
});

describe("getPhoneNumberStatus", () => {
  it("returns phone number info for a business, sourcing from Telnyx fields", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      telnyxPhoneNumber: "+34886020712",
      telnyxPhoneNumberId: "pn_123",
      telnyxPhoneNumberPurchasedAt: new Date("2024-01-01"),
      twilioPhoneNumber: null,
      twilioPhoneNumberSid: null,
      twilioPhoneNumberPurchasedAt: null,
      twilioPhoneNumberStatus: "active",
      vapiPhoneNumberId: null,
      retellPhoneNumberId: null,
      orchestrator: "retell",
    } as any);

    const result = await getPhoneNumberStatus(businessId);

    expect(result).toEqual({
      phoneNumber: "+34886020712",
      sid: "pn_123",
      purchasedAt: expect.any(Date),
      status: "active",
      orchestrator: "retell",
      vapiPhoneNumberId: null,
      retellPhoneNumberId: null,
    });
  });

  it("cae en los campos de Twilio para negocios antiguos sin número de Telnyx", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: businessId,
      telnyxPhoneNumber: null,
      telnyxPhoneNumberId: null,
      telnyxPhoneNumberPurchasedAt: null,
      twilioPhoneNumber: "+34910000001",
      twilioPhoneNumberSid: "PN123",
      twilioPhoneNumberPurchasedAt: new Date("2024-01-01"),
      twilioPhoneNumberStatus: "active",
      vapiPhoneNumberId: null,
      retellPhoneNumberId: "phone_123",
      orchestrator: "vapi",
    } as any);

    const result = await getPhoneNumberStatus(businessId);

    expect(result?.phoneNumber).toBe("+34910000001");
    expect(result?.sid).toBe("PN123");
  });

  it("returns null when business is not found", async () => {
    mockedBusinessFindUnique.mockResolvedValue(null);

    const result = await getPhoneNumberStatus(businessId);

    expect(result).toBeNull();
  });
});
