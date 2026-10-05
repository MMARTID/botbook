import {
  IDIOMAS,
  componerSaludo,
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
  ordenarIdiomas,
  type CambioDeIdiomas,
} from "./ajustes.js";

/** Lo que importa de AgentSettings para el idioma. */
export interface AjustesDeIdioma {
  /** Los que habla. Desde el 2026-10-05 salen del principal: solo cuentan
   * para leer ajustes anteriores (normalizarIdiomas). */
  languages?: readonly CodigoDeIdioma[];
  /** El idioma principal (el nombre del campo es el de siempre). */
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
  /** Los que habla con su principal (idiomasQueHabla), en orden canónico. */
  idiomas: CodigoDeIdioma[];
  /** El idioma principal: en él saluda y de él sale la voz. */
  principal: CodigoDeIdioma;
  /** El principal si es una lengua cooficial, o null. */
  cooficial: CodigoDeIdioma | null;
  /** De dónde sale la voz: las de Soniox de un principal cooficial o, si
   * no, las Ultra nativas del principal (familiaDeVoces). */
  familia: FamiliaDeVoces;
  /** El de la voz que atiende. */
  genero: GeneroDeVoz;
  /** La voz que atiende, del catálogo; que siga en la cuenta lo comprueba
   * telnyxEligibility.ts. */
  voz: VozDelCatalogo;
  /** Las voces que se pueden elegir: las de la familia que hablan todos
   * sus idiomas, en el orden del catálogo. */
  voces: VozDelCatalogo[];
  /** Las otras voces de la familia y del mismo género que hablan todos sus
   * idiomas: la reserva si `voz` ya no está en la cuenta. */
  alternativas: VozDelCatalogo[];
  /** `voice_settings.language` de una voz de Soniox: el ISO del principal,
   * la cooficial (las respuestas en castellano con `language: "ca"`
   * funcionaron en las 37 llamadas reales del 2026-10-03). Las Ultra no lo
   * usan. */
  isoDeLaVoz: string;
  transcripcion: TranscripcionResuelta;
  instruccionDelPrompt: string;
  /** El bloque «## Idioma» que cierra el prompt (instruccionesDeIdioma), o
   * null si habla un solo idioma. */
  recordatorioDelPrompt: string | null;
  cambios: CambioDeIdiomas[];
}

/**
 * Transcripción más rápida que entiende todos los idiomas que habla:
 * deepgram/flux (fin de turno nativo y anticipado) si los entiende todos, con
 * su pista si es uno o `multi` si son varios (con un principal Ultra, los
 * siete de ULTRA_HABLA). Si no (un principal cooficial), Soniox con dos
 * pistas, la del principal y la del obligatorio, en orden canónico: con las
 * de los ocho que habla, el error de palabra se duplicó (9,5 % frente a
 * 4,7 %, tandas A3 y A4 del laboratorio, 2026-10-05) sin contestar antes, y
 * arrastraba palabras a otros idiomas («metxes» → «metges», «tints» →
 * «teen»). Que con dos entienda el inglés u otros idiomas no está medido.
 */
function resolverTranscripcion(
  idiomas: readonly CodigoDeIdioma[],
  principal: CodigoDeIdioma
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
    pistas: ordenarIdiomas([IDIOMA_OBLIGATORIO, principal]).map(
      (idioma) => IDIOMAS[idioma].transcripcion.soniox
    ),
  };
}

/**
 * Lo que dice el prompt del idioma: la instrucción de «## Rol» (saluda en el
 * principal y sigue en el de quien llama si es uno de los que habla; desde
 * el 2026-10-05, siempre varios: los siete de ULTRA_HABLA más la cooficial
 * que sea principal) y un recordatorio que cierra el prompt. Con uno solo,
 * la de antes («Habla siempre en…») y sin recordatorio: es lo que recibe
 * Retell con solo español (ajustesParaRetell).
 *
 * El recordatorio y la frase de las comillas vienen de la medición del
 * 2026-10-05 (tanda «A2 inglés» del laboratorio): con la regla sola, la
 * recepcionista contestó en castellano a clientes que hablaban inglés en 5
 * de 19 respuestas, sobre todo en las frases que el prompt le da literales
 * en castellano (la pregunta del WhatsApp). Sin medir de nuevo con él.
 */
export function instruccionesDeIdioma(
  idiomas: readonly CodigoDeIdioma[],
  principal: CodigoDeIdioma
): { instruccion: string; recordatorio: string | null } {
  if (idiomas.length === 1) {
    return {
      instruccion: `Habla siempre en ${IDIOMAS[idiomas[0]].nombreEnPrompt}; no menciones que eres una IA salvo que te lo pregunten.`,
      recordatorio: null,
    };
  }
  const lista = idiomas
    .map((idioma) => IDIOMAS[idioma].nombreEnPrompt)
    .join(", ");
  const notas = idiomas
    .map((idioma) => IDIOMAS[idioma].notaParaElPrompt)
    .filter((nota): nota is string => Boolean(nota))
    .map((nota) => ` ${nota}`)
    .join("");
  return {
    instruccion: `Empieza siempre con el saludo en ${IDIOMAS[principal].nombreEnPrompt}. Tras la primera intervención de quien llama, responde y continúa exclusivamente en el idioma que use si es uno de estos: ${lista}. Si cambia entre esos idiomas, acompaña el cambio sin pedirle que elija uno. Las frases que estas instrucciones ponen entre comillas para decírselas a quien llama están en castellano: dilas traducidas al idioma de la conversación.${notas} No menciones que eres una IA salvo que te lo pregunten.`,
    recordatorio: `## Idioma\nContesta cada turno en el idioma en que te habla quien llama si es uno de estos: ${lista}; también el resumen de la reserva, la pregunta del WhatsApp y la despedida. No cambies de idioma por tu cuenta mientras siga hablando en el suyo.`,
  };
}

/**
 * La voz que atiende, entre `voces` (las de su principal): la elegida si
 * está entre ellas y habla todos sus idiomas; si no, la primera de su
 * género (o del pedido) que los hable. Sustituir una elegida que no los
 * habla se anota para avisar al dueño; una de otra familia (cambió el
 * principal) se ignora sin más: el panel ya enseña las voces que atienden.
 * Pura y con la lista como parámetro para poder probarla con voces que el
 * catálogo aún no tiene.
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
  // Con el catálogo actual alguna voz de cada principal habla todos sus
  // idiomas (lo vigila tests/lib/idiomas/catalogo.test.ts); si no, atiende
  // igual la primera de la familia.
  const habladoras = vocesQueHablan(voces, idiomas);
  const candidatas = habladoras.length > 0 ? habladoras : [...voces];
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
  const familia = familiaDeVoces(voiceLanguage);
  const { voz, alternativas, cambio } = elegirVoz(
    familia.voces,
    languages,
    ajustes.voiceGender,
    ajustes.voz
  );
  const instrucciones = instruccionesDeIdioma(languages, voiceLanguage);
  return {
    idiomas: languages,
    principal: voiceLanguage,
    cooficial: esCooficial(voiceLanguage) ? voiceLanguage : null,
    familia: familia.familia,
    genero: voz.genero,
    voz,
    voces: vocesQueHablan(familia.voces, languages),
    alternativas,
    isoDeLaVoz: IDIOMAS[voiceLanguage].iso,
    transcripcion: resolverTranscripcion(languages, voiceLanguage),
    instruccionDelPrompt: instrucciones.instruccion,
    recordatorioDelPrompt: instrucciones.recordatorio,
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
 * Los ajustes tal como los atiende Retell: el principal y el obligatorio, no
 * los siete u ocho que habla en Telnyx, y sin los idiomas que Retell no
 * tiene; si el principal es uno de ellos (euskera), el obligatorio de
 * principal, o el agente saludaría en un idioma que Retell no entiende.
 *
 * Así recibe lo que ya tenía antes del 2026-10-05: `es-ES` solo (su ruta
 * monolingüe, la más precisa, con la voz Cartesia) con principal español, y
 * español con la cooficial (cadena ElevenLabs). Mandarle los siete locales
 * con Cartesia no se ha probado contra Retell, y si rechazara el
 * `updateAgent`, `syncAgentToRetell` lanzaría y PATCH /business/me
 * devolvería 500 a todos los negocios (revisión del 2026-10-05). El prompt
 * de Retell lista estos mismos idiomas (`idiomas` de
 * buildManagedAgentPrompt).
 */
export function ajustesParaRetell<T extends AjustesDeIdioma>(
  ajustes: T
): T & { languages: CodigoDeIdioma[]; voiceLanguage: CodigoDeIdioma } {
  const { voiceLanguage: principal } = normalizarIdiomas(ajustes);
  const voiceLanguage =
    IDIOMAS[principal].retell.locale !== null ? principal : IDIOMA_OBLIGATORIO;
  return {
    ...ajustes,
    languages: ordenarIdiomas([IDIOMA_OBLIGATORIO, voiceLanguage]),
    voiceLanguage,
  };
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
 * el principal no es el obligatorio (las voces Cartesia por defecto son
 * españolas), si habla una lengua cooficial o si algún idioma la exige
 * (Retell rechaza ca-ES con Cartesia). Recibe los ajustes de
 * ajustesParaRetell: el euskera ya no está.
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
