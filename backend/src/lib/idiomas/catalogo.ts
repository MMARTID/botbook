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
 */

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
 * listarlas (`listVoices`). */
export type ProveedorDeVoz = "telnyx" | "soniox" | "minimax" | "azure";

export interface VozDelCatalogo {
  /** Identificador de Telnyx: `Telnyx.Ultra.<uuid>`,
   * `Soniox.tts-rt-v2.<Nombre>`, `Minimax.<modelo>.<voz>` o
   * `Azure.<locale>-<Nombre>Neural`. */
  id: string;
  proveedor: ProveedorDeVoz;
  nombre: string;
  genero: GeneroDeVoz;
  /** Idiomas que pronuncia bien (escuchados en el laboratorio de voces).
   * Las de Soniox hablan cualquiera y arrancan en el de
   * `voice_settings.language`; el resto, los suyos. Un idioma solo puede
   * estar activo si la voz que atiende lo habla. */
  habla: "todos" | readonly CodigoDeIdioma[];
}

export interface IdiomaDelCatalogo {
  /** ISO 639-1: pistas de Soniox y `voice_settings.language`. */
  iso: string;
  /** Cómo lo nombra el prompt: «… si es uno de estos: catalán, …». */
  nombreEnPrompt: string;
  /** Cómo lo ve el dueño en el panel. */
  etiqueta: string;
  /** Saludo al descolgar cuando es el idioma principal; `{negocio}` es el
   * nombre del negocio. */
  saludo: string;
  /** Pista de cada motor de transcripción de Telnyx, o null si no lo
   * entiende. flux es el rápido (fin de turno anticipado); Soniox entiende
   * todos. */
  transcripcion: { flux: string | null; soniox: string };
  /** Locale de Retell (el respaldo), o null si no lo tiene; y si exige la
   * cadena de voces multilingüe (Retell rechaza ca-ES con Cartesia). */
  retell: { locale: IdiomaDeRetell | null; vozMultilingue: boolean };
  /** Voces que puede elegir el negocio con este idioma como principal, en
   * orden de preferencia: sin elección, atiende la primera de su género
   * que hable todos sus idiomas. Sin voces, el idioma solo puede acompañar
   * a un principal cuya voz lo hable. */
  voces: readonly VozDelCatalogo[] | null;
  /** Frase extra del prompt mientras el idioma está activo. */
  notaParaElPrompt?: string;
}

/**
 * Voces Ultra curadas por idioma y género (decisión del usuario
 * 2026-09-14): tono profesional y cercano, coherente entre idiomas. «Blanca
 * - Graceful Host» se usa desde el 2026-09-12. Hablan su idioma y los
 * extranjeros que se ofrecen: alemán, italiano, portugués y neerlandés,
 * aprobados de oído por el usuario el 2026-10-03 (laboratorio de voces).
 */
const ULTRA_HABLA = [
  "es-ES",
  "en-GB",
  "fr-FR",
  "de-DE",
  "it-IT",
  "pt-PT",
  "nl-NL",
] as const;

const ultra = (
  uuid: string,
  nombre: string,
  genero: GeneroDeVoz
): VozDelCatalogo => ({
  id: `Telnyx.Ultra.${uuid}`,
  proveedor: "telnyx",
  nombre,
  genero,
  habla: ULTRA_HABLA,
});

/**
 * Voces de Soniox: cada una habla los 63 idiomas de Soniox, así que son las
 * de por defecto de catalán, euskera y gallego (atienden también el inglés
 * o el alemán que active el negocio). Marta y Sergio, con acento español,
 * elegidas por el usuario el 2026-10-02 escuchando muestras.
 */
const MARTA: VozDelCatalogo = {
  id: "Soniox.tts-rt-v2.Marta",
  proveedor: "soniox",
  nombre: "Marta",
  genero: "femenina",
  habla: "todos",
};
const SERGIO: VozDelCatalogo = {
  id: "Soniox.tts-rt-v2.Sergio",
  proveedor: "soniox",
  nombre: "Sergio",
  genero: "masculina",
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
    voces: [
      ultra("538a8872-3799-4df5-b373-b78493b766c6", "Blanca", "femenina"),
      ultra("13ff5deb-2591-42ad-a356-63a04e524411", "Marcos", "masculina"),
    ],
  },
  "en-GB": {
    iso: "en",
    nombreEnPrompt: "inglés",
    etiqueta: "Inglés",
    saludo: "Hello, thank you for calling {negocio}. How can I help you?",
    transcripcion: { flux: "en", soniox: "en" },
    retell: { locale: "en-GB", vozMultilingue: false },
    voces: [
      ultra("2f251ac3-89a9-4a77-a452-704b474ccd01", "Lucy", "femenina"),
      ultra("4bc3cb8c-adb9-4bb8-b5d5-cbbef950b991", "George", "masculina"),
    ],
  },
  "fr-FR": {
    iso: "fr",
    nombreEnPrompt: "francés",
    etiqueta: "Francés",
    saludo:
      "Bonjour, merci d'avoir appelé {negocio}. Comment puis-je vous aider ?",
    transcripcion: { flux: "fr", soniox: "fr" },
    retell: { locale: "fr-FR", vozMultilingue: false },
    voces: [
      ultra("c96a7d7d-3457-4979-8665-522f7b3e36fb", "Léa", "femenina"),
      ultra("7345dfa5-ee04-44d2-abf4-29262b880ab4", "Laurent", "masculina"),
    ],
  },
  "ca-ES": {
    iso: "ca",
    nombreEnPrompt: "catalán",
    etiqueta: "Catalán",
    saludo: "Hola, gràcies per trucar a {negocio}. En què et puc ajudar?",
    transcripcion: { flux: null, soniox: "ca" },
    retell: { locale: "ca-ES", vozMultilingue: true },
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
    voces: [MARTA, SERGIO],
  },
  "gl-ES": {
    iso: "gl",
    nombreEnPrompt: "gallego",
    etiqueta: "Gallego",
    saludo: "Ola, grazas por chamar a {negocio}. En que te podo axudar?",
    transcripcion: { flux: null, soniox: "gl" },
    // Retell admite gl-ES; su voz Cartesia está sin verificar en gallego
    // (verificarIdiomas.ts, PR de medición).
    retell: { locale: "gl-ES", vozMultilingue: false },
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
    voces: null,
  },
  "it-IT": {
    iso: "it",
    nombreEnPrompt: "italiano",
    etiqueta: "Italiano",
    saludo:
      "Buongiorno, grazie per aver chiamato {negocio}. Come posso aiutarla?",
    transcripcion: { flux: "it", soniox: "it" },
    retell: { locale: "it-IT", vozMultilingue: false },
    voces: null,
  },
  "pt-PT": {
    iso: "pt",
    nombreEnPrompt: "portugués",
    etiqueta: "Portugués",
    saludo: "Olá, obrigado por ligar para {negocio}. Em que posso ajudar?",
    transcripcion: { flux: "pt", soniox: "pt" },
    retell: { locale: "pt-PT", vozMultilingue: false },
    voces: null,
  },
  "nl-NL": {
    iso: "nl",
    nombreEnPrompt: "neerlandés",
    etiqueta: "Neerlandés",
    saludo:
      "Hallo, bedankt voor het bellen naar {negocio}. Waarmee kan ik u helpen?",
    transcripcion: { flux: "nl", soniox: "nl" },
    retell: { locale: "nl-NL", vozMultilingue: false },
    voces: null,
  },
};

/**
 * Qué se ofrece en cada mercado: el idioma describe lo que se puede hacer y
 * el mercado lo que se ofrece. Fuera de la oferta, un idioma guardado sigue
 * funcionando (p. ej. inglés como principal de antes de esta regla).
 *
 * España (decisión del usuario 2026-10-03, con datos del INE, Frontur y
 * las encuestas lingüísticas): español con todos sus acentos siempre;
 * catalán, euskera y gallego solo como idioma principal (en Cataluña es
 * obligatorio poder atender en catalán: Codi de consum, art. 128-1); e
 * inglés, francés, alemán, italiano, portugués y neerlandés como otros
 * idiomas (los cuatro últimos desde el 2026-10-03, tras escuchar cómo los
 * pronuncia la voz Ultra).
 */
export interface Mercado {
  /** Siempre activo: la voz de cualquier principal debe hablarlo. */
  obligatorio: CodigoDeIdioma;
  principales: readonly CodigoDeIdioma[];
  secundarios: readonly CodigoDeIdioma[];
}

export const MERCADOS = {
  ES: {
    obligatorio: "es-ES",
    principales: ["es-ES", "ca-ES", "eu-ES", "gl-ES"],
    secundarios: ["en-GB", "fr-FR", "de-DE", "it-IT", "pt-PT", "nl-NL"],
  },
} as const satisfies Record<string, Mercado>;

export type CodigoDeMercado = keyof typeof MERCADOS;

export const MERCADO_POR_DEFECTO: CodigoDeMercado = "ES";

export function esCodigoDeIdioma(valor: unknown): valor is CodigoDeIdioma {
  return (CODIGOS_DE_IDIOMA as readonly unknown[]).includes(valor);
}

/** Puede ser idioma principal: tiene voces propias. */
export function puedeSerPrincipal(codigo: CodigoDeIdioma): boolean {
  return IDIOMAS[codigo].voces !== null;
}

export function hablaIdioma(
  voz: VozDelCatalogo,
  idioma: CodigoDeIdioma
): boolean {
  return voz.habla === "todos" || voz.habla.includes(idioma);
}

/** Las voces de un idioma principal que hablan todos `idiomas`, en el
 * orden del catálogo. */
export function vocesQueHablan(
  principal: CodigoDeIdioma,
  idiomas: readonly CodigoDeIdioma[]
): VozDelCatalogo[] {
  return (IDIOMAS[principal].voces ?? []).filter((voz) =>
    idiomas.every((idioma) => hablaIdioma(voz, idioma))
  );
}

/** ¿Alguna voz de este idioma principal habla también `otro`? */
export function vozHabla(
  principal: CodigoDeIdioma,
  otro: CodigoDeIdioma
): boolean {
  return vocesQueHablan(principal, [otro]).length > 0;
}

/** ¿Es el identificador de una voz del catálogo (de cualquier idioma)? */
export function esVozDelCatalogo(id: unknown): id is string {
  return Object.values(IDIOMAS).some((idioma) =>
    idioma.voces?.some((voz) => voz.id === id)
  );
}

export function componerSaludo(
  codigo: CodigoDeIdioma,
  negocio: string
): string {
  return IDIOMAS[codigo].saludo.split("{negocio}").join(negocio);
}
