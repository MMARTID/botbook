import { z } from "zod";
import {
  CODIGOS_DE_IDIOMA,
  MERCADOS,
  MERCADO_POR_DEFECTO,
  esCodigoDeIdioma,
  puedeSerPrincipal,
  vozHabla,
  type CodigoDeIdioma,
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

/** `voiceLanguage`, el idioma principal: solo uno con voces propias. */
export const EsquemaDeIdiomaPrincipal = z
  .enum(CODIGOS_DE_IDIOMA)
  .refine(puedeSerPrincipal, {
    message: "Ese idioma no puede ser el idioma principal.",
  });

export type CambioDeIdiomas =
  | { tipo: "principal"; de: CodigoDeIdioma; a: CodigoDeIdioma }
  | { tipo: "quitado"; idioma: CodigoDeIdioma };

export interface IdiomasNormalizados {
  languages: CodigoDeIdioma[];
  voiceLanguage: CodigoDeIdioma;
  /** Lo que se ha corregido, para avisar al dueño en el panel. */
  cambios: CambioDeIdiomas[];
}

/**
 * Deja los idiomas en un estado que la voz puede atender, corrigiendo en
 * vez de rechazar: unos ajustes guardados con reglas anteriores no deben
 * romper la sincronización ni perderse.
 *
 * - El obligatorio, siempre activo; el orden, el canónico.
 * - El principal, activo y con voces propias; si no, el obligatorio.
 * - La voz del principal tiene que hablar todos los activos. Si no (p. ej.
 *   catalán activo con español principal: ninguna Ultra lo habla), pasa a
 *   principal el primer activo cuya voz los hable todos (la de Soniox del
 *   catalán, euskera o gallego). Así catalán, euskera y gallego solo se
 *   atienden como idioma principal (decisión del usuario 2026-10-03).
 * - Si ninguna voz los habla todos, se quitan los que la del principal no
 *   habla (p. ej. alemán antes de verificar cómo lo pronuncia Ultra).
 */
export function normalizarIdiomas(entrada: {
  languages: readonly CodigoDeIdioma[];
  voiceLanguage: CodigoDeIdioma;
}): IdiomasNormalizados {
  const cambios: CambioDeIdiomas[] = [];
  let languages = ordenarIdiomas([IDIOMA_OBLIGATORIO, ...entrada.languages]);
  let principal =
    languages.includes(entrada.voiceLanguage) &&
    puedeSerPrincipal(entrada.voiceLanguage)
      ? entrada.voiceLanguage
      : IDIOMA_OBLIGATORIO;

  const hablaTodos = (candidato: CodigoDeIdioma) =>
    languages.every((idioma) => vozHabla(candidato, idioma));

  if (!hablaTodos(principal)) {
    const otro = languages.find(
      (idioma) => puedeSerPrincipal(idioma) && hablaTodos(idioma)
    );
    if (otro) {
      principal = otro;
    } else {
      const atendidos = languages.filter((idioma) =>
        vozHabla(principal, idioma)
      );
      for (const idioma of languages) {
        if (!atendidos.includes(idioma)) {
          cambios.push({ tipo: "quitado", idioma });
        }
      }
      languages = atendidos;
    }
  }

  if (principal !== entrada.voiceLanguage) {
    cambios.unshift({
      tipo: "principal",
      de: entrada.voiceLanguage,
      a: principal,
    });
  }
  return { languages, voiceLanguage: principal, cambios };
}

/** Lo legible de unos `languages` sin validar (p. ej. JSON guardado con un
 * código que ya no existe): los conocidos, sin el resto. */
export function idiomasConocidos(valor: unknown): CodigoDeIdioma[] {
  return Array.isArray(valor) ? valor.filter(esCodigoDeIdioma) : [];
}
