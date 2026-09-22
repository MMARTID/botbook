import { TelnyxWebhook } from "telnyx/lib/webhooks.js";
import { getTelnyxClient } from "../../lib/telnyx.js";
import type {
  AssistantCreateParams,
  AssistantTool,
  AssistantUpdateParams,
  HangupTool,
  InferenceEmbedding,
  InferenceEmbeddingInterruptionSettings,
  InferenceEmbeddingWebhookToolParams,
  PrivacySettings,
  TelephonySettings,
  TranscriptionSettings,
  VoiceSettings,
} from "telnyx/resources/ai/assistants/assistants.js";
import type { MessageListResponse } from "telnyx/resources/ai/conversations/messages.js";
import type { RecordingResponseData } from "telnyx/resources/recordings/recordings.js";
import type { TelnyxConversationChannel } from "telnyx/resources/ai/assistants/tests/tests.js";
import type { TestStatus } from "telnyx/resources/ai/assistants/tests/runs.js";

/** Alias legible: es el tipo real que `AssistantCreateParams.tools` exige
 * para una tool de webhook (no confundir con `WebhookTool`, la forma que
 * usa la config inline de `assistant` en Call Control). */
export type TelnyxWebhookTool = InferenceEmbeddingWebhookToolParams;
export type { HangupTool };
/** Tool nativa `transfer` de los AI Assistants (fase 4 del plan de
 * telefonía): `AssistantTool.Transfer` es la forma completa que acepta
 * `tools` (con `warm_transfer_instructions` y `voicemail_detection`), no el
 * `TransferTool` de primer nivel del SDK, que solo declara `from` y
 * `targets`. */
export type TelnyxTransferTool = AssistantTool.Transfer;

/** `send_conversation_message_events` es un campo real de la API (aparece
 * en la respuesta y la acepta en escritura) que el SDK no declara en
 * `TelephonySettings` — verificado en vivo el 2026-09-11. Sin él,
 * `ai.conversations.messages` nunca se rellena para llamadas de voz. */
type TelephonySettingsInput = TelephonySettings & {
  send_conversation_message_events?: boolean;
};

/** `interrupt_prediction_threshold` es real (confirmado contra la API en
 * vivo el 2026-09-14, un assistant ya lo devuelve) pero el SDK instalado
 * (7.17.0) todavía no lo declara en `InferenceEmbeddingInterruptionSettings`
 * — mismo patrón que `send_conversation_message_events` arriba. Gatea el
 * "barge-in" por confianza (0.0-1.0, Telnyx recomienda 0.4 de partida):
 * por debajo del umbral, un "sí"/"mmhm" del cliente no corta al agente a
 * mitad de frase. Solo con deepgram/flux — no aplica a otros modelos de STT. */
type InterruptionSettingsInput = InferenceEmbeddingInterruptionSettings & {
  interrupt_prediction_threshold?: number;
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
  /** Con deepgram/flux (modelo con turn-taking propio) solo importa
   * `start_speaking_plan.wait_seconds` de aquí — el resto de detección de
   * fin de turno vive en `transcription.settings` (eot_threshold,
   * eot_timeout_ms, eager_eot_threshold), ver telnyxAssistantPayload.ts. */
  interruptionSettings?: InterruptionSettingsInput;
  telephonySettings?: TelephonySettingsInput;
  privacySettings?: PrivacySettings;
  insightGroupId?: string;
  tools?: Array<TelnyxWebhookTool | HangupTool | TelnyxTransferTool>;
  enabledFeatures?: AssistantCreateParams["enabled_features"];
  /** `post_conversation_settings.enabled`: el assistant se invoca de nuevo
   * al terminar la llamada para las tools finales (informar_al_negocio). */
  postConversationSettings?: { enabled: boolean };
}

export interface TelnyxAssistant {
  id: string;
  name: string;
  instructions: string;
  greeting?: string;
  model?: string;
  /** Tools tal como las devuelve Telnyx (sin tipar del todo por el SDK). Las
   * lee el sync del Gestor (lib/gestorSync.ts) para saber si hay drift. */
  tools?: unknown[];
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
    interruption_settings: input.interruptionSettings,
    telephony_settings: input.telephonySettings,
    privacy_settings: input.privacySettings,
    insight_settings: input.insightGroupId
      ? { insight_group_id: input.insightGroupId }
      : undefined,
    tools: input.tools,
    enabled_features: input.enabledFeatures ?? ["telephony"],
    post_conversation_settings: input.postConversationSettings,
  };
}

function toTelnyxAssistant(response: InferenceEmbedding): TelnyxAssistant {
  return {
    id: response.id,
    name: response.name,
    instructions: response.instructions,
    greeting: response.greeting,
    model: response.model,
    tools: Array.isArray(response.tools) ? (response.tools as unknown[]) : undefined,
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
    if (input.interruptionSettings !== undefined)
      payload.interruption_settings = input.interruptionSettings;
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
    if (input.postConversationSettings !== undefined)
      payload.post_conversation_settings = input.postConversationSettings;

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
   * actualizar solo `callCostInWebhooks`/`outboundVoiceProfileId` — el
   * llamador debe reenviar los valores actuales (p. ej. leídos con
   * `getCallControlApp`). `outboundVoiceProfileId` es necesario para poder
   * originar llamadas salientes desde esta conexión (p. ej.
   * `scripts/telnyxCallHarness.ts`) — sin él, `client.calls.dial()` falla
   * con 403/D38 "Connection has no Outbound Profile assigned", ya que hasta
   * ahora esta conexión solo había recibido llamadas entrantes.
   */
  async updateCallControlApp(
    id: string,
    input: {
      name: string;
      webhookEventUrl: string;
      callCostInWebhooks?: boolean;
      outboundVoiceProfileId?: string;
    }
  ): Promise<void> {
    const client = getTelnyxClient();
    await client.callControlApplications.update(id, {
      application_name: input.name,
      webhook_event_url: input.webhookEventUrl,
      call_cost_in_webhooks: input.callCostInWebhooks,
      outbound: input.outboundVoiceProfileId
        ? { outbound_voice_profile_id: input.outboundVoiceProfileId }
        : undefined,
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

  // ---------------------------------------------------------------------
  // Insight groups — clasificación de llamadas (equivalente Telnyx del
  // post_call_analysis_data de Retell). Ver scripts/createTelnyxCallInsights.ts.
  // ---------------------------------------------------------------------

  async listInsights(): Promise<Array<{ id: string; name?: string }>> {
    const client = getTelnyxClient();
    const insights: Array<{ id: string; name?: string }> = [];
    for await (const insight of client.ai.conversations.insights.list()) {
      insights.push({ id: insight.id, name: insight.name });
    }
    return insights;
  }

  async createInsight(input: {
    name: string;
    instructions: string;
    jsonSchema: Record<string, unknown>;
  }): Promise<{ id: string }> {
    const client = getTelnyxClient();
    const response = await client.ai.conversations.insights.create({
      name: input.name,
      instructions: input.instructions,
      json_schema: input.jsonSchema,
    });
    if (!response.data?.id) {
      throw new Error("Telnyx no devolvió el id del insight creado");
    }
    return { id: response.data.id };
  }

  async assignInsightToGroup(
    insightId: string,
    groupId: string
  ): Promise<void> {
    const client = getTelnyxClient();
    await client.ai.conversations.insightGroups.insights.assign(insightId, {
      group_id: groupId,
    });
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

  /**
   * Limpia el ruido de fondo del audio de quien llama (peluquería con
   * secador, calle, música) ANTES de que llegue a STT/al assistant — mejora
   * tanto la calidad percibida como la precisión de la transcripción, no es
   * solo cosmético. Solo tiene sentido con Telnyx como orquestador de la
   * llamada (Call Control): con Retell, la limpieza de audio la controla
   * Retell, no nosotros. `direction: "inbound"` a propósito: nuestro propio
   * TTS ya sale limpio, no hace falta procesarlo también. Motor AiCoustics
   * familia "quail" — la propia documentación de Telnyx la describe como
   * optimizada para "Voice AI/STT", que es exactamente este caso de uso (a
   * diferencia de "sparrow", pensada para llamadas humano-humano).
   * BETA de Telnyx — nunca debe poder impedir que se conteste la llamada.
   */
  async startNoiseSuppression(callControlId: string): Promise<void> {
    const client = getTelnyxClient();
    await client.calls.actions.startNoiseSuppression(callControlId, {
      direction: "inbound",
      noise_suppression_engine: "AiCoustics",
      noise_suppression_engine_config: { family: "quail", size: "s" },
    });
  }

  /**
   * Origina una llamada real con un assistant ya enganchado a la pata que
   * marca — usado por `scripts/telnyxCallHarness.ts` para que un assistant
   * "cliente" simulado llame de verdad al número de un assistant real bajo
   * prueba. `webhookUrl` debe apuntar a un endpoint neutro (no al Call
   * Control App de plataforma) para que esta pata nunca dispare
   * `handleCallInitiated`: esa pata no es una llamada entrante de ningún
   * negocio, y dejar que el webhook de producción la procese confundiría el
   * enrutamiento real. `timeLimitSecs` es el guardarraíl de duración — lo
   * aplica Telnyx del lado del servidor, sin necesitar un temporizador
   * propio.
   */
  async dialWithAssistant(input: {
    connectionId: string;
    from: string;
    to: string;
    assistantId: string;
    // Override de instructions solo para ESTA llamada (soportado nativamente
    // por /calls/dial) — necesario para poder lanzar varias llamadas en
    // paralelo contra el mismo assistant "cliente" del harness sin que se
    // pisen las instrucciones entre sí (antes se reescribían con
    // updateAssistant antes de cada llamada, lo que rompía la ejecución
    // concurrente de telnyxCallBattery.ts, ver hallazgo 2026-09-14).
    instructionsOverride?: string;
    webhookUrl: string;
    timeLimitSecs: number;
    record?: boolean;
  }): Promise<{ callControlId: string; callLegId: string }> {
    const client = getTelnyxClient();
    const response = await client.calls.dial({
      connection_id: input.connectionId,
      from: input.from,
      to: input.to,
      assistant: {
        id: input.assistantId,
        instructions: input.instructionsOverride,
      },
      webhook_url: input.webhookUrl,
      time_limit_secs: input.timeLimitSecs,
      record: input.record ? "record-from-answer" : undefined,
      record_channels: input.record ? "dual" : undefined,
    });
    if (!response.data?.call_control_id || !response.data.call_leg_id) {
      throw new Error("Telnyx no devolvió call_control_id/call_leg_id al originar la llamada");
    }
    return {
      callControlId: response.data.call_control_id,
      callLegId: response.data.call_leg_id,
    };
  }

  /**
   * Origina una llamada saliente SIN assistant desde el Call Control App de
   * plataforma — hoy la usa «Comprobar desvío» (PLAN-TELEFONIA-UX.md § 4):
   * el número de Alhabla del negocio llama a su línea de clientes y, si el
   * desvío está bien, esa misma llamada vuelve a entrar por el número de
   * Alhabla. A diferencia de `dialWithAssistant`, aquí NO se pasa
   * `webhook_url`: los eventos de esta pata (`call.initiated` saliente,
   * `call.answered`, `call.hangup`) tienen que llegar al webhook de
   * plataforma con el `client_state` para que webhookHandlers.ts los
   * reconozca y los aparte de las llamadas de clientes. `timeoutSecs` es lo
   * que Telnyx espera a que contesten antes de colgar con `timeout`;
   * `timeLimitSecs` acota la duración si alguien la coge.
   */
  async dialCall(input: {
    connectionId: string;
    from: string;
    to: string;
    timeoutSecs: number;
    /** Base64 (lo exige Telnyx); viaja en cada webhook posterior de la pata. */
    clientState: string;
    timeLimitSecs?: number;
  }): Promise<{ callControlId: string; callLegId: string }> {
    const client = getTelnyxClient();
    const response = await client.calls.dial({
      connection_id: input.connectionId,
      from: input.from,
      to: input.to,
      timeout_secs: input.timeoutSecs,
      time_limit_secs: input.timeLimitSecs,
      client_state: input.clientState,
    });
    if (!response.data?.call_control_id || !response.data.call_leg_id) {
      throw new Error(
        "Telnyx no devolvió call_control_id/call_leg_id al originar la llamada"
      );
    }
    return {
      callControlId: response.data.call_control_id,
      callLegId: response.data.call_leg_id,
    };
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
  // Chat (fase 2 del plan de WhatsApp): conversaciones creadas por Alhabla
  // y turnos por `ai.assistants.chat`. Hallazgos de la fase 0.4 y del
  // 2026-09-20 en dev: la respuesta de `conversations.create` viene envuelta
  // en `data` aunque el tipo del SDK diga `Conversation`; las claves de los
  // `metadata` resuelven como variables dinámicas en las cabeceras de las
  // tools (por eso `call_control_id` en los metadata hace que las tools de
  // voz funcionen en chat sin tocarlas); `system_prompt` se acepta en el
  // update aunque el SDK no lo tipe.
  // ---------------------------------------------------------------------

  async createConversation(input: {
    name?: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string }> {
    const client = getTelnyxClient();
    const response = (await client.ai.conversations.create({
      name: input.name,
      metadata: input.metadata,
    })) as unknown as { data?: { id?: string }; id?: string };
    const id = response?.data?.id ?? response?.id;
    if (!id) {
      throw new Error("Telnyx no devolvió el id de la conversación creada");
    }
    return { id };
  }

  async updateConversation(
    conversationId: string,
    input: { metadata?: Record<string, string>; systemPrompt?: string }
  ): Promise<void> {
    const client = getTelnyxClient();
    const body: Record<string, unknown> = {};
    if (input.metadata) body.metadata = input.metadata;
    if (input.systemPrompt !== undefined) body.system_prompt = input.systemPrompt;
    await client.ai.conversations.update(
      conversationId,
      body as Parameters<typeof client.ai.conversations.update>[1]
    );
  }

  async addConversationMessage(
    conversationId: string,
    input: { role: "system" | "assistant" | "user"; content: string }
  ): Promise<void> {
    const client = getTelnyxClient();
    await client.ai.conversations.addMessage(conversationId, {
      role: input.role,
      content: input.content,
    });
  }

  /** Un turno de chat con un assistant; devuelve el texto de su respuesta. */
  async chatWithAssistant(
    assistantId: string,
    input: { content: string; conversationId: string; name?: string }
  ): Promise<string> {
    const client = getTelnyxClient();
    const response = await client.ai.assistants.chat(assistantId, {
      content: input.content,
      conversation_id: input.conversationId,
      name: input.name,
    });
    return typeof response?.content === "string" ? response.content : "";
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

  /**
   * `call.recording.saved` no trae `call_control_id` en su payload (solo
   * `call_leg_id`/`call_session_id`, verificado contra los tipos de webhook
   * del SDK) — hace falta esta vía para correlacionar la grabación con
   * nuestro `Call` cuando solo se tiene el leg. También es la única forma de
   * pedir una URL de descarga nueva cuando la del webhook ha caducado.
   *
   * El leg es el único filtro que sirve: el SDK documenta también
   * `filter[call_control_id]`, pero la API lo ignora y devuelve una lista
   * vacía (comprobado contra la cuenta real el 2026-09-17). Por eso no hay
   * un `listRecordingsByCallControlId`.
   */
  async listRecordingsByCallLegId(
    callLegId: string
  ): Promise<TelnyxRecording[]> {
    const client = getTelnyxClient();
    const recordings: TelnyxRecording[] = [];
    for await (const recording of client.recordings.list({
      filter: { call_leg_id: callLegId },
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
  // Tests nativos de assistant — equivalente Telnyx a
  // RetellAdapter.createBatchTest. `destination` decide qué assistant se
  // prueba (no hay un assistant_id en el payload): para
  // telnyxConversationChannel="phone_call" es el número Telnyx real del
  // negocio, y Telnyx llama a ese número simulando el escenario de
  // `instructions`, evaluándolo contra `rubric`. Solo cubre "crear" el test
  // (client.ai.assistants.tests.create) — disparar la ejecución
  // (tests.runs.trigger) es una llamada de prueba real y se deja para
  // cuando se pida explícitamente.
  // ---------------------------------------------------------------------

  async createAssistantTest(input: {
    name: string;
    destination: string;
    instructions: string;
    rubric: Array<{ name: string; criteria: string }>;
    telnyxConversationChannel?: TelnyxConversationChannel;
    maxDurationSeconds?: number;
    testSuite?: string;
    description?: string;
  }): Promise<{ id: string; name: string }> {
    const client = getTelnyxClient();
    const response = await client.ai.assistants.tests.create({
      name: input.name,
      destination: input.destination,
      instructions: input.instructions,
      rubric: input.rubric,
      telnyx_conversation_channel: input.telnyxConversationChannel,
      max_duration_seconds: input.maxDurationSeconds,
      test_suite: input.testSuite,
      description: input.description,
    });
    return { id: response.test_id, name: response.name };
  }

  /** Igual que `createAssistantTest` pero sobre un test ya existente —
   * permite mantener idempotente la creación de una batería (buscar por
   * `test_suite` con `listAssistantTests` y actualizar en vez de duplicar
   * si el escenario ya existe con ese nombre). */
  async updateAssistantTest(
    testId: string,
    input: {
      name?: string;
      destination?: string;
      instructions?: string;
      rubric?: Array<{ name: string; criteria: string }>;
      telnyxConversationChannel?: TelnyxConversationChannel;
      maxDurationSeconds?: number;
      testSuite?: string;
      description?: string;
    }
  ): Promise<{ id: string; name: string }> {
    const client = getTelnyxClient();
    const response = await client.ai.assistants.tests.update(testId, {
      name: input.name,
      destination: input.destination,
      instructions: input.instructions,
      rubric: input.rubric,
      telnyx_conversation_channel: input.telnyxConversationChannel,
      max_duration_seconds: input.maxDurationSeconds,
      test_suite: input.testSuite,
      description: input.description,
    });
    return { id: response.test_id, name: response.name };
  }

  /** Lista tests nativos existentes, opcionalmente filtrados por
   * `test_suite` o `destination` — usado para no crear un test duplicado
   * cada vez que se corre el script de la batería. */
  async listAssistantTests(filter?: {
    testSuite?: string;
    destination?: string;
  }): Promise<Array<{ id: string; name: string; destination?: string }>> {
    const client = getTelnyxClient();
    const results: Array<{ id: string; name: string; destination?: string }> = [];
    for await (const test of client.ai.assistants.tests.list({
      test_suite: filter?.testSuite,
      destination: filter?.destination,
    })) {
      results.push({ id: test.test_id, name: test.name, destination: test.destination });
    }
    return results;
  }

  /**
   * Dispara la ejecución real de un test nativo — Telnyx origina una
   * llamada real (o conversación web/SMS según el canal) contra
   * `destination` usando su propio agente de prueba, y evalúa la
   * conversación contra `rubric` con su propio LLM juez. A diferencia de
   * `telnyxCallBattery.ts` (que solo comprueba estado determinista en
   * nuestra BD), esto cubre la evaluación subjetiva/de calidad que ese
   * script dejaba como "REVISAR" manual — con coste real de llamada.
   */
  async triggerAssistantTestRun(
    testId: string
  ): Promise<{ runId: string; status: TestStatus }> {
    const client = getTelnyxClient();
    const response = await client.ai.assistants.tests.runs.trigger(testId);
    return { runId: response.run_id, status: response.status };
  }

  /** Consulta el resultado (posiblemente aún en curso) de una ejecución. */
  async getAssistantTestRun(
    testId: string,
    runId: string
  ): Promise<{
    runId: string;
    status: TestStatus;
    detailStatus?: Array<{ name: string; status: TestStatus }>;
    logs?: string;
  }> {
    const client = getTelnyxClient();
    const response = await client.ai.assistants.tests.runs.retrieve(runId, {
      test_id: testId,
    });
    return {
      runId: response.run_id,
      status: response.status,
      detailStatus: response.detail_status,
      logs: response.logs,
    };
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
