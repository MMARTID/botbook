import type {
  CreateTelnyxAssistantInput,
  HangupTool,
  TelnyxWebhookTool,
} from "../adapters/telnyx/TelnyxAiAdapter.js";

/**
 * Nombre estable y determinista del assistant Telnyx de un agente — permite
 * reconciliar por nombre si algún día se pierde `Agent.telnyxAssistantId`.
 */
export function buildTelnyxAssistantName(
  businessId: string,
  agentId: string
): string {
  return `alhabla-${businessId}-${agentId}`;
}

export interface TelnyxWebhookToolInput {
  name: string;
  description: string;
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  properties: Record<string, unknown>;
  required?: string[];
  headers?: Array<{ name: string; value: string }>;
  timeoutMs?: number;
}

export function toTelnyxWebhookTool(
  input: TelnyxWebhookToolInput
): TelnyxWebhookTool {
  return {
    type: "webhook",
    webhook: {
      name: input.name,
      description: input.description,
      url: input.url,
      method: input.method ?? "POST",
      body_parameters: {
        type: "object",
        properties: input.properties,
        required: input.required,
      },
      headers: input.headers,
      timeout_ms: input.timeoutMs,
    },
  };
}

/**
 * Única forma de que el assistant pueda colgar por su cuenta — mismo motivo
 * que la tool `end_call` de Retell (ver agentBootstrap.ts): sin ella la
 * llamada sigue abierta hasta que cuelga el cliente o se agota el límite de
 * duración.
 */
export function buildTelnyxHangupTool(description: string): HangupTool {
  return { type: "hangup", hangup: { description } };
}

// Cadena exacta que produce managedAgentPrompt.ts para "hora actual en la
// zona del negocio" — Retell resuelve el patrón anidado
// {{current_time_<timezone>}} de forma nativa; Telnyx no tiene ese patrón,
// pero sí su propia variable de sistema con la hora actual.
const RETELL_CURRENT_TIME_PLACEHOLDER = "{{current_time_{{zona_horaria}} }}";

/**
 * Traduce un prompt gestionado escrito con las variables nativas de Retell
 * (managedAgentPrompt.ts) a las variables de sistema de Telnyx — verificado
 * el 2026-09-12 contra la documentación oficial de Telnyx (dynamic-
 * variables): `{{call_control_id}}`, `{{telnyx_end_user_target}}`,
 * `{{telnyx_agent_target}}`, `{{telnyx_current_time}}` son variables de
 * sistema reales, resueltas por Telnyx en cada llamada. Sin esta traducción
 * el prompt le llega a Telnyx con placeholders de Retell que nunca se
 * resuelven (`{{user_number}}`, `{{current_time_{{zona_horaria}}}}`) y se
 * quedan como texto literal — encontrado el 2026-09-12 al revisar la
 * primera llamada real, no documentado en ningún sitio.
 *
 * `{{nombre_negocio}}` no es una variable de sistema de ningún proveedor —
 * es propia de Alhabla, resuelta hoy vía `retell_llm_dynamic_variables` en
 * el webhook de llamada entrante de Retell. Telnyx no tiene ese mecanismo
 * para el flujo normal (ver plan §2: sin `dynamic_variables_webhook_url`),
 * así que aquí se sustituye por el nombre real del negocio en texto plano.
 */
export function adaptManagedPromptForTelnyx(
  instructions: string,
  businessName: string
): string {
  return instructions
    .split("{{nombre_negocio}}")
    .join(businessName)
    .split("{{user_number}}")
    .join("{{telnyx_end_user_target}}")
    .split(RETELL_CURRENT_TIME_PLACEHOLDER)
    .join("{{telnyx_current_time}}");
}

export interface BuildTelnyxAssistantPayloadInput {
  businessId: string;
  agentId: string;
  /** Nombre real del negocio — sustituye a `{{nombre_negocio}}` en el
   * prompt (ver adaptManagedPromptForTelnyx). */
  businessName: string;
  /** Prompt gestionado completo (managedAgentPrompt.ts) o el prompt manual
   * del negocio — igual que `Assistant.instructions` en Retell. Se traduce
   * automáticamente a las variables de sistema de Telnyx. */
  instructions: string;
  /** Cadena vacía para que el assistant espere a que hable el cliente. */
  greeting: string;
  /** `TranscriptionSettings.language` — "es", "en", "fr" o "auto"/"multi"
   * según el modelo. Catalán queda fuera hasta pasar la matriz de Fase 0. */
  language: string;
  /** Identificador Telnyx (`Telnyx.<modelo>.<voz>`) o de ElevenLabs vía
   * `api_key_ref` — resuelto contra la API de voces de la cuenta, no fijo. */
  voice: string;
  insightGroupId?: string;
  tools?: TelnyxWebhookToolInput[];
  includeHangupTool?: boolean;
  /** Nombres de servicios/profesionales para sesgar la transcripción — mismo
   * propósito que `boostedKeywords` en syncAgentToRetell. */
  boostedKeywords?: string[];
  maxCallDurationSecs?: number;
  userIdleTimeoutSecs?: number;
}

// Mismos límites que DEFAULT_RETELL_AGENT_CONFIG (agentBootstrap.ts): una
// recepcionista de reservas no necesita más de 10 minutos, y 30s de silencio
// ya indica que el cliente colgó o dejó el teléfono descolgado.
const DEFAULT_MAX_CALL_DURATION_SECS = 10 * 60;
const DEFAULT_USER_IDLE_TIMEOUT_SECS = 30;

export function buildTelnyxAssistantPayload(
  input: BuildTelnyxAssistantPayloadInput
): CreateTelnyxAssistantInput {
  const tools: Array<TelnyxWebhookTool | HangupTool> = (
    input.tools ?? []
  ).map(toTelnyxWebhookTool);

  if (input.includeHangupTool ?? true) {
    tools.push(
      buildTelnyxHangupTool(
        "Cuelga la llamada cuando la conversación haya terminado."
      )
    );
  }

  return {
    name: buildTelnyxAssistantName(input.businessId, input.agentId),
    instructions: adaptManagedPromptForTelnyx(
      input.instructions,
      input.businessName
    ),
    greeting: input.greeting,
    // Decisión explícita del usuario 2026-09-12: sin fijar `model`, Telnyx
    // aplicaba su default de cuenta (moonshotai/Kimi-K2.6). Se probó
    // cambiar a gpt-5.6-luna esperando abaratar la llamada, pero una
    // llamada de prueba real confirmó que el bloque `ai-voice-assistant`
    // (LLM+STT+TTS) factura una TARIFA PLANA de $0.05 por minuto
    // (redondeado a bloques de 60s) sin importar el modelo — mismo coste
    // exacto con Kimi-K2.6 y con gpt-5.6-luna en llamadas de duración
    // comparable. El modelo NO afecta al coste; se mantiene gpt-5.6-luna
    // por preferencia del usuario, no por ahorro. La única palanca real de
    // coste es la duración de la llamada.
    model: "openai/gpt-5.6-luna",
    // Kimi-K2.6 como fallback: a diferencia de Gemini, es un modelo
    // alojado por Telnyx (como el propio gpt-5.6-luna) — no exige una
    // Integration Secret propia, y es el modelo ya validado con llamadas
    // reales antes de este cambio.
    fallbackConfig: { model: "moonshotai/Kimi-K2.6" },
    // 1.1x: decisión explícita del usuario 2026-09-12. Rango válido de
    // Telnyx: [0.25, 2.0], 1.0 = velocidad normal.
    voiceSettings: { voice: input.voice, voice_speed: 1.1 },
    // deepgram/flux — decisión explícita del usuario 2026-09-12: mejor
    // detección de turno de palabra (end-of-turn/eager end-of-turn) que
    // nova-3. Sigue siendo Deepgram (nativo de Telnyx, sin api_key_ref
    // propia) — no confundir con azure/fast o google/*, proveedores
    // EXTERNOS que exigen tu propia clave (Integration Secret) para
    // funcionar de verdad; sin ella se configuran sin error pero no
    // procesan audio (ver Second-Brain, Bitácora § STT: proveedores nativos
    // vs externos, y issues #18/#19 de GitHub). `keyterm` sigue soportado
    // en flux igual que en nova-3.
    transcription: {
      model: "deepgram/flux",
      language: input.language,
      settings: input.boostedKeywords?.length
        ? { keyterm: input.boostedKeywords.join(",") }
        : undefined,
    },
    telephonySettings: {
      recording_settings: {
        enabled: true,
        format: "wav",
        channels: "dual",
        stop_on_conversation_end: true,
      },
      user_idle_timeout_secs:
        input.userIdleTimeoutSecs ?? DEFAULT_USER_IDLE_TIMEOUT_SECS,
      time_limit_secs: input.maxCallDurationSecs ?? DEFAULT_MAX_CALL_DURATION_SECS,
      // Pendiente de comparar contra el audio real de Retell/Cartesia en la
      // Fase 0 (§5 del plan) — krisp es el motor documentado por defecto.
      noise_suppression: "krisp",
      // Sin este campo (verificado en vivo el 2026-09-11, NO documentado en
      // el tipo TelephonySettings del SDK) la API nunca rellena
      // ai.conversations.messages para llamadas de voz — el historial vuelve
      // vacío aunque hubiera conversación real.
      send_conversation_message_events: true,
    },
    // Verificado en vivo el 2026-09-11: Telnyx rechaza recording_settings.
    // enabled=true si data_retention=false ("Cannot enable recording when
    // data retention is disabled"). El diseño original de
    // PLAN-TELNYX-ORQUESTADOR.md ("memoria bajo control de Alhabla, sin
    // recuperación nativa de Telnyx") es incompatible con tener
    // grabación/transcripción a la vez — decisión explícita del usuario
    // 2026-09-11: igual que con Retell (dataStorageRetentionDays=30),
    // aceptar que Telnyx retenga temporalmente la conversación además de
    // que Alhabla descargue su propia copia. Duración real de esa
    // retención en Telnyx: sin confirmar todavía (no hay un campo de días
    // como en Retell, solo este booleano) — pendiente de la Fase 0.
    privacySettings: { data_retention: true },
    insightGroupId: input.insightGroupId,
    tools,
  };
}
