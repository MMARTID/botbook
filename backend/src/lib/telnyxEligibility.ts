import { telnyxAiAdapter } from "../adapters/telnyx/TelnyxAiAdapter.js";
import type { AgentSettings } from "./managedAgentPrompt.js";
import {
  IDIOMAS,
  type CodigoDeIdioma,
  type GeneroDeVoz,
  type VozDelCatalogo,
} from "./idiomas/catalogo.js";
import { resolverIdiomas } from "./idiomas/resolver.js";

export interface TelnyxEligibility {
  eligible: boolean;
  status: "eligible" | "ineligible";
  reason: string | null;
  /** Identificador de voz Telnyx ya resuelto — solo presente si eligible. */
  voiceId: string | null;
}

const GENERO_EN_TELNYX: Record<GeneroDeVoz, string> = {
  femenina: "female",
  masculina: "male",
};

/**
 * La voz del catálogo (lib/idiomas/catalogo.ts) si sigue en la cuenta; si
 * no, otra del mismo proveedor y género como red de seguridad —de su mismo
 * idioma si es Ultra; cualquiera de Soniox, que hablan todos, pero nunca
 * una Ultra, que no habla catalán ni euskera ni gallego— o `null`: plan §3,
 * "si no hay voz compatible, el negocio no entra en Telnyx".
 */
async function resolverVozEnLaCuenta(
  voz: VozDelCatalogo,
  idioma: CodigoDeIdioma,
  genero: GeneroDeVoz
): Promise<string | null> {
  const voces = await telnyxAiAdapter.listVoices(voz.proveedor);
  if (voces.some((candidata) => candidata.id === voz.id)) {
    return voz.id;
  }
  const reserva = voces.find(
    (candidata) =>
      (candidata.gender ?? "").toLowerCase() === GENERO_EN_TELNYX[genero] &&
      (voz.proveedor === "soniox"
        ? candidata.id.startsWith("Soniox.")
        : (candidata.language ?? "").toLowerCase() === idioma.toLowerCase())
  );
  return reserva?.id ?? null;
}

/** Voz de la cuenta para un idioma principal y género, o `null`. */
export async function resolveTelnyxVoiceId(
  idioma: CodigoDeIdioma,
  genero: GeneroDeVoz
): Promise<string | null> {
  const voces = IDIOMAS[idioma].voces;
  return voces ? resolverVozEnLaCuenta(voces[genero], idioma, genero) : null;
}

/**
 * Precondición para intentar crear/mantener el assistant Telnyx de un
 * negocio. No decide nada sobre `voiceRoutingTarget` (Fase 5): solo si
 * conviene intentarlo en absoluto ahora mismo. La voz la decide el idioma
 * principal (resolverIdiomas): Ultra para español, Soniox para catalán,
 * euskera y gallego. Antes el catalán dejaba el negocio en Retell.
 */
export async function resolveTelnyxEligibility(
  settings: AgentSettings
): Promise<TelnyxEligibility> {
  const perfil = resolverIdiomas(settings);

  try {
    const voiceId = await resolverVozEnLaCuenta(
      perfil.voz,
      perfil.principal,
      perfil.genero
    );
    if (!voiceId) {
      return {
        eligible: false,
        status: "ineligible",
        reason:
          perfil.voz.proveedor === "soniox"
            ? `Sin voz Soniox ${perfil.genero} en la cuenta.`
            : `Sin voz Telnyx compatible con ${perfil.principal}/${perfil.genero} en la cuenta.`,
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
