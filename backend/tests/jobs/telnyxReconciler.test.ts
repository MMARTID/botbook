import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { telnyxReconcilerJob } from "../../src/jobs/telnyxReconciler.js";
import { prisma } from "../../src/lib/prisma.js";
import { telnyxAiAdapter } from "../../src/adapters/telnyx/TelnyxAiAdapter.js";
import { syncAgentToTelnyx } from "../../src/lib/telnyxAgentSync.js";
import { sendZohoMail } from "../../src/lib/zohoMail.js";
import { refrescarPlantillasConClave } from "../../src/modules/whatsapp/service.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    agent: { findMany: vi.fn() },
    business: { findMany: vi.fn() },
  },
}));

vi.mock("../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: { getAssistant: vi.fn() },
}));

vi.mock("../../src/lib/telnyxAgentSync.js", () => ({
  syncAgentToTelnyx: vi.fn(),
}));

vi.mock("../../src/lib/zohoMail.js", () => ({
  sendZohoMail: vi.fn(),
}));

vi.mock("../../src/modules/whatsapp/service.js", () => ({
  refrescarPlantillasConClave: vi.fn(),
}));

const mockedAgentFindMany = vi.mocked(prisma.agent.findMany);
const mockedBusinessFindMany = vi.mocked(prisma.business.findMany);
const mockedGetAssistant = vi.mocked(telnyxAiAdapter.getAssistant);
const mockedSync = vi.mocked(syncAgentToTelnyx);
const mockedSendMail = vi.mocked(sendZohoMail);
const mockedRefrescarPlantillas = vi.mocked(refrescarPlantillasConClave);

const ORIGINAL_ALERT_EMAIL = process.env.TELNYX_ALERT_EMAIL;

beforeEach(() => {
  vi.clearAllMocks();
  mockedSync.mockResolvedValue(undefined);
  mockedRefrescarPlantillas.mockResolvedValue(undefined);
  mockedBusinessFindMany.mockResolvedValue([]);
  process.env.TELNYX_ALERT_EMAIL = "ops@alhabla.ai";
});

afterEach(() => {
  if (ORIGINAL_ALERT_EMAIL === undefined) delete process.env.TELNYX_ALERT_EMAIL;
  else process.env.TELNYX_ALERT_EMAIL = ORIGINAL_ALERT_EMAIL;
});

describe("telnyxReconcilerJob", () => {
  it("el reconciler llama a refrescarPlantillasConClave antes de sincronizar y un fallo suyo no aborta la reconciliación", async () => {
    mockedAgentFindMany
      .mockResolvedValueOnce([
        {
          id: "a1",
          businessId: "b1",
          telnyxAssistantId: "as1",
          telnyxSyncError: null,
        },
      ] as any)
      .mockResolvedValueOnce([
        { id: "a1", businessId: "b1", telnyxSyncError: null },
      ] as any);
    mockedGetAssistant.mockResolvedValue({
      id: "as1",
      name: "alhabla-b1-a1",
      instructions: "",
    } as any);
    mockedRefrescarPlantillas.mockRejectedValue(new Error("WABA caído"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await telnyxReconcilerJob();

    expect(mockedRefrescarPlantillas).toHaveBeenCalledTimes(1);
    expect(mockedRefrescarPlantillas.mock.invocationCallOrder[0]).toBeLessThan(
      mockedSync.mock.invocationCallOrder[0]
    );
    expect(mockedSync).toHaveBeenCalledWith("b1");
    expect(result.agentsChecked).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("refrescarPlantillasConClave")
    );
    errorSpy.mockRestore();
  });

  it("no encuentra nada que revisar y no envía correo si no hay agentes con assistant Telnyx", async () => {
    mockedAgentFindMany.mockResolvedValue([]);

    const result = await telnyxReconcilerJob();

    expect(result.agentsChecked).toBe(0);
    expect(mockedSync).not.toHaveBeenCalled();
    expect(mockedSendMail).not.toHaveBeenCalled();
  });

  it("llama a syncAgentToTelnyx una vez por negocio, no por agente", async () => {
    mockedAgentFindMany
      .mockResolvedValueOnce([
        {
          id: "agent1",
          businessId: "biz1",
          telnyxAssistantId: "asst_1",
          telnyxSyncError: null,
        },
        {
          id: "agent2",
          businessId: "biz1",
          telnyxAssistantId: "asst_2",
          telnyxSyncError: null,
        },
      ] as any)
      .mockResolvedValueOnce([
        { id: "agent1", businessId: "biz1", telnyxSyncError: null },
        { id: "agent2", businessId: "biz1", telnyxSyncError: null },
      ] as any);
    mockedGetAssistant.mockResolvedValue({
      id: "asst_1",
      name: "alhabla-biz1-agent1",
      instructions: "i",
    } as any);

    await telnyxReconcilerJob();

    expect(mockedSync).toHaveBeenCalledTimes(1);
    expect(mockedSync).toHaveBeenCalledWith("biz1");
  });

  it("cuenta un agente como resincronizado si su telnyxSyncError desaparece tras el sync", async () => {
    mockedAgentFindMany
      .mockResolvedValueOnce([
        {
          id: "agent1",
          businessId: "biz1",
          telnyxAssistantId: "asst_1",
          telnyxSyncError: "fallo previo",
        },
      ] as any)
      .mockResolvedValueOnce([
        { id: "agent1", businessId: "biz1", telnyxSyncError: null },
      ] as any);
    mockedGetAssistant.mockResolvedValue({
      id: "asst_1",
      name: "alhabla-biz1-agent1",
      instructions: "i",
    } as any);

    const result = await telnyxReconcilerJob();

    expect(result.agentsResynced).toBe(1);
    expect(result.businessesWithSyncError).toEqual([]);
  });

  it("deja constancia si el error de sincronización persiste tras el sync", async () => {
    mockedAgentFindMany
      .mockResolvedValueOnce([
        {
          id: "agent1",
          businessId: "biz1",
          telnyxAssistantId: "asst_1",
          telnyxSyncError: "fallo previo",
        },
      ] as any)
      .mockResolvedValueOnce([
        { id: "agent1", businessId: "biz1", telnyxSyncError: "sigue fallando" },
      ] as any);
    mockedGetAssistant.mockResolvedValue({
      id: "asst_1",
      name: "alhabla-biz1-agent1",
      instructions: "i",
    } as any);

    const result = await telnyxReconcilerJob();

    expect(result.agentsResynced).toBe(0);
    expect(result.businessesWithSyncError).toEqual(["biz1"]);
    expect(mockedSendMail).toHaveBeenCalled();
  });

  it("detecta un assistant que ya no existe en Telnyx", async () => {
    mockedAgentFindMany
      .mockResolvedValueOnce([
        {
          id: "agent1",
          businessId: "biz1",
          telnyxAssistantId: "asst_missing",
          telnyxSyncError: null,
        },
      ] as any)
      .mockResolvedValueOnce([
        { id: "agent1", businessId: "biz1", telnyxSyncError: null },
      ] as any);
    mockedGetAssistant.mockRejectedValue(new Error("Not found"));

    const result = await telnyxReconcilerJob();

    expect(result.assistantsMissingOnTelnyx).toHaveLength(1);
    expect(result.assistantsMissingOnTelnyx[0]).toContain("biz1/agent1");
    expect(mockedSendMail).toHaveBeenCalled();
  });

  it("detecta un assistant remoto con nombre distinto al determinista esperado", async () => {
    mockedAgentFindMany
      .mockResolvedValueOnce([
        {
          id: "agent1",
          businessId: "biz1",
          telnyxAssistantId: "asst_1",
          telnyxSyncError: null,
        },
      ] as any)
      .mockResolvedValueOnce([
        { id: "agent1", businessId: "biz1", telnyxSyncError: null },
      ] as any);
    mockedGetAssistant.mockResolvedValue({
      id: "asst_1",
      name: "otro-nombre-inesperado",
      instructions: "i",
    } as any);

    const result = await telnyxReconcilerJob();

    expect(result.assistantsWithUnexpectedName).toHaveLength(1);
    expect(mockedSendMail).toHaveBeenCalled();
  });

  it("detecta un negocio con número activo pero sin telnyxPhoneNumberId", async () => {
    mockedAgentFindMany.mockResolvedValue([]);
    mockedBusinessFindMany.mockResolvedValue([
      {
        id: "biz1",
        voiceRoutingTarget: "telnyx",
        voiceFailoverActive: false,
        telnyxPhoneNumberId: null,
        telnyxPhoneNumber: "+34930000001",
        phoneNumberStatus: "active",
      },
    ] as any);

    const result = await telnyxReconcilerJob();

    expect(result.businessesWithRoutingInconsistency).toEqual([
      "biz1: orchestrator=telnyx sin telnyxPhoneNumberId",
    ]);
  });

  it("no avisa de un negocio que aún no ha comprado número (registrado sin plan)", async () => {
    mockedAgentFindMany.mockResolvedValue([]);
    mockedBusinessFindMany.mockResolvedValue([
      {
        id: "biz_sin_numero",
        voiceRoutingTarget: "telnyx",
        voiceFailoverActive: false,
        telnyxPhoneNumberId: null,
        telnyxPhoneNumber: null,
        phoneNumberStatus: "pending",
      },
    ] as any);

    const result = await telnyxReconcilerJob();

    expect(result.businessesWithRoutingInconsistency).toEqual([]);
    expect(mockedSendMail).not.toHaveBeenCalled();
  });

  it("detecta voiceRoutingTarget desalineado con voiceFailoverActive", async () => {
    mockedAgentFindMany.mockResolvedValue([]);
    mockedBusinessFindMany.mockResolvedValue([
      {
        id: "biz1",
        voiceRoutingTarget: "telnyx",
        voiceFailoverActive: true,
        telnyxPhoneNumberId: "pn_1",
      },
    ] as any);

    const result = await telnyxReconcilerJob();

    expect(result.businessesWithRoutingInconsistency).toHaveLength(1);
  });

  it("no marca inconsistencia cuando el enrutamiento es coherente", async () => {
    mockedAgentFindMany.mockResolvedValue([]);
    mockedBusinessFindMany.mockResolvedValue([
      {
        id: "biz1",
        voiceRoutingTarget: "telnyx",
        voiceFailoverActive: false,
        telnyxPhoneNumberId: "pn_1",
      },
    ] as any);

    const result = await telnyxReconcilerJob();

    expect(result.businessesWithRoutingInconsistency).toEqual([]);
    expect(mockedSendMail).not.toHaveBeenCalled();
  });

  it("no envía correo si TELNYX_ALERT_EMAIL no está configurado, aunque haya hallazgos", async () => {
    delete process.env.TELNYX_ALERT_EMAIL;
    mockedAgentFindMany.mockResolvedValue([]);
    mockedBusinessFindMany.mockResolvedValue([
      {
        id: "biz1",
        voiceRoutingTarget: "retell",
        voiceFailoverActive: false,
        telnyxPhoneNumberId: "pn_1",
      },
    ] as any);

    await telnyxReconcilerJob();

    expect(mockedSendMail).not.toHaveBeenCalled();
  });

  it("no lanza si el envío de correo de alerta falla", async () => {
    mockedAgentFindMany.mockResolvedValue([]);
    mockedBusinessFindMany.mockResolvedValue([
      {
        id: "biz1",
        voiceRoutingTarget: "telnyx",
        voiceFailoverActive: false,
        telnyxPhoneNumberId: null,
      },
    ] as any);
    mockedSendMail.mockRejectedValue(new Error("Zoho caído"));

    await expect(telnyxReconcilerJob()).resolves.toBeDefined();
  });
});
