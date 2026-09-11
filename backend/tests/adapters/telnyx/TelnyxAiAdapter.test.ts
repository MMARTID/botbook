import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { TelnyxAiAdapter } from "../../../src/adapters/telnyx/TelnyxAiAdapter.js";

const mockAssistantsCreate = vi.fn();
const mockAssistantsUpdate = vi.fn();
const mockAssistantsRetrieve = vi.fn();
const mockAssistantsDelete = vi.fn();
const mockPhoneNumbersUpdate = vi.fn();
const mockStartAIAssistant = vi.fn();
const mockStopAIAssistant = vi.fn();
const mockAnswer = vi.fn();
const mockHangup = vi.fn();
const mockConversationsRetrieve = vi.fn();
const mockMessagesList = vi.fn();
const mockRecordingsRetrieve = vi.fn();
const mockRecordingsList = vi.fn();
const mockListVoices = vi.fn();
const mockCallControlAppsCreate = vi.fn();
const mockCallControlAppsRetrieve = vi.fn();
const mockCallControlAppsUpdate = vi.fn();
const mockBillingGroupsList = vi.fn();
const mockBillingGroupsCreate = vi.fn();

const mockTelnyxClient = {
  callControlApplications: {
    create: mockCallControlAppsCreate,
    retrieve: mockCallControlAppsRetrieve,
    update: mockCallControlAppsUpdate,
  },
  billingGroups: {
    list: mockBillingGroupsList,
    create: mockBillingGroupsCreate,
  },
  ai: {
    assistants: {
      create: mockAssistantsCreate,
      update: mockAssistantsUpdate,
      retrieve: mockAssistantsRetrieve,
      delete: mockAssistantsDelete,
    },
    conversations: {
      retrieve: mockConversationsRetrieve,
      messages: { list: mockMessagesList },
    },
  },
  calls: {
    actions: {
      startAIAssistant: mockStartAIAssistant,
      stopAIAssistant: mockStopAIAssistant,
      answer: mockAnswer,
      hangup: mockHangup,
    },
  },
  phoneNumbers: { update: mockPhoneNumbersUpdate },
  recordings: { retrieve: mockRecordingsRetrieve, list: mockRecordingsList },
  textToSpeech: { listVoices: mockListVoices },
};

vi.mock("../../../src/lib/telnyx.js", () => ({
  getTelnyxClient: vi.fn(() => mockTelnyxClient),
}));

/** Envuelve un array como el async-iterable que devuelve el SDK real (PagePromise). */
function asyncIterableOf<T>(items: T[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const item of items) yield item;
    },
  };
}

describe("TelnyxAiAdapter", () => {
  let adapter: TelnyxAiAdapter;

  beforeEach(() => {
    adapter = new TelnyxAiAdapter();
    vi.clearAllMocks();
  });

  describe("createAssistant", () => {
    it("crea el assistant y no exige dynamic_variables_webhook_url", async () => {
      mockAssistantsCreate.mockResolvedValue({
        id: "assistant_123",
        name: "alhabla-biz1-agent1",
        instructions: "Eres un asistente",
        greeting: "",
      });

      const result = await adapter.createAssistant({
        name: "alhabla-biz1-agent1",
        instructions: "Eres un asistente",
        greeting: "",
        privacySettings: { data_retention: false },
        insightGroupId: "insight_grp_1",
      });

      expect(result).toEqual({
        id: "assistant_123",
        name: "alhabla-biz1-agent1",
        instructions: "Eres un asistente",
        greeting: "",
      });
      const [payload] = mockAssistantsCreate.mock.calls[0];
      expect(payload).not.toHaveProperty("dynamic_variables_webhook_url");
      expect(payload.privacy_settings).toEqual({ data_retention: false });
      expect(payload.insight_settings).toEqual({
        insight_group_id: "insight_grp_1",
      });
      expect(payload.enabled_features).toEqual(["telephony"]);
    });
  });

  describe("updateAssistant", () => {
    it("solo envía los campos indicados", async () => {
      mockAssistantsUpdate.mockResolvedValue({
        id: "assistant_123",
        name: "nuevo nombre",
        instructions: "instr",
      });

      await adapter.updateAssistant("assistant_123", { name: "nuevo nombre" });

      expect(mockAssistantsUpdate).toHaveBeenCalledWith("assistant_123", {
        name: "nuevo nombre",
      });
    });

    it("traduce insightGroupId a insight_settings", async () => {
      mockAssistantsUpdate.mockResolvedValue({
        id: "assistant_123",
        name: "n",
        instructions: "i",
      });

      await adapter.updateAssistant("assistant_123", {
        insightGroupId: "insight_grp_2",
      });

      expect(mockAssistantsUpdate).toHaveBeenCalledWith("assistant_123", {
        insight_settings: { insight_group_id: "insight_grp_2" },
      });
    });
  });

  describe("getAssistant / deleteAssistant", () => {
    it("obtiene un assistant por id", async () => {
      mockAssistantsRetrieve.mockResolvedValue({
        id: "assistant_123",
        name: "n",
        instructions: "i",
      });

      const result = await adapter.getAssistant("assistant_123");

      expect(result.id).toBe("assistant_123");
      expect(mockAssistantsRetrieve).toHaveBeenCalledWith("assistant_123");
    });

    it("elimina un assistant por id", async () => {
      mockAssistantsDelete.mockResolvedValue(undefined);

      await adapter.deleteAssistant("assistant_123");

      expect(mockAssistantsDelete).toHaveBeenCalledWith("assistant_123");
    });
  });

  describe("createCallControlApp / getCallControlApp", () => {
    it("crea el Call Control App de plataforma y devuelve su id", async () => {
      mockCallControlAppsCreate.mockResolvedValue({
        data: { id: "cca_123", application_name: "alhabla-platform" },
      });

      const result = await adapter.createCallControlApp({
        name: "alhabla-platform",
        webhookEventUrl: "https://api.alhabla.ai/webhooks/telnyx",
      });

      expect(result).toEqual({ id: "cca_123" });
      expect(mockCallControlAppsCreate).toHaveBeenCalledWith({
        application_name: "alhabla-platform",
        webhook_event_url: "https://api.alhabla.ai/webhooks/telnyx",
      });
    });

    it("lanza si Telnyx no devuelve un id", async () => {
      mockCallControlAppsCreate.mockResolvedValue({ data: {} });

      await expect(
        adapter.createCallControlApp({
          name: "alhabla-platform",
          webhookEventUrl: "https://api.alhabla.ai/webhooks/telnyx",
        })
      ).rejects.toThrow();
    });

    it("obtiene un Call Control App existente por id", async () => {
      mockCallControlAppsRetrieve.mockResolvedValue({
        data: {
          id: "cca_123",
          application_name: "alhabla-platform",
          webhook_event_url: "https://api.alhabla.ai/webhooks/telnyx",
        },
      });

      const result = await adapter.getCallControlApp("cca_123");

      expect(result).toEqual({
        id: "cca_123",
        name: "alhabla-platform",
        webhookEventUrl: "https://api.alhabla.ai/webhooks/telnyx",
      });
    });

    it("devuelve null si el Call Control App no existe", async () => {
      mockCallControlAppsRetrieve.mockRejectedValue(new Error("Not found"));

      const result = await adapter.getCallControlApp("cca_missing");

      expect(result).toBeNull();
    });

    it("lee callCostInWebhooks de la respuesta real", async () => {
      mockCallControlAppsRetrieve.mockResolvedValue({
        data: {
          id: "cca_123",
          application_name: "alhabla-platform",
          webhook_event_url: "https://api.alhabla.ai/webhooks/telnyx",
          call_cost_in_webhooks: true,
        },
      });

      const result = await adapter.getCallControlApp("cca_123");

      expect(result?.callCostInWebhooks).toBe(true);
    });
  });

  describe("updateCallControlApp", () => {
    it("reenvía nombre/webhook y activa call_cost_in_webhooks", async () => {
      mockCallControlAppsUpdate.mockResolvedValue({});

      await adapter.updateCallControlApp("cca_123", {
        name: "alhabla-platform",
        webhookEventUrl: "https://api.alhabla.ai/webhooks/telnyx",
        callCostInWebhooks: true,
      });

      expect(mockCallControlAppsUpdate).toHaveBeenCalledWith("cca_123", {
        application_name: "alhabla-platform",
        webhook_event_url: "https://api.alhabla.ai/webhooks/telnyx",
        call_cost_in_webhooks: true,
      });
    });
  });

  describe("listBillingGroups / createBillingGroup", () => {
    it("lista los billing groups existentes", async () => {
      mockBillingGroupsList.mockReturnValue(
        asyncIterableOf([{ id: "bg_1", name: "alhabla-platform" }])
      );

      const result = await adapter.listBillingGroups();

      expect(result).toEqual([{ id: "bg_1", name: "alhabla-platform" }]);
    });

    it("crea un billing group y devuelve su id", async () => {
      mockBillingGroupsCreate.mockResolvedValue({
        data: { id: "bg_1", name: "alhabla-platform" },
      });

      const result = await adapter.createBillingGroup("alhabla-platform");

      expect(result).toEqual({ id: "bg_1" });
      expect(mockBillingGroupsCreate).toHaveBeenCalledWith({
        name: "alhabla-platform",
      });
    });
  });

  describe("setPhoneNumberBillingGroup", () => {
    it("actualiza el billing_group_id del número", async () => {
      mockPhoneNumbersUpdate.mockResolvedValue({});

      await adapter.setPhoneNumberBillingGroup("pn_123", "bg_1");

      expect(mockPhoneNumbersUpdate).toHaveBeenCalledWith("pn_123", {
        billing_group_id: "bg_1",
      });
    });
  });

  describe("setPhoneNumberConnectionId", () => {
    it("actualiza el connection_id del número al de la TeXML App del assistant", async () => {
      mockPhoneNumbersUpdate.mockResolvedValue({});

      await adapter.setPhoneNumberConnectionId("pn_123", "texml_app_456");

      expect(mockPhoneNumbersUpdate).toHaveBeenCalledWith("pn_123", {
        connection_id: "texml_app_456",
      });
    });
  });

  describe("startAssistantOnCall / stopAssistantOnCall", () => {
    it("arranca el assistant sobre una llamada ya controlada", async () => {
      mockStartAIAssistant.mockResolvedValue({});

      await adapter.startAssistantOnCall("call_ctrl_1", "assistant_123", {
        greeting: "Hola",
      });

      expect(mockStartAIAssistant).toHaveBeenCalledWith("call_ctrl_1", {
        assistant: { id: "assistant_123" },
        greeting: "Hola",
        client_state: undefined,
      });
    });

    it("para el assistant sin colgar la llamada", async () => {
      mockStopAIAssistant.mockResolvedValue({});

      await adapter.stopAssistantOnCall("call_ctrl_1");

      expect(mockStopAIAssistant).toHaveBeenCalledWith("call_ctrl_1", {
        client_state: undefined,
      });
    });
  });

  describe("answerCallWithAssistant / hangupCall", () => {
    it("contesta la llamada arrancando el assistant en el mismo comando", async () => {
      mockAnswer.mockResolvedValue({});

      await adapter.answerCallWithAssistant("call_ctrl_1", "assistant_123");

      expect(mockAnswer).toHaveBeenCalledWith("call_ctrl_1", {
        assistant: { id: "assistant_123" },
        client_state: undefined,
      });
    });

    it("cuelga una llamada que no se puede atender", async () => {
      mockHangup.mockResolvedValue({});

      await adapter.hangupCall("call_ctrl_1");

      expect(mockHangup).toHaveBeenCalledWith("call_ctrl_1", {});
    });
  });

  describe("getConversation", () => {
    it("desenvuelve el wrapper {data} del SDK", async () => {
      mockConversationsRetrieve.mockResolvedValue({
        data: { id: "conv_1", metadata: { channel: "phone_call" } },
      });

      const result = await adapter.getConversation("conv_1");

      expect(result).toEqual({
        id: "conv_1",
        metadata: { channel: "phone_call" },
      });
    });

    it("lanza si Telnyx no devuelve datos", async () => {
      mockConversationsRetrieve.mockResolvedValue({ data: undefined });

      await expect(adapter.getConversation("conv_missing")).rejects.toThrow(
        "conv_missing"
      );
    });
  });

  describe("listConversationMessages", () => {
    it("mapea los mensajes de la conversación", async () => {
      mockMessagesList.mockReturnValue(
        asyncIterableOf([
          { role: "user", text: "Hola", created_at: "t1", sent_at: "t1" },
          { role: "assistant", text: "¿En qué puedo ayudarte?" },
        ])
      );

      const result = await adapter.listConversationMessages("conv_1");

      expect(result).toEqual([
        { role: "user", text: "Hola", createdAt: "t1", sentAt: "t1" },
        {
          role: "assistant",
          text: "¿En qué puedo ayudarte?",
          createdAt: undefined,
          sentAt: undefined,
        },
      ]);
      expect(mockMessagesList).toHaveBeenCalledWith("conv_1");
    });
  });

  describe("getRecording", () => {
    it("devuelve la grabación cuando existe", async () => {
      mockRecordingsRetrieve.mockResolvedValue({
        data: {
          id: "rec_1",
          call_control_id: "call_ctrl_1",
          call_leg_id: "leg_1",
          download_urls: { mp3: "https://example.com/a.mp3" },
        },
      });

      const result = await adapter.getRecording("rec_1");

      expect(result).toEqual({
        id: "rec_1",
        callControlId: "call_ctrl_1",
        callLegId: "leg_1",
        downloadUrls: { mp3: "https://example.com/a.mp3" },
      });
    });

    it("devuelve null si Telnyx responde con error (p. ej. 404)", async () => {
      mockRecordingsRetrieve.mockRejectedValue(new Error("Not found"));

      const result = await adapter.getRecording("rec_missing");

      expect(result).toBeNull();
    });
  });

  describe("listRecordingsByCallControlId", () => {
    it("filtra por call_control_id", async () => {
      mockRecordingsList.mockReturnValue(
        asyncIterableOf([{ id: "rec_1", call_control_id: "call_ctrl_1" }])
      );

      const result = await adapter.listRecordingsByCallControlId("call_ctrl_1");

      expect(result).toEqual([
        {
          id: "rec_1",
          callControlId: "call_ctrl_1",
          callLegId: undefined,
          downloadUrls: undefined,
        },
      ]);
      expect(mockRecordingsList).toHaveBeenCalledWith({
        filter: { call_control_id: "call_ctrl_1" },
      });
    });
  });

  describe("listRecordingsByCallLegId", () => {
    it("filtra por call_leg_id — call.recording.saved no trae call_control_id", async () => {
      mockRecordingsList.mockReturnValue(
        asyncIterableOf([{ id: "rec_1", call_leg_id: "leg_1", call_control_id: "call_ctrl_1" }])
      );

      const result = await adapter.listRecordingsByCallLegId("leg_1");

      expect(result).toEqual([
        {
          id: "rec_1",
          callControlId: "call_ctrl_1",
          callLegId: "leg_1",
          downloadUrls: undefined,
        },
      ]);
      expect(mockRecordingsList).toHaveBeenCalledWith({
        filter: { call_leg_id: "leg_1" },
      });
    });
  });

  describe("listVoices", () => {
    it("mapea la respuesta real de la API (campo id, no voice_id como declara el SDK)", async () => {
      mockListVoices.mockResolvedValue({
        voices: [
          {
            id: "Telnyx.Ultra.isabel",
            name: "Isabel - Teacher",
            language: "es-ES",
            gender: "Female",
            provider: "telnyx",
            model_id: "Ultra",
          },
        ],
      });

      const result = await adapter.listVoices();

      expect(result).toEqual([
        {
          id: "Telnyx.Ultra.isabel",
          name: "Isabel - Teacher",
          language: "es-ES",
          gender: "Female",
          provider: "telnyx",
        },
      ]);
      expect(mockListVoices).toHaveBeenCalledWith({ provider: "telnyx" });
    });

    it("descarta cualquier entrada sin id", async () => {
      mockListVoices.mockResolvedValue({
        voices: [{ name: "sin id", language: "es-ES" }],
      });

      const result = await adapter.listVoices();

      expect(result).toEqual([]);
    });
  });

  describe("verifyWebhookSignature", () => {
    // Delega en la clase Ed25519 oficial del SDK (telnyx/lib/webhooks.js),
    // no en una implementación propia — ver el comentario junto al método.
    const originalEnv = process.env.TELNYX_PUBLIC_KEY;

    function generateTelnyxLikeKeyPair() {
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");
      const spkiDer = publicKey.export({ type: "spki", format: "der" });
      // Telnyx entrega la clave pública Ed25519 cruda (32 bytes) en base64,
      // no el envoltorio SPKI completo — los últimos 32 bytes del DER SPKI
      // son exactamente esos bytes crudos.
      const rawPublicKeyBase64 = spkiDer
        .subarray(spkiDer.length - 32)
        .toString("base64");
      return { privateKey, rawPublicKeyBase64 };
    }

    function sign(privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"], timestamp: string, rawBody: string) {
      const message = Buffer.from(`${timestamp}|${rawBody}`, "utf8");
      return cryptoSign(null, message, privateKey).toString("base64");
    }

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.TELNYX_PUBLIC_KEY;
      } else {
        process.env.TELNYX_PUBLIC_KEY = originalEnv;
      }
    });

    it("acepta una firma válida dentro de la ventana de tiempo", async () => {
      const { privateKey, rawPublicKeyBase64 } = generateTelnyxLikeKeyPair();
      process.env.TELNYX_PUBLIC_KEY = rawPublicKeyBase64;

      const rawBody = JSON.stringify({ event_type: "call.conversation.ended" });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = sign(privateKey, timestamp, rawBody);

      await expect(
        adapter.verifyWebhookSignature(rawBody, signature, timestamp)
      ).resolves.toBe(true);
    });

    it("rechaza el cuerpo si se modifica tras firmarlo", async () => {
      const { privateKey, rawPublicKeyBase64 } = generateTelnyxLikeKeyPair();
      process.env.TELNYX_PUBLIC_KEY = rawPublicKeyBase64;

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = sign(privateKey, timestamp, JSON.stringify({ a: 1 }));
      const tamperedBody = JSON.stringify({ a: 2 });

      await expect(
        adapter.verifyWebhookSignature(tamperedBody, signature, timestamp)
      ).resolves.toBe(false);
    });

    it("rechaza una firma cuyo timestamp está fuera de la ventana de tolerancia", async () => {
      const { privateKey, rawPublicKeyBase64 } = generateTelnyxLikeKeyPair();
      process.env.TELNYX_PUBLIC_KEY = rawPublicKeyBase64;

      const rawBody = JSON.stringify({ event_type: "call.hangup" });
      const staleTimestamp = (
        Math.floor(Date.now() / 1000) - 3600
      ).toString();
      const signature = sign(privateKey, staleTimestamp, rawBody);

      await expect(
        adapter.verifyWebhookSignature(rawBody, signature, staleTimestamp)
      ).resolves.toBe(false);
    });

    it("rechaza una firma calculada con otra clave (replay entre cuentas)", async () => {
      const { rawPublicKeyBase64 } = generateTelnyxLikeKeyPair();
      const attacker = generateTelnyxLikeKeyPair();
      process.env.TELNYX_PUBLIC_KEY = rawPublicKeyBase64;

      const rawBody = JSON.stringify({ event_type: "call.hangup" });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = sign(attacker.privateKey, timestamp, rawBody);

      await expect(
        adapter.verifyWebhookSignature(rawBody, signature, timestamp)
      ).resolves.toBe(false);
    });

    it("devuelve false si falta la cabecera de firma o de timestamp", async () => {
      process.env.TELNYX_PUBLIC_KEY = generateTelnyxLikeKeyPair().rawPublicKeyBase64;

      await expect(
        adapter.verifyWebhookSignature("{}", undefined, "123")
      ).resolves.toBe(false);
      await expect(
        adapter.verifyWebhookSignature("{}", "sig", undefined)
      ).resolves.toBe(false);
    });

    it("lanza si no hay clave pública configurada — falla cerrado, no abierto", async () => {
      delete process.env.TELNYX_PUBLIC_KEY;

      await expect(
        adapter.verifyWebhookSignature("{}", "sig", "123")
      ).rejects.toThrow("TELNYX_PUBLIC_KEY");
    });
  });
});
