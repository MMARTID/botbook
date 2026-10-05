/**
 * Catálogo único de los idiomas de la recepcionista. Todo lo que depende
 * del idioma —voz, transcripción, saludo, prompt, Retell y panel— sale de
 * aquí a través de resolverIdiomas (resolver.ts): ningún otro módulo
 * guarda listas de idiomas ni decide por su cuenta. Módulo puro: sin E/S ni
 * dependencias de adapters.
 *
 * Añadir un idioma: su código al final de CODIGOS_DE_IDIOMA, su entrada en
 * IDIOMAS y ofrecerlo en un mercado (MERCADOS). Los tests de invariantes
 * (tests/lib/idiomas/catalogo.test.ts) fallan si le falta algo.
 *
 * Datos de partida (AGENTS.md § «Idiomas de atención y voz en Telnyx»):
 * ninguna voz Ultra ni deepgram/flux cubre catalán, euskera ni gallego;
 * Soniox sí (63 idiomas por voz). Con llamadas reales (2026-10-03), la voz
 * apenas cambia la espera; lo que la alarga es la transcripción sin flux.
 * Solo la síntesis de la Ultra va incluida en el precio del assistant: las
 * demás se cobran por carácter (facturación del 2026-10-03).
 *
 * El dueño solo elige el idioma principal (`voiceLanguage`) y la voz
 * (decisión del usuario del 2026-10-05, «nos hemos complicado»): en él
 * saluda y de él salen la voz y los idiomas que habla (idiomasQueHabla).
 * Con un principal cooficial (catalán, euskera, gallego) atienden las voces
 * de Soniox de esa lengua; con cualquier otro, sus Ultra nativas
 * (familiaDeVoces).
 */
import { VOCES_ULTRA } from "./vocesUltra.js";
import type { IdiomaConVocesUltra } from "./curacionDeVoces.js";

/**
 * Orden canónico de los idiomas. Los seis primeros no se mueven: alimentan,
 * en este orden, las pistas de transcripción, el array de idiomas de
 * Retell, la lista del prompt y el JSON guardado, y cambiarlo cambiaría el
 * hash del payload de Telnyx de todos los negocios multilingües. Los nuevos
 * van al final.
 */
export const CODIGOS_DE_IDIOMA = [
  "es-ES",
  "en-GB",
  "fr-FR",
  "ca-ES",
  "eu-ES",
  "gl-ES",
  "de-DE",
  "it-IT",
  "pt-PT",
  "nl-NL",
] as const;

export type CodigoDeIdioma = (typeof CODIGOS_DE_IDIOMA)[number];

export const GENEROS_DE_VOZ = ["femenina", "masculina"] as const;

export type GeneroDeVoz = (typeof GENEROS_DE_VOZ)[number];

/** Los locales de `IdiomaDelCatalogo.retell` que acepta Retell (su SDK
 * los enumera; el euskera no está). */
export type IdiomaDeRetell =
  | "es-ES"
  | "en-GB"
  | "fr-FR"
  | "ca-ES"
  | "gl-ES"
  | "de-DE"
  | "it-IT"
  | "pt-PT"
  | "nl-NL";

/** Proveedores de las voces del catálogo, como los nombra Telnyx al
 * listarlas (`listVoices`). Las de Azure y MiniMax se retiraron el
 * 2026-10-05 (se cobran aparte por carácter). */
export type ProveedorDeVoz = "telnyx" | "soniox";

export interface VozDelCatalogo {
  /** Identificador de Telnyx: `Telnyx.Ultra.<uuid>` o
   * `Soniox.tts-rt-v2.<Nombre>`. */
  id: string;
  proveedor: ProveedorDeVoz;
  /** Nombre visible, único dentro de su idioma. */
  nombre: string;
  genero: GeneroDeVoz;
  /** Cómo suena, en español y en 2–5 palabras: lo enseña el panel. No
   * entra en el payload. */
  descripcion: string;
  /** De atención al cliente: el panel la enseña sin desplegar «Ver todas
   * las voces». No entra en el payload. */
  recomendada: boolean;
  /** Idiomas que pronuncia bien (escuchados en el laboratorio de voces).
   * Las de Soniox hablan cualquiera y arrancan en el de
   * `voice_settings.language`; las Ultra, los de ULTRA_HABLA. La voz que
   * atiende tiene que hablar todos los que habla su principal
   * (idiomasQueHabla). */
  habla: "todos" | readonly CodigoDeIdioma[];
}

export interface IdiomaDelCatalogo {
  /** ISO 639-1: pistas de Soniox y `voice_settings.language`. */
  iso: string;
  /** Cómo lo nombra el prompt: «… si es uno de estos: catalán, …». */
  nombreEnPrompt: string;
  /** Cómo lo ve el dueño en el panel. */
  etiqueta: string;
  /** Saludo al descolgar cuando saluda en este idioma; `{negocio}` es el
   * nombre del negocio. */
  saludo: string;
  /** Pista de cada motor de transcripción de Telnyx, o null si no lo
   * entiende. flux es el rápido (fin de turno anticipado); Soniox entiende
   * todos. */
  transcripcion: { flux: string | null; soniox: string };
  /** Locale de Retell (el respaldo), o null si no lo tiene; y si exige la
   * cadena de voces multilingüe (Retell rechaza ca-ES con Cartesia). */
  retell: { locale: IdiomaDeRetell | null; vozMultilingue: boolean };
  /** Lengua cooficial (catalán, euskera, gallego): ninguna Ultra la habla,
   * así que solo es principal, con sus voces de Soniox (que arrancan en
   * ella: `voice_settings.language`), y solo así la habla la
   * recepcionista. */
  cooficial: boolean;
  /** Voces de este idioma, en orden de preferencia: por género, la de por
   * defecto primero (sin elección, atiende la primera de su género), luego
   * las recomendadas y luego el resto. Atienden cuando es el principal. Sin
   * voces, el idioma no puede ser principal. */
  voces: readonly VozDelCatalogo[] | null;
  /** Frase extra del prompt mientras la recepcionista lo habla. */
  notaParaElPrompt?: string;
}

/**
 * Lo que habla cualquier voz Ultra: su idioma y los extranjeros que se
 * ofrecen (alemán, italiano, portugués y neerlandés, aprobados de oído por
 * el usuario el 2026-10-03 en el laboratorio de voces). Ni catalán, ni
 * euskera, ni gallego. Desde el 2026-10-05 la recepcionista los habla
 * todos, sea cual sea el principal (idiomasQueHabla).
 */
export const ULTRA_HABLA = [
  "es-ES",
  "en-GB",
  "fr-FR",
  "de-DE",
  "it-IT",
  "pt-PT",
  "nl-NL",
] as const;

/**
 * Las voces Ultra nativas de un idioma, de vocesUltra.ts (generado por
 * scripts/generarVocesUltra.ts con la API de Telnyx y la curación a mano
 * de curacionDeVoces.ts; decisión del usuario del 2026-10-05). En español,
 * las 29 de España, con Blanca («Graceful Host», desde el 2026-09-12) y
 * Marcos primeras de su género: son las de siempre y cambiarlas cambiaría
 * el payload de Telnyx de todos los negocios que no han elegido voz.
 */
const ultra = (idioma: IdiomaConVocesUltra): VozDelCatalogo[] =>
  VOCES_ULTRA[idioma].map((voz) => ({
    ...voz,
    proveedor: "telnyx",
    habla: ULTRA_HABLA,
  }));

/**
 * Voces de Soniox: cada una habla los 63 idiomas de Soniox, así que son las
 * de catalán, euskera y gallego (atienden también el español, el inglés o
 * el alemán de quien llama). Marta y Sergio, con acento español, elegidas
 * por el usuario el 2026-10-02 escuchando muestras.
 */
const MARTA: VozDelCatalogo = {
  id: "Soniox.tts-rt-v2.Marta",
  proveedor: "soniox",
  nombre: "Marta",
  genero: "femenina",
  descripcion: "Cercana y natural",
  recomendada: true,
  habla: "todos",
};
const SERGIO: VozDelCatalogo = {
  id: "Soniox.tts-rt-v2.Sergio",
  proveedor: "soniox",
  nombre: "Sergio",
  genero: "masculina",
  descripcion: "Cercano y natural",
  recomendada: true,
  habla: "todos",
};

export const IDIOMAS: Record<CodigoDeIdioma, IdiomaDelCatalogo> = {
  "es-ES": {
    iso: "es",
    nombreEnPrompt: "español de España",
    etiqueta: "Español",
    saludo: "Hola, gracias por llamar a {negocio}. ¿En qué te puedo ayudar?",
    transcripcion: { flux: "es", soniox: "es" },
    retell: { locale: "es-ES", vozMultilingue: false },
    cooficial: false,
    voces: ultra("es-ES"),
  },
  "en-GB": {
    iso: "en",
    nombreEnPrompt: "inglés",
    etiqueta: "Inglés",
    saludo: "Hello, thank you for calling {negocio}. How can I help you?",
    transcripcion: { flux: "en", soniox: "en" },
    retell: { locale: "en-GB", vozMultilingue: false },
    cooficial: false,
    voces: ultra("en-GB"),
  },
  "fr-FR": {
    iso: "fr",
    nombreEnPrompt: "francés",
    etiqueta: "Francés",
    saludo:
      "Bonjour, merci d'avoir appelé {negocio}. Comment puis-je vous aider ?",
    transcripcion: { flux: "fr", soniox: "fr" },
    retell: { locale: "fr-FR", vozMultilingue: false },
    cooficial: false,
    voces: ultra("fr-FR"),
  },
  "ca-ES": {
    iso: "ca",
    nombreEnPrompt: "catalán",
    etiqueta: "Catalán",
    saludo: "Hola, gràcies per trucar a {negocio}. En què et puc ajudar?",
    transcripcion: { flux: null, soniox: "ca" },
    retell: { locale: "ca-ES", vozMultilingue: true },
    cooficial: true,
    // Las nativas de Azure y las de MiniMax se ofrecieron del 03 al 05-10 y
    // se retiraron por decisión del usuario: se cobran aparte por carácter
    // (hasta +0,014 $/min) y no mejoraban la espera. Ningún negocio llegó a
    // elegirlas (inventario de producción del 2026-10-05).
    voces: [MARTA, SERGIO],
    // Valenciano y balear son el mismo idioma (un solo modelo «ca»); el
    // cliente debe sentir que se le atiende en su variedad.
    notaParaElPrompt:
      "Si quien llama usa formas valencianas o baleares del catalán, adáptate a ellas.",
  },
  "eu-ES": {
    iso: "eu",
    nombreEnPrompt: "euskera",
    etiqueta: "Euskera",
    // Sin «llamar a»: el nombre del negocio iría declinado.
    saludo: "Kaixo, {negocio}. Zertan lagun zaitzaket?",
    transcripcion: { flux: null, soniox: "eu" },
    retell: { locale: null, vozMultilingue: false },
    cooficial: true,
    voces: [MARTA, SERGIO],
  },
  "gl-ES": {
    iso: "gl",
    nombreEnPrompt: "gallego",
    etiqueta: "Gallego",
    saludo: "Ola, grazas por chamar a {negocio}. En que te podo axudar?",
    transcripcion: { flux: null, soniox: "gl" },
    // Retell admite gl-ES. Su voz Cartesia estaba sin verificar en gallego;
    // desde el 2026-10-05, con una cooficial va la cadena multilingüe
    // (usaVozMultilingueEnRetell en resolver.ts).
    retell: { locale: "gl-ES", vozMultilingue: false },
    cooficial: true,
    voces: [MARTA, SERGIO],
  },
  "de-DE": {
    iso: "de",
    nombreEnPrompt: "alemán",
    etiqueta: "Alemán",
    saludo:
      "Hallo, vielen Dank für Ihren Anruf bei {negocio}. Wie kann ich Ihnen helfen?",
    transcripcion: { flux: "de", soniox: "de" },
    retell: { locale: "de-DE", vozMultilingue: false },
    cooficial: false,
    voces: ultra("de-DE"),
  },
  "it-IT": {
    iso: "it",
    nombreEnPrompt: "italiano",
    etiqueta: "Italiano",
    saludo:
      "Buongiorno, grazie per aver chiamato {negocio}. Come posso aiutarla?",
    transcripcion: { flux: "it", soniox: "it" },
    retell: { locale: "it-IT", vozMultilingue: false },
    cooficial: false,
    voces: ultra("it-IT"),
  },
  "pt-PT": {
    iso: "pt",
    nombreEnPrompt: "portugués",
    etiqueta: "Portugués",
    // «Obrigado/a» concuerda con quien habla, y la voz puede ser de mujer o
    // de hombre: un saludo sin él vale para las dos.
    saludo: "Olá, está a falar com {negocio}. Em que posso ajudar?",
    transcripcion: { flux: "pt", soniox: "pt" },
    retell: { locale: "pt-PT", vozMultilingue: false },
    cooficial: false,
    voces: ultra("pt-PT"),
  },
  "nl-NL": {
    iso: "nl",
    nombreEnPrompt: "neerlandés",
    etiqueta: "Neerlandés",
    saludo:
      "Hallo, bedankt voor het bellen naar {negocio}. Waarmee kan ik u helpen?",
    transcripcion: { flux: "nl", soniox: "nl" },
    retell: { locale: "nl-NL", vozMultilingue: false },
    cooficial: false,
    voces: ultra("nl-NL"),
  },
};

/**
 * Qué se ofrece en cada mercado: el idioma describe lo que se puede hacer y
 * el mercado lo que se ofrece. Fuera de la oferta, un idioma guardado sigue
 * funcionando.
 *
 * España (decisiones del usuario del 2026-10-03 y del 2026-10-05, con
 * datos del INE, Frontur y las encuestas lingüísticas): de principal,
 * español, catalán, euskera, gallego (en Cataluña es obligatorio poder
 * atender en catalán: Codi de consum, art. 128-1) o, para negocios de
 * clientela extranjera, inglés, francés, alemán, italiano, portugués o
 * neerlandés. Con cualquiera habla además los siete de ULTRA_HABLA
 * (idiomasQueHabla).
 */
export interface Mercado {
  /** Lo habla siempre, sea cual sea el principal. */
  obligatorio: CodigoDeIdioma;
  /** Los que pueden ser el principal, en el orden del panel. */
  principales: readonly CodigoDeIdioma[];
}

export const MERCADOS = {
  ES: {
    obligatorio: "es-ES",
    principales: [
      "es-ES",
      "ca-ES",
      "eu-ES",
      "gl-ES",
      "en-GB",
      "fr-FR",
      "de-DE",
      "it-IT",
      "pt-PT",
      "nl-NL",
    ],
  },
} as const satisfies Record<string, Mercado>;

export type CodigoDeMercado = keyof typeof MERCADOS;

export const MERCADO_POR_DEFECTO: CodigoDeMercado = "ES";

export function esCodigoDeIdioma(valor: unknown): valor is CodigoDeIdioma {
  return (CODIGOS_DE_IDIOMA as readonly unknown[]).includes(valor);
}

/** Puede ser el principal: tiene voces propias. */
export function puedeSerPrincipal(codigo: CodigoDeIdioma): boolean {
  return IDIOMAS[codigo].voces !== null;
}

export function esCooficial(codigo: CodigoDeIdioma): boolean {
  return IDIOMAS[codigo].cooficial;
}

/**
 * Los idiomas que habla la recepcionista con `principal`, en orden
 * canónico (decisión del usuario del 2026-10-05): el dueño ya no los elige.
 * Los siete de ULTRA_HABLA con cualquier principal y, si es una lengua
 * cooficial, también ella (con sus voces de Soniox, que hablan todos). Se
 * guardan así en `languages`, para que lo que lo lee siga igual, y
 * alimentan la transcripción, la lista del prompt y Retell.
 */
export function idiomasQueHabla(principal: CodigoDeIdioma): CodigoDeIdioma[] {
  return CODIGOS_DE_IDIOMA.filter(
    (codigo) =>
      codigo === principal ||
      (ULTRA_HABLA as readonly CodigoDeIdioma[]).includes(codigo)
  );
}

export function hablaIdioma(
  voz: VozDelCatalogo,
  idioma: CodigoDeIdioma
): boolean {
  return voz.habla === "todos" || voz.habla.includes(idioma);
}

/** Las de `voces` que hablan todos `idiomas`, en el mismo orden. */
export function vocesQueHablan(
  voces: readonly VozDelCatalogo[],
  idiomas: readonly CodigoDeIdioma[]
): VozDelCatalogo[] {
  return voces.filter((voz) =>
    idiomas.every((idioma) => hablaIdioma(voz, idioma))
  );
}

/** «ultra»: las Ultra nativas del principal; «soniox»: las de un principal
 * cooficial (Marta y Sergio). */
export type FamiliaDeVoces = "ultra" | "soniox";

export interface VocesDeLaFamilia {
  familia: FamiliaDeVoces;
  /** Las voces que pueden atender, en el orden del catálogo. */
  voces: readonly VozDelCatalogo[];
}

/**
 * Qué voces pueden atender con `principal`: las suyas. Las de una lengua
 * cooficial son de Soniox (hablan todos los idiomas); las de cualquier otro,
 * sus Ultra nativas (español → las 29 de España; inglés → las británicas;
 * etc.).
 */
export function familiaDeVoces(principal: CodigoDeIdioma): VocesDeLaFamilia {
  return {
    familia: esCooficial(principal) ? "soniox" : "ultra",
    voces: IDIOMAS[principal].voces ?? [],
  };
}

const IDS_DEL_CATALOGO: ReadonlySet<string> = new Set(
  Object.values(IDIOMAS).flatMap((idioma) =>
    (idioma.voces ?? []).map((voz) => voz.id)
  )
);

/** ¿Es el identificador de una voz del catálogo (de cualquier idioma)? */
export function esVozDelCatalogo(id: unknown): id is string {
  return typeof id === "string" && IDS_DEL_CATALOGO.has(id);
}

export function componerSaludo(
  codigo: CodigoDeIdioma,
  negocio: string
): string {
  return IDIOMAS[codigo].saludo.split("{negocio}").join(negocio);
}
