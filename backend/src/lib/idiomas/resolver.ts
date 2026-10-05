import {
  IDIOMAS,
  componerSaludo,
  cooficialActiva,
  esCooficial,
  familiaDeVoces,
  hablaIdioma,
  vocesQueHablan,
  type CodigoDeIdioma,
  type FamiliaDeVoces,
  type GeneroDeVoz,
  type IdiomaDeRetell,
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
  /** El idioma en que saluda (el nombre del campo es el de siempre). */
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
  /** El idioma en que saluda. */
  principal: CodigoDeIdioma;
  /** La lengua cooficial activa (como mucho una), o null. */
  cooficial: CodigoDeIdioma | null;
  /** De dónde sale la voz: las de Soniox de la cooficial activa o, sin
   * ella, las Ultra nativas del idioma del saludo (familiaDeVoces). */
  familia: FamiliaDeVoces;
  /** El de la voz que atiende. */
  genero: GeneroDeVoz;
  /** La voz que atiende, del catálogo; que siga en la cuenta lo comprueba
   * telnyxEligibility.ts. */
  voz: VozDelCatalogo;
  /** Las voces que se pueden elegir con estos idiomas: las de la familia
   * que los hablan todos, en el orden del catálogo. */
  voces: VozDelCatalogo[];
  /** Las otras voces de la familia y del mismo género que hablan todos sus
   * idiomas: la reserva si `voz` ya no está en la cuenta. */
  alternativas: VozDelCatalogo[];
  /** `voice_settings.language` de una voz de Soniox: el ISO de la
   * cooficial activa, no el del saludo. Así un negocio que saluda en
   * castellano con catalán activo sigue leyendo bien el catalán (las
   * respuestas en castellano con `language: "ca"` funcionaron en las 37
   * llamadas reales del 2026-10-03). Sin cooficial, el del saludo (las
   * Ultra no lo usan). */
  isoDeLaVoz: string;
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
 * varios, saluda en el del saludo y sigue en el de quien llama (también con
 * saludo en español y una cooficial activa: «Empieza siempre con el saludo
 * en español de España…»). Los textos de los idiomas de siempre son los
 * mismos byte a byte: cambiarlos cambiaría el hash del payload de Telnyx de
 * esos negocios.
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
 * La voz que atiende, entre `voces` (las de la familia que atiende): la
 * elegida si está entre ellas y habla todos los idiomas activos; si no, la
 * primera de su género (o del pedido) que los hable. Sustituir una elegida
 * que no los habla se anota para avisar al dueño; una de otra familia
 * (cambió el saludo o la cooficial) se ignora sin más: el panel ya enseña
 * las voces que atienden. Pura y con la lista como parámetro para poder
 * probarla con voces que el catálogo aún no tiene.
 */
export function elegirVoz(
  voces: readonly VozDelCatalogo[],
  idiomas: readonly CodigoDeIdioma[],
  genero: GeneroDeVoz,
  elegida: string | undefined
): {
  voz: VozDelCatalogo;
  alternativas: VozDelCatalogo[];
  cambio: CambioDeIdiomas | null;
} {
  // normalizarIdiomas garantiza que alguna voz de la familia los habla.
  const candidatas = vocesQueHablan(voces, idiomas);
  const deLaFamilia = voces.find((voz) => voz.id === elegida);
  const valida = deLaFamilia && candidatas.includes(deLaFamilia);
  const generoBuscado = deLaFamilia?.genero ?? genero;
  const voz = valida
    ? deLaFamilia
    : (candidatas.find((candidata) => candidata.genero === generoBuscado) ??
      candidatas[0]);
  return {
    voz,
    alternativas: candidatas.filter(
      (candidata) => candidata !== voz && candidata.genero === voz.genero
    ),
    cambio:
      deLaFamilia && !valida
        ? {
            tipo: "voz",
            de: deLaFamilia,
            a: voz,
            noHabla: idiomas.find(
              (idioma) => !hablaIdioma(deLaFamilia, idioma)
            )!,
          }
        : null,
  };
}

export function resolverIdiomas(ajustes: AjustesDeIdioma): PerfilDeIdiomas {
  const { languages, voiceLanguage, cambios } = normalizarIdiomas(ajustes);
  const familia = familiaDeVoces(voiceLanguage, languages);
  const { voz, alternativas, cambio } = elegirVoz(
    familia.voces,
    languages,
    ajustes.voiceGender,
    ajustes.voz
  );
  return {
    idiomas: languages,
    principal: voiceLanguage,
    cooficial: cooficialActiva(languages),
    familia: familia.familia,
    genero: voz.genero,
    voz,
    voces: vocesQueHablan(familia.voces, languages),
    alternativas,
    isoDeLaVoz: IDIOMAS[familia.idioma].iso,
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
 * si saluda en uno de ellos (euskera), saludando en el obligatorio; si no,
 * el agente saludaría en un idioma que Retell no entiende. Un saludo en
 * castellano con catalán activo o uno extranjero se quedan como están.
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

/**
 * ¿Hace falta la cadena de voces multilingüe de Retell (ElevenLabs)? Sí si
 * saluda en un idioma que no es el obligatorio (las voces Cartesia por
 * defecto son españolas), si hay una lengua cooficial activa o si algún
 * idioma la exige (Retell rechaza ca-ES con Cartesia). Recibe los ajustes
 * de ajustesParaRetell: el euskera ya no está.
 */
export function usaVozMultilingueEnRetell(
  idiomas: readonly CodigoDeIdioma[],
  saludo: CodigoDeIdioma = IDIOMA_OBLIGATORIO
): boolean {
  return (
    saludo !== IDIOMA_OBLIGATORIO ||
    idiomas.some(
      (idioma) => esCooficial(idioma) || IDIOMAS[idioma].retell.vozMultilingue
    )
  );
}
