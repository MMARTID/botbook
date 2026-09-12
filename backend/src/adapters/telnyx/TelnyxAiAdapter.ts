import { TelnyxWebhook } from "telnyx/lib/webhooks.js";
import { getTelnyxClient } from "../../lib/telnyx.js";
import type {
  AssistantCreateParams,
  AssistantUpdateParams,
  HangupTool,
  InferenceEmbedding,
  InferenceEmbeddingWebhookToolParams,
  PrivacySettings,
  TelephonySettings,
  TranscriptionSettings,
  VoiceSettings,
} from "telnyx/resources/ai/assistants/assistants.js";
import type { MessageListResponse } from "telnyx/resources/ai/conversations/messages.js";
import type { RecordingResponseData } from "telnyx/resources/recordings/recordings.js";

/** Alias legible: es el tipo real que `AssistantCreateParams.tools` exige
 * para una tool de webhook (no confundir con `WebhookTool`, la forma que
 * usa la config inline de `assistant` en Call Control). */
export type TelnyxWebhookTool = InferenceEmbeddingWebhookToolParams;
export type { HangupTool };

/** `send_conversation_message_events` es un campo real de la API (aparece
 * en la respuesta y la acepta en escritura) que el SDK no declara en
 * `TelephonySettings` — verificado en vivo el 2026-09-11. Sin él,
 * `ai.conversations.messages` nunca se rellena para llamadas de voz. */
type TelephonySettingsInput = TelephonySettings & {
  send_conversation_message_events?: boolean;
};

export interface CreateTelnyxAssistantInput {
  name: string;
  instructions: string;
  /** Vacío para que el asistente espere a que hable el cliente. */
  greeting?: string;
  model?: string;
  /** Modelo Telnyx-hosted al que caer si el proveedor del modelo primario
   * (`model`) no está disponible — ver `fallbackConfig` en
   * telnyxAssistantPayload.ts para la elección real y el porqué. */
  fallbackConfig?: { model?: string };
  voiceSettings?: VoiceSettings;
  transcription?: TranscriptionSettings;
  telephonySettings?: TelephonySettingsInput;
  privacySettings?: PrivacySettings;
  insightGroupId?: string;
  tools?: Array<TelnyxWebhookTool | HangupTool>;
  enabledFeatures?: AssistantCreateParams["enabled_features"];
}

export interface TelnyxAssistant {
  id: string;
  name: string;
  instructions: string;
  greeting?: string;
}

function toAssistantCreatePayload(
  input: CreateTelnyxAssistantInput
): AssistantCreateParams {
  return {
    name: input.name,
    instructions: input.instructions,
    greeting: input.greeting,
    model: input.model,
    fallback_config: input.fallbackConfig,
    voice_settings: input.voiceSettings,
    transcription: input.transcription,
    telephony_settings: input.telephonySettings,
    privacy_settings: input.privacySettings,
    insight_settings: input.insightGroupId
      ? { insight_group_id: input.insightGroupId }
      : undefined,
    tools: input.tools,
    enabled_features: input.enabledFeatures ?? ["telephony"],
  };
}

function toTelnyxAssistant(response: InferenceEmbedding): TelnyxAssistant {
  return {
    id: response.id,
    name: response.name,
    instructions: response.instructions,
    greeting: response.greeting,
  };
}

export interface TelnyxConversation {
  id: string;
  /** Metadatos crudos de Telnyx (canal, etiquetas propias, etc.) — sin
   * asumir claves concretas hasta verificar el payload real en Fase 0/3. */
  metadata: Record<string, string>;
}

export interface TelnyxConversationMessage {
  role: "user" | "assistant" | "tool";
  text: string;
  createdAt?: string;
  sentAt?: string;
}

export interface TelnyxRecording {
  id?: string;
  callControlId?: string;
  callLegId?: string;
  downloadUrls?: { mp3?: string; wav?: string };
}

export interface TelnyxVoice {
  /** Identificador completo listo para `VoiceSettings.voice`
   * (`Telnyx.<model_id>.<voice_id>`) — verificado en vivo contra la cuenta
   * real el 2026-09-11. El SDK declara este campo como `voice_id` en
   * `TextToSpeechListVoicesResponse.Voice`, pero la API real devuelve `id`
   * ya compuesto; `voice_id` no viene en la respuesta. No usar el tipo del
   * SDK para este endpoint sin volver a verificarlo. */
  id: string;
  name?: string;
  language?: string;
  gender?: string;
  provider?: string;
}

export class TelnyxAiAdapter {
  // ---------------------------------------------------------------------
  // Assistants CRUD
  // ---------------------------------------------------------------------

  async createAssistant(
    input: CreateTelnyxAssistantInput
  ): Promise<TelnyxAssistant> {
    const client = getTelnyxClient();
    const response = await client.ai.assistants.create(
      toAssistantCreatePayload(input)
    );
    return toTelnyxAssistant(response);
  }

  async updateAssistant(
    assistantId: string,
    input: Partial<CreateTelnyxAssistantInput>
  ): Promise<TelnyxAssistant> {
    const client = getTelnyxClient();
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name;
    if (input.instructions !== undefined)
      payload.instructions = input.instructions;
    if (input.greeting !== undefined) payload.greeting = input.greeting;
    if (input.model !== undefined) payload.model = input.model;
    if (input.fallbackConfig !== undefined)
      payload.fallback_config = input.fallbackConfig;
    if (input.voiceSettings !== undefined)
      payload.voice_settings = input.voiceSettings;
    if (input.transcription !== undefined)
      payload.transcription = input.transcription;
    if (input.telephonySettings !== undefined)
      payload.telephony_settings = input.telephonySettings;
    if (input.privacySettings !== undefined)
      payload.privacy_settings = input.privacySettings;
    if (input.insightGroupId !== undefined) {
      payload.insight_settings = { insight_group_id: input.insightGroupId };
    }
    if (input.tools !== undefined) payload.tools = input.tools;
    if (input.enabledFeatures !== undefined)
      payload.enabled_features = input.enabledFeatures;

    const response = await client.ai.assistants.update(
      assistantId,
      payload as AssistantUpdateParams
    );
    return toTelnyxAssistant(response);
  }

  async getAssistant(assistantId: string): Promise<TelnyxAssistant> {
    const client = getTelnyxClient();
    const response = await client.ai.assistants.retrieve(assistantId);
    return toTelnyxAssistant(response);
  }

  async deleteAssistant(assistantId: string): Promise<void> {
    const client = getTelnyxClient();
    await client.ai.assistants.delete(assistantId);
  }

  // ---------------------------------------------------------------------
  // Call Control App de plataforma — recurso ÚNICO, creado una sola vez a
  // mano (script de provisioning), no por request. Su `id` es el
  // `connection_id` que enrutan los números en ruta Telnyx primary.
  // ---------------------------------------------------------------------

  async createCallControlApp(input: {
    name: string;
    webhookEventUrl: string;
  }): Promise<{ id: string }> {
    const client = getTelnyxClient();
    const response = await client.callControlApplications.create({
      application_name: input.name,
      webhook_event_url: input.webhookEventUrl,
    });
    if (!response.data?.id) {
      throw new Error("Telnyx no devolvió el id del Call Control App creado");
    }
    return { id: response.data.id };
  }

  async getCallControlApp(id: string): Promise<{
    id: string;
    name?: string;
    webhookEventUrl?: string;
    callCostInWebhooks?: boolean;
  } | null> {
    const client = getTelnyxClient();
    try {
      const response = await client.callControlApplications.retrieve(id);
      if (!response.data?.id) return null;
      return {
        id: response.data.id,
        name: response.data.application_name,
        webhookEventUrl: response.data.webhook_event_url,
        callCostInWebhooks: response.data.call_cost_in_webhooks,
      };
    } catch {
      return null;
    }
  }

  /**
   * `application_name`/`webhook_event_url` son obligatorios incluso para
   * actualizar solo `callCostInWebhooks` — el llamador debe reenviar los
   * valores actuales (p. ej. leídos con `getCallControlApp`).
   */
  async updateCallControlApp(
    id: string,
    input: { name: string; webhookEventUrl: string; callCostInWebhooks?: boolean }
  ): Promise<void> {
    const client = getTelnyxClient();
    await client.callControlApplications.update(id, {
      application_name: input.name,
      webhook_event_url: input.webhookEventUrl,
      call_cost_in_webhooks: input.callCostInWebhooks,
    });
  }

  // ---------------------------------------------------------------------
  // Billing groups — etiqueta de organización de coste (plan interno de
  // seguimiento, no forma parte del diseño original del plan Telnyx-
  // orquestador). El coste real por llamada llega por el webhook
  // `call.cost`, que solo se activa si el Call Control App lo tiene
  // habilitado (`callCostInWebhooks`) — el billing group en sí no da coste
  // en tiempo real, solo agrupa para informes mensuales
  // (`ledgerBillingGroupReports`, no implementado: es async y mensual, no
  // sirve para "cuánto costó esta llamada").
  // ---------------------------------------------------------------------

  async listBillingGroups(): Promise<Array<{ id: string; name?: string }>> {
    const client = getTelnyxClient();
    const groups: Array<{ id: string; name?: string }> = [];
    for await (const group of client.billingGroups.list()) {
      if (group.id) groups.push({ id: group.id, name: group.name });
    }
    return groups;
  }

  async createBillingGroup(name: string): Promise<{ id: string }> {
    const client = getTelnyxClient();
    const response = await client.billingGroups.create({ name });
    if (!response.data?.id) {
      throw new Error("Telnyx no devolvió el id del billing group creado");
    }
    return { id: response.data.id };
  }

  async setPhoneNumberBillingGroup(
    phoneNumberId: string,
    billingGroupId: string
  ): Promise<void> {
    const client = getTelnyxClient();
    await client.phoneNumbers.update(phoneNumberId, {
      billing_group_id: billingGroupId,
    });
  }

  // ---------------------------------------------------------------------
  // Asignación de número — genérico a propósito: el mismo `connection_id`
  // enruta un número a la TeXML App auto-creada de un assistant, al Call
  // Control App compartido de plataforma (Fase 4), o de vuelta al SIP trunk
  // de Retell (failback) — quien llama decide cuál es cuál.
  // ---------------------------------------------------------------------

  async setPhoneNumberConnectionId(
    phoneNumberId: string,
    connectionId: string
  ): Promise<void> {
    const client = getTelnyxClient();
    await client.phoneNumbers.update(phoneNumberId, { connection_id: connectionId });
  }

  // ---------------------------------------------------------------------
  // Call Control — arrancar/parar el asistente sobre una llamada ya
  // controlada (Call Control App propio, no el flujo automático de número).
  // ---------------------------------------------------------------------

  /**
   * Contesta una llamada entrante y arranca el asistente en el mismo
   * comando — el flujo normal para `call.initiated` en nuestro Call Control
   * App compartido (plan §4). Distinto de `startAssistantOnCall`, que
   * arranca el asistente sobre una llamada YA contestada (p. ej. tras un
   * traspaso o una intervención manual a mitad de llamada).
   */
  async answerCallWithAssistant(
    callControlId: string,
    assistantId: string,
    options: { clientState?: string } = {}
  ): Promise<void> {
    const client = getTelnyxClient();
    await client.calls.actions.answer(callControlId, {
      assistant: { id: assistantId },
      client_state: options.clientState,
    });
  }

  async startAssistantOnCall(
    callControlId: string,
    assistantId: string,
    options: { greeting?: string; clientState?: string } = {}
  ): Promise<void> {
    const client = getTelnyxClient();
    await client.calls.actions.startAIAssistant(callControlId, {
      assistant: { id: assistantId },
      greeting: options.greeting,
      client_state: options.clientState,
    });
  }

  async stopAssistantOnCall(
    callControlId: string,
    options: { clientState?: string } = {}
  ): Promise<void> {
    const client = getTelnyxClient();
    await client.calls.actions.stopAIAssistant(callControlId, {
      client_state: options.clientState,
    });
  }

  /**
   * Cuelga una llamada que no se puede atender (negocio/agente sin resolver
   * en `call.initiated`) — sin esto, no hacer nada deja al que llama en
   * silencio hasta que el propio Telnyx agote un timeout.
   */
  async hangupCall(callControlId: string): Promise<void> {
    const client = getTelnyxClient();
    await client.calls.actions.hangup(callControlId, {});
  }

  // ---------------------------------------------------------------------
  // Conversación y transcripción
  // ---------------------------------------------------------------------

  async getConversation(conversationId: string): Promise<TelnyxConversation> {
    const client = getTelnyxClient();
    const response = await client.ai.conversations.retrieve(conversationId);
    if (!response.data) {
      throw new Error(`Telnyx no devolvió la conversación ${conversationId}`);
    }
    return { id: response.data.id, metadata: response.data.metadata ?? {} };
  }

  async listConversationMessages(
    conversationId: string
  ): Promise<TelnyxConversationMessage[]> {
    const client = getTelnyxClient();
    const messages: TelnyxConversationMessage[] = [];
    for await (const message of client.ai.conversations.messages.list(
      conversationId
    )) {
      messages.push(toConversationMessage(message));
    }
    return messages;
  }

  // ---------------------------------------------------------------------
  // Grabación
  // ---------------------------------------------------------------------

  async getRecording(recordingId: string): Promise<TelnyxRecording | null> {
    const client = getTelnyxClient();
    try {
      const response = await client.recordings.retrieve(recordingId);
      return toTelnyxRecording(response.data);
    } catch {
      return null;
    }
  }

  async listRecordingsByCallControlId(
    callControlId: string
  ): Promise<TelnyxRecording[]> {
    return this.listRecordings({ callControlId });
  }

  /**
   * `call.recording.saved` no trae `call_control_id` en su payload (solo
   * `call_leg_id`/`call_session_id`, verificado contra los tipos de webhook
   * del SDK) — hace falta esta vía para correlacionar la grabación con
   * nuestro `Call` cuando solo se tiene el leg.
   */
  async listRecordingsByCallLegId(
    callLegId: string
  ): Promise<TelnyxRecording[]> {
    return this.listRecordings({ callLegId });
  }

  private async listRecordings(filter: {
    callControlId?: string;
    callLegId?: string;
  }): Promise<TelnyxRecording[]> {
    const client = getTelnyxClient();
    const recordings: TelnyxRecording[] = [];
    for await (const recording of client.recordings.list({
      filter: {
        call_control_id: filter.callControlId,
        call_leg_id: filter.callLegId,
      },
    })) {
      recordings.push(toTelnyxRecording(recording));
    }
    return recordings;
  }

  // ---------------------------------------------------------------------
  // Voces — fuente de verdad para qué voz usar por negocio (ver plan §3):
  // la sincronización elige la primera voz Telnyx-hosted disponible para el
  // idioma/género pedidos; si no hay ninguna, el negocio no es elegible.
  // ---------------------------------------------------------------------

  async listVoices(): Promise<TelnyxVoice[]> {
    const client = getTelnyxClient();
    const response = await client.textToSpeech.listVoices({
      provider: "telnyx",
    });
    // La respuesta real trae más campos (`id` en vez de `voice_id`, `label`,
    // `accent`, `model_id`) de los que declara el SDK — se accede sin el
    // tipo del SDK para no ocultar el campo que de verdad importa (`id`).
    const voices = (response.voices ?? []) as unknown as Array<{
      id?: string;
      name?: string;
      language?: string;
      gender?: string;
      provider?: string;
    }>;
    return voices
      .filter((voice): voice is { id: string } & typeof voice =>
        Boolean(voice.id)
      )
      .map((voice) => ({
        id: voice.id,
        name: voice.name,
        language: voice.language,
        gender: voice.gender,
        provider: voice.provider,
      }));
  }

  // ---------------------------------------------------------------------
  // Firma de webhooks — Ed25519 con ventana de timestamp. A diferencia de
  // Retell/Stripe (ver CLAUDE.md), esta verificación es nueva: no toca
  // ninguna firma ya validada en producción.
  //
  // Delega en `TelnyxWebhook` (telnyx/lib/webhooks.js), la clase Ed25519
  // oficial del SDK — no en `client.webhooks.unwrap()` (el `webhooks` del
  // cliente principal), que usa la librería `standardwebhooks` (cabeceras
  // `webhook-id`/`webhook-timestamp`/`webhook-signature`, HMAC): un esquema
  // completamente distinto que NO corresponde a los webhooks de Call
  // Control/AI Assistants (`telnyx-signature-ed25519`/`telnyx-timestamp`).
  // Confirmado leyendo el código fuente de ambos módulos el 2026-09-11 —
  // el SDK de Telnyx bundlea las dos implementaciones para categorías de
  // webhook distintas y es fácil confundirlas.
  // ---------------------------------------------------------------------

  /**
   * @param rawBody Cuerpo exacto recibido (antes de parsear JSON).
   * @param signatureHeader Valor de la cabecera `telnyx-signature-ed25519`.
   * @param timestampHeader Valor de la cabecera `telnyx-timestamp` (segundos Unix).
   */
  async verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string | undefined,
    timestampHeader: string | undefined
  ): Promise<boolean> {
    const publicKeyBase64 = process.env.TELNYX_PUBLIC_KEY;
    if (!publicKeyBase64) {
      throw new Error("TELNYX_PUBLIC_KEY no está configurada");
    }
    if (!signatureHeader || !timestampHeader) {
      return false;
    }

    try {
      const webhook = new TelnyxWebhook(publicKeyBase64);
      await webhook.verify(rawBody, {
        "telnyx-signature-ed25519": signatureHeader,
        "telnyx-timestamp": timestampHeader,
      });
      return true;
    } catch {
      return false;
    }
  }
}

function toConversationMessage(
  message: MessageListResponse
): TelnyxConversationMessage {
  return {
    role: message.role,
    text: message.text,
    createdAt: message.created_at,
    sentAt: message.sent_at,
  };
}

function toTelnyxRecording(
  data: RecordingResponseData | undefined
): TelnyxRecording {
  return {
    id: data?.id,
    callControlId: data?.call_control_id,
    callLegId: data?.call_leg_id,
    downloadUrls: data?.download_urls,
  };
}

export const telnyxAiAdapter = new TelnyxAiAdapter();
