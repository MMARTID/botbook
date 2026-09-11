import { telnyxAiAdapter } from "../adapters/telnyx/TelnyxAiAdapter.js";
import type { AgentSettings } from "./managedAgentPrompt.js";

export interface TelnyxEligibility {
  eligible: boolean;
  status: "eligible" | "ineligible";
  reason: string | null;
  /** Identificador de voz Telnyx ya resuelto — solo presente si eligible. */
  voiceId: string | null;
}

const TELNYX_VOICE_GENDER: Record<AgentSettings["voiceGender"], string> = {
  femenina: "female",
  masculina: "male",
};

/**
 * Idioma principal usado hoy para elegir voz — es el único que
 * `AgentLanguagesSchema` obliga a tener siempre activo (managedAgentPrompt.ts).
 * La mezcla ES↔EN/FR de un negocio multilingüe es responsabilidad de la
 * matriz de idiomas de la Fase 0, no de esta elección de voz.
 */
const PRIMARY_LANGUAGE = "es-ES";

/**
 * Voz elegida a mano por el usuario en vez de dejar que se resuelva la
 * primera disponible (decisión explícita 2026-09-12: "Blanca - Graceful
 * Host", es-ES, Ultra). Se sigue verificando contra `listVoices()` antes de
 * usarla — si la cuenta deja de tenerla disponible, cae al primer match
 * como antes, nunca se asume sin comprobar.
 */
const PREFERRED_VOICE_ID: Partial<Record<AgentSettings["voiceGender"], string>> = {
  femenina: "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6",
};

/**
 * Voz Telnyx-hosted para el idioma/género pedidos: la elegida a mano si
 * sigue disponible en la cuenta, si no la primera que coincida, o `null` si
 * no hay ninguna — plan §3: "si no hay voz compatible, el negocio no entra
 * en Telnyx".
 */
export async function resolveTelnyxVoiceId(
  language: string,
  voiceGender: AgentSettings["voiceGender"]
): Promise<string | null> {
  const voices = await telnyxAiAdapter.listVoices();
  const targetGender = TELNYX_VOICE_GENDER[voiceGender];

  const preferredId = PREFERRED_VOICE_ID[voiceGender];
  if (preferredId && voices.some((voice) => voice.id === preferredId)) {
    return preferredId;
  }

  const match = voices.find(
    (voice) =>
      (voice.language ?? "").toLowerCase() === language.toLowerCase() &&
      (voice.gender ?? "").toLowerCase() === targetGender
  );
  return match?.id ?? null;
}

/**
 * Precondición para intentar crear/mantener el assistant Telnyx de un
 * negocio. No decide nada sobre `voiceRoutingTarget` (Fase 5): solo si
 * conviene intentarlo en absoluto ahora mismo.
 */
export async function resolveTelnyxEligibility(
  settings: AgentSettings
): Promise<TelnyxEligibility> {
  // Catalán: sin matriz de idiomas superada (plan Fase 0), el negocio se
  // queda en Retell sin excepciones — nunca se degrada a castellano.
  if (settings.languages.includes("ca-ES")) {
    return {
      eligible: false,
      status: "ineligible",
      reason:
        "Catalán habilitado: Telnyx no es elegible hasta pasar la matriz de idiomas de la Fase 0.",
      voiceId: null,
    };
  }

  try {
    const voiceId = await resolveTelnyxVoiceId(
      PRIMARY_LANGUAGE,
      settings.voiceGender
    );
    if (!voiceId) {
      return {
        eligible: false,
        status: "ineligible",
        reason: `Sin voz Telnyx compatible con ${PRIMARY_LANGUAGE}/${settings.voiceGender} en la cuenta.`,
        voiceId: null,
      };
    }
    return { eligible: true, status: "eligible", reason: null, voiceId };
  } catch (error) {
    return {
      eligible: false,
      status: "ineligible",
      reason: `No se pudo consultar la API de voces de Telnyx: ${
        error instanceof Error ? error.message : String(error)
      }`,
      voiceId: null,
    };
  }
}
