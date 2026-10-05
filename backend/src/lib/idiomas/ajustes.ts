import { z } from "zod";
import {
  CODIGOS_DE_IDIOMA,
  MERCADOS,
  MERCADO_POR_DEFECTO,
  cooficialActiva,
  esCodigoDeIdioma,
  esCooficial,
  esVozDelCatalogo,
  familiaDeVoces,
  hablaIdioma,
  puedeSerPrincipal,
  vocesQueHablan,
  type CodigoDeIdioma,
  type VozDelCatalogo,
} from "./catalogo.js";

/** El idioma que siempre está activo (español en el mercado de España). */
export const IDIOMA_OBLIGATORIO: CodigoDeIdioma =
  MERCADOS[MERCADO_POR_DEFECTO].obligatorio;

/** En el orden canónico del catálogo y sin repetidos. */
export function ordenarIdiomas(
  idiomas: readonly CodigoDeIdioma[]
): CodigoDeIdioma[] {
  return CODIGOS_DE_IDIOMA.filter((codigo) => idiomas.includes(codigo));
}

/** `languages` al escribir: el obligatorio activo, sin repetidos y en el
 * orden canónico (el que alimenta el hash del payload de Telnyx). */
export const EsquemaDeIdiomas = z
  .array(z.enum(CODIGOS_DE_IDIOMA))
  .min(1)
  .max(CODIGOS_DE_IDIOMA.length)
  .superRefine((idiomas, context) => {
    if (!idiomas.includes(IDIOMA_OBLIGATORIO)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El español de España debe estar siempre activo.",
      });
    }
    if (new Set(idiomas).size !== idiomas.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "No se puede seleccionar un idioma más de una vez.",
      });
    }
  })
  .transform(ordenarIdiomas);

/** `voiceLanguage`, el idioma en que saluda (el nombre del campo es el de
 * siempre): solo uno con voces propias. */
export const EsquemaDeIdiomaPrincipal = z
  .enum(CODIGOS_DE_IDIOMA)
  .refine(puedeSerPrincipal, {
    message: "La recepcionista no puede saludar en ese idioma.",
  });

/** `voz`, la voz que eligió el dueño: una del catálogo. Si no es de la
 * familia que atiende (familiaDeVoces) o no habla sus idiomas, la sustituye
 * resolverIdiomas. */
export const EsquemaDeVoz = z.string().refine(esVozDelCatalogo, {
  message: "Esa voz no está en el catálogo.",
});

export type CambioDeIdiomas =
  /** Saludará en `a` en vez de en `de`. */
  | { tipo: "principal"; de: CodigoDeIdioma; a: CodigoDeIdioma }
  /** `idioma` deja de estar activo: era otra lengua cooficial (solo cabe
   * una) o ninguna voz de la familia lo habla. */
  | {
      tipo: "quitado";
      idioma: CodigoDeIdioma;
      motivo: "otraCooficial" | "sinVoz";
    }
  /** La voz elegida no habla `noHabla`, que está activo: atiende `a`. */
  | {
      tipo: "voz";
      de: VozDelCatalogo;
      a: VozDelCatalogo;
      noHabla: CodigoDeIdioma;
    };

export interface IdiomasNormalizados {
  languages: CodigoDeIdioma[];
  /** El idioma en que saluda. */
  voiceLanguage: CodigoDeIdioma;
  /** Lo que se ha corregido, para avisar al dueño en el panel. */
  cambios: CambioDeIdiomas[];
}

/**
 * Deja los idiomas en un estado que la voz puede atender, corrigiendo en
 * vez de rechazar: unos ajustes guardados con reglas anteriores no deben
 * romper la sincronización ni perderse (decisiones del usuario del
 * 2026-10-05).
 *
 * - El obligatorio, siempre activo; el orden, el canónico.
 * - Como mucho una lengua cooficial (catalán, euskera o gallego): la voz de
 *   Soniox arranca en una sola. Si hay varias, se queda la del saludo o, si
 *   no, la primera en orden canónico.
 * - El saludo, activo y con voces propias; si no, el obligatorio. Con una
 *   cooficial activa solo puede saludar en ella o en el obligatorio (el
 *   dueño elige): un saludo extranjero pasa a la cooficial.
 * - Alguna voz de la familia que atiende (familiaDeVoces) tiene que hablar
 *   todos los activos. Con el catálogo actual siempre la hay (un test
 *   recorre todas las combinaciones); si no, se quitan los que no habla la
 *   que más habla.
 */
export function normalizarIdiomas(entrada: {
  languages: readonly CodigoDeIdioma[];
  voiceLanguage: CodigoDeIdioma;
}): IdiomasNormalizados {
  const cambios: CambioDeIdiomas[] = [];
  let languages = ordenarIdiomas([IDIOMA_OBLIGATORIO, ...entrada.languages]);

  const cooficiales = languages.filter(esCooficial);
  if (cooficiales.length > 1) {
    const queda = cooficiales.includes(entrada.voiceLanguage)
      ? entrada.voiceLanguage
      : cooficiales[0];
    for (const idioma of cooficiales) {
      if (idioma !== queda) {
        cambios.push({ tipo: "quitado", idioma, motivo: "otraCooficial" });
      }
    }
    languages = languages.filter(
      (idioma) => !esCooficial(idioma) || idioma === queda
    );
  }
  const cooficial = cooficialActiva(languages);

  let saludo =
    languages.includes(entrada.voiceLanguage) &&
    puedeSerPrincipal(entrada.voiceLanguage)
      ? entrada.voiceLanguage
      : IDIOMA_OBLIGATORIO;
  if (cooficial && saludo !== cooficial && saludo !== IDIOMA_OBLIGATORIO) {
    saludo = cooficial;
  }

  const { voces } = familiaDeVoces(saludo, languages);
  if (voces.length > 0 && vocesQueHablan(voces, languages).length === 0) {
    const cuantos = (voz: VozDelCatalogo) =>
      languages.filter((idioma) => hablaIdioma(voz, idioma)).length;
    // La primera que más habla.
    const masCapaz = voces.reduce((mejor, voz) =>
      cuantos(voz) > cuantos(mejor) ? voz : mejor
    );
    const atendidos = languages.filter((idioma) =>
      hablaIdioma(masCapaz, idioma)
    );
    for (const idioma of languages) {
      if (!atendidos.includes(idioma)) {
        cambios.push({ tipo: "quitado", idioma, motivo: "sinVoz" });
      }
    }
    languages = atendidos;
  }

  if (saludo !== entrada.voiceLanguage) {
    cambios.unshift({
      tipo: "principal",
      de: entrada.voiceLanguage,
      a: saludo,
    });
  }
  return { languages, voiceLanguage: saludo, cambios };
}

/** Lo legible de unos `languages` sin validar (p. ej. JSON guardado con un
 * código que ya no existe): los conocidos, sin el resto. */
export function idiomasConocidos(valor: unknown): CodigoDeIdioma[] {
  return Array.isArray(valor) ? valor.filter(esCodigoDeIdioma) : [];
}
