import {
  IDIOMAS,
  componerSaludo,
  hablaIdioma,
  vocesQueHablan,
  type CodigoDeIdioma,
  type GeneroDeVoz,
  type IdiomaDeRetell,
  type RefuerzoDeMiniMax,
  type VozDelCatalogo,
} from "./catalogo.js";
import {
  IDIOMA_OBLIGATORIO,
  normalizarIdiomas,
  type CambioDeIdiomas,
} from "./ajustes.js";

/** Lo que importa de AgentSettings para el idioma. */
export interface AjustesDeIdioma {
  languages: readonly CodigoDeIdioma[];
  voiceLanguage: CodigoDeIdioma;
  voiceGender: GeneroDeVoz;
  /** La voz que eligió el dueño; sin ella, la de su género. */
  voz?: string;
}

export type TranscripcionResuelta =
  { motor: "flux"; idioma: string } | { motor: "soniox"; pistas: string[] };

/** Todo lo que depende del idioma de un negocio, decidido en un solo
 * sitio. Lo consumen la elegibilidad, el payload de Telnyx, el prompt,
 * Retell y el panel. */
export interface PerfilDeIdiomas {
  /** Activos, normalizados y en orden canónico. */
  idiomas: CodigoDeIdioma[];
  /** El del saludo y el que decide la voz. */
  principal: CodigoDeIdioma;
  /** El de la voz que atiende. */
  genero: GeneroDeVoz;
  /** La voz que atiende, del catálogo; que siga en la cuenta lo comprueba
   * telnyxEligibility.ts. */
  voz: VozDelCatalogo;
  /** Las otras voces del principal y del mismo género que hablan todos
   * sus idiomas: la reserva si `voz` ya no está en la cuenta. */
  alternativas: VozDelCatalogo[];
  /** ISO del principal: `voice_settings.language` de una voz de Soniox. */
  isoDelPrincipal: string;
  /** `voice_settings.language_boost` de una voz de MiniMax. */
  refuerzoDeMiniMax: RefuerzoDeMiniMax | null;
  transcripcion: TranscripcionResuelta;
  instruccionDelPrompt: string;
  cambios: CambioDeIdiomas[];
}

/**
 * Transcripción más rápida que entiende todos los idiomas activos:
 * deepgram/flux (fin de turno nativo y anticipado) si los entiende todos, con
 * su pista si es uno o `multi` si son varios; si no, Soniox con las pistas de
 * todos, en orden canónico.
 */
function resolverTranscripcion(
  idiomas: readonly CodigoDeIdioma[]
): TranscripcionResuelta {
  const pistasDeFlux = idiomas.map(
    (idioma) => IDIOMAS[idioma].transcripcion.flux
  );
  if (pistasDeFlux.every((pista): pista is string => pista !== null)) {
    return {
      motor: "flux",
      idioma: pistasDeFlux.length === 1 ? pistasDeFlux[0] : "multi",
    };
  }
  return {
    motor: "soniox",
    pistas: idiomas.map((idioma) => IDIOMAS[idioma].transcripcion.soniox),
  };
}

/**
 * Instrucción de idioma del prompt. Con solo español, la de siempre; con
 * varios, saluda en el principal y sigue en el de quien llama. Los textos de
 * los idiomas de siempre son los mismos byte a byte: cambiarlos cambiaría el
 * hash del payload de Telnyx de esos negocios.
 */
function construirInstruccionDelPrompt(
  idiomas: readonly CodigoDeIdioma[],
  principal: CodigoDeIdioma
): string {
  if (idiomas.length === 1) {
    return `Habla siempre en ${IDIOMAS[idiomas[0]].nombreEnPrompt}; no menciones que eres una IA salvo que te lo pregunten.`;
  }
  const lista = idiomas
    .map((idioma) => IDIOMAS[idioma].nombreEnPrompt)
    .join(", ");
  const notas = idiomas
    .map((idioma) => IDIOMAS[idioma].notaParaElPrompt)
    .filter((nota): nota is string => Boolean(nota))
    .map((nota) => ` ${nota}`)
    .join("");
  return `Empieza siempre con el saludo en ${IDIOMAS[principal].nombreEnPrompt}. Tras la primera intervención de quien llama, responde y continúa exclusivamente en el idioma que use si es uno de estos: ${lista}. Si cambia entre esos idiomas, acompaña el cambio sin pedirle que elija uno.${notas} No menciones que eres una IA salvo que te lo pregunten.`;
}

/**
 * La voz que atiende: la elegida si es del principal y habla todos los
 * idiomas activos; si no, la primera de su género (o del pedido) que los
 * hable. Sustituir una elegida que no los habla se anota para avisar al
 * dueño; una de otro idioma (cambió de principal) se ignora sin más.
 */
function elegirVoz(
  principal: CodigoDeIdioma,
  idiomas: readonly CodigoDeIdioma[],
  genero: GeneroDeVoz,
  elegida: string | undefined
): {
  voz: VozDelCatalogo;
  alternativas: VozDelCatalogo[];
  cambio: CambioDeIdiomas | null;
} {
  // normalizarIdiomas garantiza que alguna voz del principal los habla.
  const candidatas = vocesQueHablan(principal, idiomas);
  const delPrincipal = IDIOMAS[principal].voces!.find(
    (voz) => voz.id === elegida
  );
  const valida = delPrincipal && candidatas.includes(delPrincipal);
  const generoBuscado = delPrincipal?.genero ?? genero;
  const voz = valida
    ? delPrincipal
    : (candidatas.find((candidata) => candidata.genero === generoBuscado) ??
      candidatas[0]);
  return {
    voz,
    alternativas: candidatas.filter(
      (candidata) => candidata !== voz && candidata.genero === voz.genero
    ),
    cambio:
      delPrincipal && !valida
        ? {
            tipo: "voz",
            de: delPrincipal,
            a: voz,
            noHabla: idiomas.find(
              (idioma) => !hablaIdioma(delPrincipal, idioma)
            )!,
          }
        : null,
  };
}

export function resolverIdiomas(ajustes: AjustesDeIdioma): PerfilDeIdiomas {
  const { languages, voiceLanguage, cambios } = normalizarIdiomas(ajustes);
  const { voz, alternativas, cambio } = elegirVoz(
    voiceLanguage,
    languages,
    ajustes.voiceGender,
    ajustes.voz
  );
  return {
    idiomas: languages,
    principal: voiceLanguage,
    genero: voz.genero,
    voz,
    alternativas,
    isoDelPrincipal: IDIOMAS[voiceLanguage].iso,
    refuerzoDeMiniMax: IDIOMAS[voiceLanguage].refuerzoDeMiniMax ?? null,
    transcripcion: resolverTranscripcion(languages),
    instruccionDelPrompt: construirInstruccionDelPrompt(
      languages,
      voiceLanguage
    ),
    cambios: cambio ? [...cambios, cambio] : cambios,
  };
}

export function saludoDelNegocio(
  perfil: Pick<PerfilDeIdiomas, "principal">,
  negocio: string
): string {
  return componerSaludo(perfil.principal, negocio);
}

// ---------------------------------------------------------------------
// Retell, el respaldo: solo tiene los idiomas con `retell.locale` (no el
// euskera) y rechaza ca-ES con su voz Cartesia por defecto.
// ---------------------------------------------------------------------

/**
 * Los ajustes tal como los atiende Retell: sin los idiomas que no tiene y,
 * si el principal es uno de ellos (euskera), con el obligatorio de
 * principal; si no, el agente saludaría en un idioma que Retell no entiende.
 */
export function ajustesParaRetell<T extends AjustesDeIdioma>(ajustes: T): T {
  const languages = ajustes.languages.filter(
    (idioma) => IDIOMAS[idioma].retell.locale !== null
  );
  const voiceLanguage = languages.includes(ajustes.voiceLanguage)
    ? ajustes.voiceLanguage
    : IDIOMA_OBLIGATORIO;
  return { ...ajustes, languages, voiceLanguage };
}

/** El campo `language` de Retell: un escalar con un solo idioma (su ruta
 * monolingüe, la más precisa) o el array con varios. */
export function idiomaDeRetell(
  idiomas: readonly CodigoDeIdioma[]
): IdiomaDeRetell | IdiomaDeRetell[] {
  const locales = idiomas
    .map((idioma) => IDIOMAS[idioma].retell.locale)
    .filter((locale): locale is IdiomaDeRetell => locale !== null);
  return locales.length === 1 ? locales[0] : locales;
}

/** ¿Hace falta la cadena de voces multilingüe de Retell (ElevenLabs)? */
export function usaVozMultilingueEnRetell(
  idiomas: readonly CodigoDeIdioma[]
): boolean {
  return idiomas.some((idioma) => IDIOMAS[idioma].retell.vozMultilingue);
}
