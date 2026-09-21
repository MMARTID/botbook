import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createTelnyxAssistantForAgent,
  promptManualConSuRegla,
  syncAgentToTelnyx,
} from "../../src/lib/telnyxAgentSync.js";
import { prisma } from "../../src/lib/prisma.js";
import { telnyxAiAdapter } from "../../src/adapters/telnyx/TelnyxAiAdapter.js";
import { DEFAULT_AGENT_SETTINGS } from "../../src/lib/managedAgentPrompt.js";
import { listaDeEsperaDisponible } from "../../src/modules/whatsapp/service.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    service: { findMany: vi.fn() },
    professional: { findMany: vi.fn() },
    agent: { findMany: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: {
    createAssistant: vi.fn(),
    updateAssistant: vi.fn(),
    listVoices: vi.fn(),
  },
}));

// Gate de la frase de la lista de espera en el prompt (PR 4): por defecto
// aprobada, para que la salida de estos tests no cambie.
vi.mock("../../src/modules/whatsapp/service.js", () => ({
  listaDeEsperaDisponible: vi.fn().mockResolvedValue(true),
}));

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedServiceFindMany = vi.mocked(prisma.service.findMany);
const mockedProfessionalFindMany = vi.mocked(prisma.professional.findMany);
const mockedAgentFindMany = vi.mocked(prisma.agent.findMany);
const mockedAgentUpdate = vi.mocked(prisma.agent.update);
const mockedCreateAssistant = vi.mocked(telnyxAiAdapter.createAssistant);
const mockedUpdateAssistant = vi.mocked(telnyxAiAdapter.updateAssistant);
const mockedListVoices = vi.mocked(telnyxAiAdapter.listVoices);

const ELIGIBLE_VOICES = [
  { id: "Telnyx.Ultra.isabel", language: "es-ES", gender: "Female" },
];

const BASE_BUSINESS = {
  name: "Peluquería Ejemplo",
  businessDetails: null,
  businessType: "peluqueria",
  agentSettings: null,
  minAdvanceBookingMinutes: null,
  maxAppointmentDurationMinutes: null,
};

// Alhabla como número principal con móvil del dueño (fase 4): la
// transferencia se activa sola («si el cliente lo pide»).
const NUMERO_DE_ALHABLA = "+34930453218";
const MOVIL_DEL_DUENO = "+34600111222";
const BUSINESS_PRINCIPAL = {
  ...BASE_BUSINESS,
  customerLineType: "alhabla",
  phone: NUMERO_DE_ALHABLA,
  telnyxPhoneNumber: NUMERO_DE_ALHABLA,
  ownerWhatsappNumber: MOVIL_DEL_DUENO,
  ownerPhoneIsCustomerLine: false,
};
const TOOL_TRANSFER_ESPERADA = {
  type: "transfer",
  transfer: {
    from: NUMERO_DE_ALHABLA,
    targets: [{ name: "Responsable del negocio", to: MOVIL_DEL_DUENO }],
    warm_transfer_instructions: expect.stringContaining(
      "recepcionista de Peluquería Ejemplo"
    ),
    voicemail_detection: {
      detection_mode: "premium",
      on_voicemail_detected: { action: "stop_transfer" },
    },
  },
};

function agenteSincronizable() {
  return [
    {
      id: "agent1",
      telnyxAssistantId: "assistant_1",
      telnyxConfigHash: "hash-vieja",
      systemPrompt: "prompt guardado",
      promptManuallyEdited: false,
    },
  ] as any;
}

const mockedListaDeEspera = vi.mocked(listaDeEsperaDisponible);

beforeEach(() => {
  vi.clearAllMocks();
  mockedServiceFindMany.mockResolvedValue([]);
  mockedProfessionalFindMany.mockResolvedValue([]);
  mockedListVoices.mockResolvedValue(ELIGIBLE_VOICES);
  mockedListaDeEspera.mockResolvedValue(true);
});

describe("createTelnyxAssistantForAgent", () => {
  it("pasa listaDeEspera al prompt según listaDeEsperaDisponible (true con hueco_libre aprobada, false si no)", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BASE_BUSINESS as any);
    mockedCreateAssistant.mockResolvedValue({
      id: "assistant_1",
      name: "alhabla-biz1-agent1",
      instructions: "i",
    });

    await createTelnyxAssistantForAgent({
      agentId: "agent1",
      businessId: "biz1",
    });
    const conOferta = mockedCreateAssistant.mock.calls[0][0].instructions;
    expect(conOferta).toContain("te aviso por WhatsApp si se libera esa hora");

    mockedListaDeEspera.mockResolvedValue(false);
    await createTelnyxAssistantForAgent({
      agentId: "agent1",
      businessId: "biz1",
    });
    const sinOferta = mockedCreateAssistant.mock.calls[1][0].instructions;
    expect(sinOferta).not.toContain("te aviso por WhatsApp");
    expect(sinOferta).toContain("no uses notify_when_available");
    expect(mockedListaDeEspera).toHaveBeenCalledTimes(2);
  });

  it("crea el assistant y persiste su id cuando el negocio es elegible", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BASE_BUSINESS as any);
    mockedCreateAssistant.mockResolvedValue({
      id: "assistant_1",
      name: "alhabla-biz1-agent1",
      instructions: "i",
    });

    const result = await createTelnyxAssistantForAgent({
      agentId: "agent1",
      businessId: "biz1",
    });

    expect(result).toEqual({ eligible: true, reason: null });
    expect(mockedCreateAssistant).toHaveBeenCalledTimes(1);
    expect(mockedAgentUpdate).toHaveBeenCalledWith({
      where: { id: "agent1" },
      data: expect.objectContaining({
        telnyxAssistantId: "assistant_1",
        telnyxSyncError: null,
      }),
    });
  });

  it("no crea nada si el negocio no es elegible (catalán)", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      ...BASE_BUSINESS,
      agentSettings: {
        ...DEFAULT_AGENT_SETTINGS,
        languages: ["es-ES", "ca-ES"],
      },
    } as any);

    const result = await createTelnyxAssistantForAgent({
      agentId: "agent1",
      businessId: "biz1",
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/catal/i);
    expect(mockedCreateAssistant).not.toHaveBeenCalled();
    expect(mockedAgentUpdate).not.toHaveBeenCalled();
  });

  it("no lanza si Telnyx falla al crear — devuelve el motivo en vez de propagar el error", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BASE_BUSINESS as any);
    mockedCreateAssistant.mockRejectedValue(new Error("Telnyx 500"));

    const result = await createTelnyxAssistantForAgent({
      agentId: "agent1",
      businessId: "biz1",
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("Telnyx 500");
  });

  it('fija transcription.language según los idiomas activados, no un "es" fijo', async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      ...BASE_BUSINESS,
      agentSettings: {
        ...DEFAULT_AGENT_SETTINGS,
        languages: ["es-ES", "en-GB"],
      },
    } as any);
    mockedCreateAssistant.mockResolvedValue({
      id: "assistant_1",
      name: "alhabla-biz1-agent1",
      instructions: "i",
    });

    await createTelnyxAssistantForAgent({
      agentId: "agent1",
      businessId: "biz1",
    });

    expect(mockedCreateAssistant.mock.calls[0][0]).toMatchObject({
      transcription: { language: "multi" },
    });
  });

  it("devuelve no elegible si el negocio no existe", async () => {
    mockedBusinessFindUnique.mockResolvedValue(null);

    const result = await createTelnyxAssistantForAgent({
      agentId: "agent1",
      businessId: "biz_missing",
    });

    expect(result).toEqual({
      eligible: false,
      reason: "Negocio no encontrado.",
    });
  });
});

describe("syncAgentToTelnyx", () => {
  it("no hace nada si ningún agente tiene telnyxAssistantId todavía", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BASE_BUSINESS as any);
    mockedAgentFindMany.mockResolvedValue([]);

    await syncAgentToTelnyx("biz1");

    expect(mockedUpdateAssistant).not.toHaveBeenCalled();
    expect(mockedAgentUpdate).not.toHaveBeenCalled();
  });

  it("actualiza el assistant cuando la configuración cambió", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BASE_BUSINESS as any);
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent1",
        telnyxAssistantId: "assistant_1",
        telnyxConfigHash: "hash-vieja",
        systemPrompt: "prompt guardado",
        promptManuallyEdited: false,
      },
    ] as any);

    await syncAgentToTelnyx("biz1");

    expect(mockedUpdateAssistant).toHaveBeenCalledTimes(1);
    expect(mockedUpdateAssistant.mock.calls[0][0]).toBe("assistant_1");
    expect(mockedAgentUpdate).toHaveBeenCalledWith({
      where: { id: "agent1" },
      data: expect.objectContaining({ telnyxSyncError: null }),
    });
  });

  it("no llama a Telnyx si el hash de configuración no cambió", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BASE_BUSINESS as any);
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent1",
        telnyxAssistantId: "assistant_1",
        // Se calcula en el propio test tras una primera pasada para no
        // acoplarse al hash exacto que produce buildTelnyxAssistantPayload.
        telnyxConfigHash: "PENDIENTE",
        systemPrompt: "prompt guardado",
        promptManuallyEdited: false,
      },
    ] as any);

    // Primera pasada: calienta el hash real.
    await syncAgentToTelnyx("biz1");
    const [firstCallArg] = mockedAgentUpdate.mock.calls[0];
    const realHash = (firstCallArg as any).data.telnyxConfigHash;
    mockedUpdateAssistant.mockClear();
    mockedAgentUpdate.mockClear();

    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent1",
        telnyxAssistantId: "assistant_1",
        telnyxConfigHash: realHash,
        systemPrompt: "prompt guardado",
        promptManuallyEdited: false,
      },
    ] as any);

    await syncAgentToTelnyx("biz1");

    expect(mockedUpdateAssistant).not.toHaveBeenCalled();
    // Sigue refrescando telnyxSyncedAt aunque no haya cambiado nada remoto.
    expect(mockedAgentUpdate).toHaveBeenCalledTimes(1);
  });

  it("salta los agentes editados a mano cuando onlyManagedPrompts es true", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BASE_BUSINESS as any);
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent_manual",
        telnyxAssistantId: "assistant_1",
        telnyxConfigHash: null,
        systemPrompt: "prompt manual",
        promptManuallyEdited: true,
      },
    ] as any);

    await syncAgentToTelnyx("biz1", prisma, { onlyManagedPrompts: true });

    expect(mockedUpdateAssistant).not.toHaveBeenCalled();
    expect(mockedAgentUpdate).not.toHaveBeenCalled();
  });

  it("registra telnyxSyncError sin lanzar cuando el negocio deja de ser elegible", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BASE_BUSINESS as any);
    mockedListVoices.mockResolvedValue([]);
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent1",
        telnyxAssistantId: "assistant_1",
        telnyxConfigHash: null,
        systemPrompt: "prompt guardado",
        promptManuallyEdited: false,
      },
    ] as any);

    await expect(syncAgentToTelnyx("biz1")).resolves.toBeUndefined();

    expect(mockedUpdateAssistant).not.toHaveBeenCalled();
    expect(mockedAgentUpdate).toHaveBeenCalledWith({
      where: { id: "agent1" },
      data: { telnyxSyncError: expect.stringMatching(/voz Telnyx compatible/) },
    });
  });

  it("no lanza si prisma falla al buscar el negocio", async () => {
    mockedBusinessFindUnique.mockRejectedValue(new Error("DB caída"));

    await expect(syncAgentToTelnyx("biz1")).resolves.toBeUndefined();
  });
});

describe("transferencia al dueño (fase 4)", () => {
  it("con Alhabla como principal y móvil del dueño registra la tool transfer con el formato exacto y el bloque del prompt", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BUSINESS_PRINCIPAL as any);
    mockedAgentFindMany.mockResolvedValue(agenteSincronizable());

    await syncAgentToTelnyx("biz1");

    expect(mockedUpdateAssistant).toHaveBeenCalledTimes(1);
    const payload = mockedUpdateAssistant.mock.calls[0][1];
    const transfer = payload.tools!.filter((tool) => tool.type === "transfer");
    expect(transfer).toHaveLength(1);
    expect(transfer[0]).toEqual(TOOL_TRANSFER_ESPERADA);
    // Las tools de voz y hangup siguen ahí: la de transferencia se añade,
    // no sustituye.
    expect(payload.tools!.map((tool) => tool.type)).toEqual(
      expect.arrayContaining(["webhook", "hangup", "transfer"])
    );
    expect(payload.instructions).toContain("## Pasar la llamada");
    expect(payload.instructions).toContain("Pásala solo si el cliente pide");
  });

  it("con el ajuste «nunca» no registra la tool ni el bloque, aunque haya destino", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      ...BUSINESS_PRINCIPAL,
      agentSettings: { ...DEFAULT_AGENT_SETTINGS, pasarLlamadas: "nunca" },
    } as any);
    mockedAgentFindMany.mockResolvedValue(agenteSincronizable());

    await syncAgentToTelnyx("biz1");

    const payload = mockedUpdateAssistant.mock.calls[0][1];
    expect(payload.tools!.some((tool) => tool.type === "transfer")).toBe(false);
    expect(payload.instructions).not.toContain("## Pasar la llamada");
  });

  it("sin móvil del dueño no registra la tool aunque el ajuste sea «siempre»", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      ...BUSINESS_PRINCIPAL,
      ownerWhatsappNumber: null,
      agentSettings: { ...DEFAULT_AGENT_SETTINGS, pasarLlamadas: "siempre" },
    } as any);
    mockedAgentFindMany.mockResolvedValue(agenteSincronizable());

    await syncAgentToTelnyx("biz1");

    const payload = mockedUpdateAssistant.mock.calls[0][1];
    expect(payload.tools!.some((tool) => tool.type === "transfer")).toBe(false);
    expect(payload.instructions).not.toContain("## Pasar la llamada");
  });

  it("con desvío (fijo) no se activa por defecto, pero sí con el ajuste explícito y el modo «siempre» cambia la regla", async () => {
    const conDesvio = {
      ...BUSINESS_PRINCIPAL,
      customerLineType: "fijo",
      phone: "+34931112233",
    };
    mockedBusinessFindUnique.mockResolvedValue(conDesvio as any);
    mockedAgentFindMany.mockResolvedValue(agenteSincronizable());
    await syncAgentToTelnyx("biz1");
    expect(
      mockedUpdateAssistant.mock.calls[0][1].tools!.some(
        (tool) => tool.type === "transfer"
      )
    ).toBe(false);

    mockedUpdateAssistant.mockClear();
    mockedBusinessFindUnique.mockResolvedValue({
      ...conDesvio,
      agentSettings: { ...DEFAULT_AGENT_SETTINGS, pasarLlamadas: "siempre" },
    } as any);
    await syncAgentToTelnyx("biz1");
    const payload = mockedUpdateAssistant.mock.calls[0][1];
    expect(payload.tools!.some((tool) => tool.type === "transfer")).toBe(true);
    expect(payload.instructions).toContain(
      "Solo dentro del horario de apertura"
    );
  });

  it("también entra cuando calendar/service.ts pasa sus propias tools de webhook", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BUSINESS_PRINCIPAL as any);
    mockedAgentFindMany.mockResolvedValue(agenteSincronizable());

    await syncAgentToTelnyx("biz1", prisma, {
      tools: [
        {
          name: "get_catalog",
          description: "d",
          url: "https://api.example.test/webhooks/telnyx/tools/get_catalog",
          properties: {},
        },
      ],
    });

    const payload = mockedUpdateAssistant.mock.calls[0][1];
    expect(payload.tools!.map((tool) => tool.type)).toEqual([
      "webhook",
      "transfer",
      "hangup",
    ]);
  });

  it("al crear el assistant también lleva la tool cuando procede", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BUSINESS_PRINCIPAL as any);
    mockedCreateAssistant.mockResolvedValue({
      id: "assistant_1",
      name: "alhabla-biz1-agent1",
      instructions: "i",
    });

    await createTelnyxAssistantForAgent({
      agentId: "agent1",
      businessId: "biz1",
    });

    const payload = mockedCreateAssistant.mock.calls[0][0];
    expect(payload.tools!.filter((tool) => tool.type === "transfer")).toEqual([
      TOOL_TRANSFER_ESPERADA,
    ]);
    expect(payload.instructions).toContain("## Pasar la llamada");
  });
});

describe("transferencia al dueño — prompts editados a mano y copia del panel", () => {
  const BLOQUE = "## Pasar la llamada\nPuedes pasar la llamada…";

  it("promptManualConSuRegla añade el bloque al final solo si falta y hay tool", () => {
    expect(promptManualConSuRegla("Mi prompt.\n", BLOQUE)).toBe(
      `Mi prompt.\n\n${BLOQUE}`
    );
    // Sin tool no se toca ni una coma.
    expect(promptManualConSuRegla("Mi prompt.\n", null)).toBe("Mi prompt.\n");
    // El dueño ya escribió su propia regla: se respeta.
    const conRegla = "Mi prompt.\n\n## Pasar la llamada\nNunca la pases.";
    expect(promptManualConSuRegla(conRegla, BLOQUE)).toBe(conRegla);
  });

  it("un prompt editado a mano viaja a Telnyx con el bloque cuando se registra la tool transfer, y sin tocar Agent.systemPrompt", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BUSINESS_PRINCIPAL as any);
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent_manual",
        telnyxAssistantId: "assistant_1",
        telnyxConfigHash: null,
        systemPrompt: "Eres la recepcionista de Lola. Sé breve.",
        promptManuallyEdited: true,
      },
    ] as any);

    await syncAgentToTelnyx("biz1");

    const payload = mockedUpdateAssistant.mock.calls[0][1];
    expect(payload.tools!.some((tool) => tool.type === "transfer")).toBe(true);
    expect(
      payload.instructions.startsWith("Eres la recepcionista de Lola.")
    ).toBe(true);
    expect(payload.instructions).toContain("## Pasar la llamada");
    expect(payload.instructions).toContain("Pásala solo si el cliente pide");
    // La copia del panel de un prompt manual no se pisa.
    const data = (mockedAgentUpdate.mock.calls[0][0] as any).data;
    expect(data).not.toHaveProperty("systemPrompt");
  });

  it("un prompt editado a mano no recibe el bloque si la tool no se registra", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      ...BUSINESS_PRINCIPAL,
      agentSettings: { ...DEFAULT_AGENT_SETTINGS, pasarLlamadas: "nunca" },
    } as any);
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent_manual",
        telnyxAssistantId: "assistant_1",
        telnyxConfigHash: null,
        systemPrompt: "Eres la recepcionista de Lola. Sé breve.",
        promptManuallyEdited: true,
      },
    ] as any);

    await syncAgentToTelnyx("biz1");

    const payload = mockedUpdateAssistant.mock.calls[0][1];
    expect(payload.tools!.some((tool) => tool.type === "transfer")).toBe(false);
    expect(payload.instructions).toBe(
      "Eres la recepcionista de Lola. Sé breve."
    );
  });

  it("en un agente gestionado guarda en Agent.systemPrompt la copia del panel con el bloque, la misma regla que manda a Telnyx", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BUSINESS_PRINCIPAL as any);
    mockedAgentFindMany.mockResolvedValue(agenteSincronizable());

    await syncAgentToTelnyx("biz1");

    const payload = mockedUpdateAssistant.mock.calls[0][1];
    expect(payload.instructions).toContain("## Pasar la llamada");
    const data = (mockedAgentUpdate.mock.calls[0][0] as any).data;
    expect(data.telnyxSyncError).toBeNull();
    expect(data.systemPrompt).toContain("## Pasar la llamada");
    expect(data.systemPrompt).toContain("Pásala solo si el cliente pide");
    // Es la copia del panel (variables genéricas, como escribe PATCH
    // /business/me), no la reescritura para Telnyx que hace
    // buildTelnyxAssistantPayload ({{telnyx_current_time_…}}).
    expect(data.systemPrompt).toContain("{{current_time_Europe/Madrid}}");
    expect(data.systemPrompt).not.toContain("{{telnyx_");
  });
});
