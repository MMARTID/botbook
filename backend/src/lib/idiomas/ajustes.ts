import { z } from "zod";
import type { PlanFeature } from "../planFeatures.js";
import {
  CODIGOS_DE_IDIOMA,
  MERCADOS,
  MERCADO_POR_DEFECTO,
  esCodigoDeIdioma,
  esCooficial,
  esVozDelCatalogo,
  idiomasQueHabla,
  puedeSerPrincipal,
  type CodigoDeIdioma,
  type VozDelCatalogo,
} from "./catalogo.js";

/** El idioma que habla siempre (español en el mercado de España). */
export const IDIOMA_OBLIGATORIO: CodigoDeIdioma =
  MERCADOS[MERCADO_POR_DEFECTO].obligatorio;

/** En el orden canónico del catálogo y sin repetidos. */
export function ordenarIdiomas(
  idiomas: readonly CodigoDeIdioma[]
): CodigoDeIdioma[] {
  return CODIGOS_DE_IDIOMA.filter((codigo) => idiomas.includes(codigo));
}

/** `languages` al escribir: el obligatorio activo, sin repetidos y en el
 * orden canónico. Desde el 2026-10-05 se guardan los que habla con su
 * principal (normalizarIdiomas), digan lo que digan: solo cuentan para leer
 * ajustes anteriores (una cooficial en ellos pasa a ser el principal). */
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

/** `voiceLanguage`, el idioma principal (el nombre del campo es el de
 * siempre): solo uno con voces propias. */
export const EsquemaDeIdiomaPrincipal = z
  .enum(CODIGOS_DE_IDIOMA)
  .refine(puedeSerPrincipal, {
    message: "La recepcionista no puede saludar en ese idioma.",
  });

/** `voz`, la voz que eligió el dueño: una del catálogo. Si no es de las
 * de su principal (familiaDeVoces), la sustituye resolverIdiomas. */
export const EsquemaDeVoz = z.string().refine(esVozDelCatalogo, {
  message: "Esa voz no está en el catálogo.",
});

/**
 * La función del plan que hace falta para elegir `principal`, o null si
 * vale cualquier plan (decisión del usuario del 2026-10-05): catalán,
 * euskera y gallego, las «lenguas locales», en Pro y Scale; los idiomas de
 * las voces Ultra, en todos. Se mira al escribir (PATCH /business/me) y la
 * enseña el panel; un negocio que ya atiende en una cooficial la conserva
 * aunque baje de plan (no se le cambia nada al leer).
 */
export function funcionQueExige(
  principal: CodigoDeIdioma
): Extract<PlanFeature, "lenguas_locales"> | null {
  return esCooficial(principal) ? "lenguas_locales" : null;
}

export type CambioDeIdiomas =
  /** Saludará en `a` en vez de en `de`. */
  | { tipo: "principal"; de: CodigoDeIdioma; a: CodigoDeIdioma }
  /** La voz elegida no habla `noHabla`, que habla su principal: atiende
   * `a`. Con el catálogo actual no pasa (todas las de cada principal
   * hablan todos sus idiomas). */
  | {
      tipo: "voz";
      de: VozDelCatalogo;
      a: VozDelCatalogo;
      noHabla: CodigoDeIdioma;
    };

export interface IdiomasNormalizados {
  /** Los que habla con su principal (idiomasQueHabla), en orden canónico. */
  languages: CodigoDeIdioma[];
  /** El idioma principal: en él saluda y de él sale la voz. */
  voiceLanguage: CodigoDeIdioma;
  /** Lo que se ha corregido, para avisar al dueño en el panel. */
  cambios: CambioDeIdiomas[];
}

/**
 * El principal manda (decisión del usuario del 2026-10-05, «nos hemos
 * complicado»): el dueño solo elige el idioma principal y la recepcionista
 * habla los que van con él (idiomasQueHabla). Corrige en vez de rechazar:
 * unos ajustes guardados con reglas anteriores no deben romper la
 * sincronización ni perderse.
 *
 * - Un principal sin voces propias pasa al obligatorio.
 * - `languages` no se elige: se ignora, salvo para leer ajustes anteriores.
 *   Con una lengua cooficial en ellos y un principal que no lo es (las
 *   reglas anteriores dejaban saludar en castellano con catalán activo), el
 *   principal pasa a ser esa cooficial (la primera en orden canónico), la
 *   lengua que el negocio atendía. La migración
 *   20261005150000_saludo_en_la_cooficial ya lo hace en la base de datos;
 *   esto cubre lo que quede.
 */
export function normalizarIdiomas(entrada: {
  languages?: readonly CodigoDeIdioma[];
  voiceLanguage: CodigoDeIdioma;
}): IdiomasNormalizados {
  let principal = puedeSerPrincipal(entrada.voiceLanguage)
    ? entrada.voiceLanguage
    : IDIOMA_OBLIGATORIO;
  const cooficialGuardada = ordenarIdiomas(entrada.languages ?? []).find(
    esCooficial
  );
  if (!esCooficial(principal) && cooficialGuardada) {
    principal = cooficialGuardada;
  }
  return {
    languages: idiomasQueHabla(principal),
    voiceLanguage: principal,
    cambios:
      principal === entrada.voiceLanguage
        ? []
        : [{ tipo: "principal", de: entrada.voiceLanguage, a: principal }],
  };
}

/** Lo legible de unos `languages` sin validar (p. ej. JSON guardado con un
 * código que ya no existe): los conocidos, sin el resto. */
export function idiomasConocidos(valor: unknown): CodigoDeIdioma[] {
  return Array.isArray(valor) ? valor.filter(esCodigoDeIdioma) : [];
}
