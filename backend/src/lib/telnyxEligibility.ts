import { telnyxAiAdapter } from "../adapters/telnyx/TelnyxAiAdapter.js";
import type { AgentSettings, VoiceLanguage } from "./managedAgentPrompt.js";

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
 * Voces Telnyx Ultra elegidas a mano por idioma/género (decisión explícita
 * del usuario 2026-09-14: "todas la voz ultra de telnyx" para es/en/fr) en
 * vez de dejar que se resuelva la primera disponible por orden de API —
 * "Blanca - Graceful Host" (es-ES/femenina) ya estaba en uso desde
 * 2026-09-12, el resto son nuevas. Nombres elegidos por tono profesional y
 * cercano, coherente entre los tres idiomas. Se sigue verificando contra
 * `listVoices()` antes de usarlas — si la cuenta deja de tener alguna
 * disponible, cae al primer match por idioma/género como red de seguridad.
 */
const TELNYX_VOICE_CATALOG: Record<
  VoiceLanguage,
  Record<AgentSettings["voiceGender"], string>
> = {
  "es-ES": {
    femenina: "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6", // Blanca - Graceful Host
    masculina: "Telnyx.Ultra.13ff5deb-2591-42ad-a356-63a04e524411", // Marcos - Steady Advisor
  },
  "en-GB": {
    femenina: "Telnyx.Ultra.2f251ac3-89a9-4a77-a452-704b474ccd01", // Lucy - Capable Coordinator
    masculina: "Telnyx.Ultra.4bc3cb8c-adb9-4bb8-b5d5-cbbef950b991", // George - Composed Consultant
  },
  "fr-FR": {
    femenina: "Telnyx.Ultra.c96a7d7d-3457-4979-8665-522f7b3e36fb", // Léa - Logical Liaison
    masculina: "Telnyx.Ultra.7345dfa5-ee04-44d2-abf4-29262b880ab4", // Laurent - Dependable Anchor
  },
};

/**
 * Voz Telnyx-hosted para el idioma/género pedidos: la elegida a mano si
 * sigue disponible en la cuenta, si no la primera que coincida, o `null` si
 * no hay ninguna — plan §3: "si no hay voz compatible, el negocio no entra
 * en Telnyx".
 */
export async function resolveTelnyxVoiceId(
  voiceLanguage: VoiceLanguage,
  voiceGender: AgentSettings["voiceGender"]
): Promise<string | null> {
  const voices = await telnyxAiAdapter.listVoices();
  const targetGender = TELNYX_VOICE_GENDER[voiceGender];

  const preferredId = TELNYX_VOICE_CATALOG[voiceLanguage][voiceGender];
  if (voices.some((voice) => voice.id === preferredId)) {
    return preferredId;
  }

  const match = voices.find(
    (voice) =>
      (voice.language ?? "").toLowerCase() === voiceLanguage.toLowerCase() &&
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
      settings.voiceLanguage,
      settings.voiceGender
    );
    if (!voiceId) {
      return {
        eligible: false,
        status: "ineligible",
        reason: `Sin voz Telnyx compatible con ${settings.voiceLanguage}/${settings.voiceGender} en la cuenta.`,
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
