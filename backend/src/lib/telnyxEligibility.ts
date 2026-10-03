import {
  telnyxAiAdapter,
  type TelnyxVoice,
} from "../adapters/telnyx/TelnyxAiAdapter.js";
import type { AgentSettings } from "./managedAgentPrompt.js";
import {
  IDIOMAS,
  type CodigoDeIdioma,
  type GeneroDeVoz,
  type ProveedorDeVoz,
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
 * La primera de `voces` (del catálogo, lib/idiomas/catalogo.ts, en orden de
 * preferencia) que siga en la cuenta. Si no queda ninguna, como red de
 * seguridad, otra de la cuenta del mismo género y del proveedor de la
 * primera Ultra o Soniox de la lista —de su mismo idioma si es Ultra;
 * cualquiera de Soniox, que hablan todos, pero nunca una Ultra, que no
 * habla catalán ni euskera ni gallego; ninguna de MiniMax ni de Azure, que
 * solo hablan el idioma que se les configura— o `null`: plan §3, "si no hay
 * voz compatible, el negocio no entra en Telnyx".
 */
async function resolverVozEnLaCuenta(
  voces: readonly VozDelCatalogo[],
  idioma: CodigoDeIdioma,
  genero: GeneroDeVoz
): Promise<string | null> {
  const listas = new Map<ProveedorDeVoz, Promise<TelnyxVoice[]>>();
  const deLaCuenta = (proveedor: ProveedorDeVoz) => {
    if (!listas.has(proveedor)) {
      listas.set(proveedor, telnyxAiAdapter.listVoices(proveedor));
    }
    return listas.get(proveedor)!;
  };
  for (const voz of voces) {
    const cuenta = await deLaCuenta(voz.proveedor);
    if (cuenta.some((candidata) => candidata.id === voz.id)) return voz.id;
  }
  const base = voces.find(
    (voz) => voz.proveedor === "telnyx" || voz.proveedor === "soniox"
  );
  if (!base) return null;
  const reserva = (await deLaCuenta(base.proveedor)).find(
    (candidata) =>
      (candidata.gender ?? "").toLowerCase() === GENERO_EN_TELNYX[genero] &&
      (base.proveedor === "soniox"
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
  return voces
    ? resolverVozEnLaCuenta(
        voces.filter((voz) => voz.genero === genero),
        idioma,
        genero
      )
    : null;
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
      [perfil.voz, ...perfil.alternativas],
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
