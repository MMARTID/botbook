/**
 * Lo que el panel necesita de los idiomas, para que el frontend no repita
 * reglas: qué se ofrece (catalogoParaElPanel) y qué hará la recepcionista
 * con una selección (vistaPreviaDeIdiomas), con textos en español listos
 * para mostrar. Puro: el nombre del negocio llega como parámetro.
 */
import {
  IDIOMAS,
  MERCADOS,
  MERCADO_POR_DEFECTO,
  componerSaludo,
  vozHabla,
  type CodigoDeIdioma,
  type CodigoDeMercado,
  type GeneroDeVoz,
  type VozDelCatalogo,
} from "./catalogo.js";
import type { CambioDeIdiomas } from "./ajustes.js";
import { resolverIdiomas, type AjustesDeIdioma } from "./resolver.js";

export interface IdiomaDelPanel {
  codigo: CodigoDeIdioma;
  etiqueta: string;
}

export interface VozDelPanel {
  id: string;
  nombre: string;
  genero: GeneroDeVoz;
  /** Los idiomas que habla («todos» si los habla todos). */
  habla: "todos" | CodigoDeIdioma[];
  /** Las Ultra: las más expresivas y las que antes contestan. */
  expresiva: boolean;
  /** Muestra en el idioma principal, servida por la app. */
  muestra: string;
}

export interface PrincipalDelPanel extends IdiomaDelPanel {
  /** Otros idiomas que alguna de sus voces habla, de los que ofrece el
   * mercado. */
  secundariosCompatibles: CodigoDeIdioma[];
  /** Las voces que se pueden elegir, la de por defecto de cada género
   * primero. */
  voces: VozDelPanel[];
}

export interface CatalogoDelPanel {
  obligatorio: IdiomaDelPanel;
  principales: PrincipalDelPanel[];
  secundarios: IdiomaDelPanel[];
  /** Etiquetas de todos los idiomas, también los que ya no se ofrecen. */
  etiquetas: Record<CodigoDeIdioma, string>;
}

const enPanel = (codigo: CodigoDeIdioma): IdiomaDelPanel => ({
  codigo,
  etiqueta: IDIOMAS[codigo].etiqueta,
});

/** «Tomàs» → «tomas». */
const sinAcentos = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

/**
 * Dónde sirve la app (frontend/public) la muestra de una voz diciendo una
 * frase de recepcionista en el idioma principal. Las genera
 * scripts/muestrasDeVoces.ts.
 */
export function rutaDeMuestra(
  principal: CodigoDeIdioma,
  voz: Pick<VozDelCatalogo, "nombre">
): string {
  return `/voces/${IDIOMAS[principal].iso}/${sinAcentos(voz.nombre)}.mp3`;
}

const vozEnPanel = (
  principal: CodigoDeIdioma,
  voz: VozDelCatalogo
): VozDelPanel => ({
  id: voz.id,
  nombre: voz.nombre,
  genero: voz.genero,
  habla: voz.habla === "todos" ? "todos" : [...voz.habla],
  expresiva: voz.proveedor === "telnyx",
  muestra: rutaDeMuestra(principal, voz),
});

export function catalogoParaElPanel(
  mercado: CodigoDeMercado = MERCADO_POR_DEFECTO
): CatalogoDelPanel {
  const oferta = MERCADOS[mercado];
  return {
    obligatorio: enPanel(oferta.obligatorio),
    principales: oferta.principales.map((codigo) => ({
      ...enPanel(codigo),
      secundariosCompatibles: oferta.secundarios.filter((secundario) =>
        vozHabla(codigo, secundario)
      ),
      voces: (IDIOMAS[codigo].voces ?? []).map((voz) =>
        vozEnPanel(codigo, voz)
      ),
    })),
    secundarios: oferta.secundarios.map(enPanel),
    etiquetas: Object.fromEntries(
      Object.entries(IDIOMAS).map(([codigo, idioma]) => [
        codigo,
        idioma.etiqueta,
      ])
    ) as Record<CodigoDeIdioma, string>,
  };
}

export interface VistaPreviaDeIdiomas {
  /** La selección tal como se guardará (normalizada). */
  languages: CodigoDeIdioma[];
  voiceLanguage: CodigoDeIdioma;
  /** La voz que atenderá y su género. */
  voz: string;
  voiceGender: GeneroDeVoz;
  /** «Saluda en catalán y sigue en el idioma de quien llama.» */
  entradilla: string;
  /** El saludo real, con el nombre del negocio. */
  saludo: string;
  /** Lo que el dueño debe saber antes de guardar, en orden de importancia. */
  avisos: string[];
}

const enMinusculas = (codigo: CodigoDeIdioma) =>
  IDIOMAS[codigo].etiqueta.toLowerCase();

/** Lo que el dueño debe saber de una corrección de su selección, o null si
 * no hace falta decirle nada. */
export function avisoDeCambio(
  cambio: CambioDeIdiomas,
  obligatorio: CodigoDeIdioma
): string | null {
  switch (cambio.tipo) {
    case "principal":
      return cambio.a === obligatorio
        ? null
        : `Con el ${enMinusculas(cambio.a)} activo, el ${enMinusculas(cambio.a)} pasa a ser el idioma principal: la voz que habla español no lo pronuncia.`;
    case "quitado":
      return `Se quita el ${enMinusculas(cambio.idioma)}: la voz de tu idioma principal todavía no lo habla.`;
    case "voz":
      return `${cambio.de.nombre} no habla ${enMinusculas(cambio.noHabla)}: atenderá ${cambio.a.nombre}.`;
  }
}

export function vistaPreviaDeIdiomas(
  ajustes: AjustesDeIdioma,
  negocio: string,
  mercado: CodigoDeMercado = MERCADO_POR_DEFECTO
): VistaPreviaDeIdiomas {
  const perfil = resolverIdiomas(ajustes);
  const oferta = MERCADOS[mercado];
  const avisos: string[] = [];

  for (const cambio of perfil.cambios) {
    const aviso = avisoDeCambio(cambio, oferta.obligatorio);
    if (aviso) avisos.push(aviso);
  }
  // Medido con llamadas reales el 2026-10-03: sin flux, el fin de turno lo
  // marca Soniox y cada respuesta llega entre medio segundo y un segundo
  // más tarde (más con clientes que hablan castellano); y solo las Ultra
  // tienen modo expresivo.
  if (
    perfil.transcripcion.motor === "soniox" ||
    perfil.voz.proveedor !== "telnyx"
  ) {
    avisos.push(
      `En ${enMinusculas(perfil.principal)} la voz suena algo menos expresiva que en español y tarda algo más en contestar: entre medio segundo y un segundo más por respuesta.`
    );
  }
  if (
    !(oferta.principales as readonly CodigoDeIdioma[]).includes(
      perfil.principal
    )
  ) {
    avisos.push(
      `El ${enMinusculas(perfil.principal)} como idioma principal ya no se ofrece: lo mantenemos, pero si lo cambias no podrás volver a elegirlo.`
    );
  }

  return {
    languages: perfil.idiomas,
    voiceLanguage: perfil.principal,
    voz: perfil.voz.id,
    voiceGender: perfil.genero,
    entradilla:
      perfil.idiomas.length === 1
        ? `Atiende siempre en ${enMinusculas(perfil.principal)}.`
        : `Saluda en ${enMinusculas(perfil.principal)} y sigue en el idioma de quien llama.`,
    saludo: componerSaludo(perfil.principal, negocio),
    avisos,
  };
}
