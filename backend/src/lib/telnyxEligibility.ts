import { telnyxAiAdapter } from "../adapters/telnyx/TelnyxAiAdapter.js";
import {
  necesitaSoniox,
  type AgentSettings,
  type VoiceLanguage,
} from "./managedAgentPrompt.js";

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
 * Voces de Soniox para los negocios con catalán, euskera o gallego: cada una
 * habla los 63 idiomas de Soniox, así que hay una por género y no por
 * idioma. Marta y Sergio, con acento español, elegidas por el usuario el
 * 2026-10-02 escuchando muestras en los cuatro idiomas.
 */
const SONIOX_VOICE_CATALOG: Record<AgentSettings["voiceGender"], string> = {
  femenina: "Soniox.tts-rt-v2.Marta",
  masculina: "Soniox.tts-rt-v2.Sergio",
};

/**
 * Voz de Soniox del género pedido: la elegida a mano si sigue en el
 * catálogo, si no la primera del mismo género, o `null` si no hay ninguna.
 */
export async function resolveSonioxVoiceId(
  voiceGender: AgentSettings["voiceGender"]
): Promise<string | null> {
  const voices = await telnyxAiAdapter.listVoices("soniox");
  const preferredId = SONIOX_VOICE_CATALOG[voiceGender];
  if (voices.some((voice) => voice.id === preferredId)) {
    return preferredId;
  }
  const match = voices.find(
    (voice) =>
      (voice.gender ?? "").toLowerCase() === TELNYX_VOICE_GENDER[voiceGender]
  );
  return match?.id ?? null;
}

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
  // Catalán, euskera o gallego: voz de Soniox, la única que los habla
  // (antes el catalán dejaba el negocio en Retell; ver necesitaSoniox).
  const soniox = necesitaSoniox(settings.languages);

  try {
    const voiceId = soniox
      ? await resolveSonioxVoiceId(settings.voiceGender)
      : await resolveTelnyxVoiceId(
          settings.voiceLanguage,
          settings.voiceGender
        );
    if (!voiceId) {
      return {
        eligible: false,
        status: "ineligible",
        reason: soniox
          ? `Sin voz Soniox ${settings.voiceGender} en la cuenta.`
          : `Sin voz Telnyx compatible con ${settings.voiceLanguage}/${settings.voiceGender} en la cuenta.`,
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
