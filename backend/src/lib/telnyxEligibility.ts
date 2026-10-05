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
import {
  ACENTO_EN_TELNYX,
  EXCLUSIONES_DE_VOCES,
  LOCALE_EN_TELNYX,
} from "./idiomas/curacionDeVoces.js";
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

const PREFIJO_ULTRA = "Telnyx.Ultra.";

/** Cómo lista Telnyx un idioma (`language` de listVoices), el acento que
 * se exige, si alguno, y las voces que la curación deja fuera: las nativas
 * de alemán, italiano y neerlandés vienen sin región («de», «it», «nl») y
 * en español solo valen las de España (las Ultra es-ES traen «Castilian»).
 * Las de otros modelos (KokoroTTS…) también vienen en es-ES, sin acento:
 * las descarta el prefijo Ultra, no el acento. */
function enTelnyx(idioma: CodigoDeIdioma): {
  locale: string;
  acento?: string;
  excluidas: ReadonlySet<string>;
} {
  const locales: Partial<Record<CodigoDeIdioma, string>> = LOCALE_EN_TELNYX;
  const acentos: Partial<Record<CodigoDeIdioma, string>> = ACENTO_EN_TELNYX;
  const exclusiones: Partial<
    Record<CodigoDeIdioma, Readonly<Record<string, string>>>
  > = EXCLUSIONES_DE_VOCES;
  return {
    locale: locales[idioma] ?? idioma,
    acento: acentos[idioma],
    excluidas: new Set(Object.keys(exclusiones[idioma] ?? {})),
  };
}

/**
 * La primera de `voces` (del catálogo, lib/idiomas/catalogo.ts, en orden de
 * preferencia) que siga en la cuenta. Si no queda ninguna, como red de
 * seguridad, otra de la cuenta del mismo género, vigente y del proveedor
 * de la primera de la lista —si es Ultra, otra Ultra de su mismo idioma
 * (y acento, en español) que la curación no excluya: nunca una de otro
 * modelo (KokoroTTS…), que solo habla su idioma; si es de Soniox,
 * cualquiera de Soniox, que hablan todos, pero nunca una Ultra, que no
 * habla catalán ni euskera ni gallego— o `null`: plan §3, "si no hay voz
 * compatible, el negocio no entra en Telnyx".
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
  const base = voces[0];
  if (!base) return null;
  const { locale, acento, excluidas } = enTelnyx(idioma);
  const reserva = (await deLaCuenta(base.proveedor)).find(
    (candidata) =>
      (candidata.gender ?? "").toLowerCase() === GENERO_EN_TELNYX[genero] &&
      !candidata.deprecated &&
      (base.proveedor === "soniox"
        ? candidata.id.startsWith("Soniox.")
        : candidata.id.startsWith(PREFIJO_ULTRA) &&
          !excluidas.has(candidata.id) &&
          (candidata.language ?? "").toLowerCase() === locale.toLowerCase() &&
          (!acento || !candidata.accent || candidata.accent === acento))
  );
  return reserva?.id ?? null;
}

/** Voz de la cuenta para las voces de un idioma y un género, o `null`. */
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
 * conviene intentarlo en absoluto ahora mismo. La voz la decide
 * resolverIdiomas: Soniox con un principal cooficial (catalán, euskera o
 * gallego); si no, las Ultra nativas del principal. Antes el
 * catalán dejaba el negocio en Retell.
 */
export async function resolveTelnyxEligibility(
  settings: AgentSettings
): Promise<TelnyxEligibility> {
  const perfil = resolverIdiomas(settings);

  try {
    // Con un principal que no es cooficial, las voces son sus Ultra: ese
    // es el idioma de la reserva (con Soniox no se mira).
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
