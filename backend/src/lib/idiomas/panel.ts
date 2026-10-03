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
} from "./catalogo.js";
import { resolverIdiomas, type AjustesDeIdioma } from "./resolver.js";

export interface IdiomaDelPanel {
  codigo: CodigoDeIdioma;
  etiqueta: string;
}

export interface PrincipalDelPanel extends IdiomaDelPanel {
  /** Otros idiomas que su voz puede hablar, de los que ofrece el mercado. */
  secundariosCompatibles: CodigoDeIdioma[];
  /** Voz de Soniox: otra voz, algo menos expresiva y unas décimas más lenta. */
  vozMultilingue: boolean;
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
      vozMultilingue: IDIOMAS[codigo].voces!.femenina.habla === "todos",
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
  /** «Saluda en catalán y sigue en el idioma de quien llama.» */
  entradilla: string;
  /** El saludo real, con el nombre del negocio. */
  saludo: string;
  /** Lo que el dueño debe saber antes de guardar, en orden de importancia. */
  avisos: string[];
}

const enMinusculas = (codigo: CodigoDeIdioma) =>
  IDIOMAS[codigo].etiqueta.toLowerCase();

export function vistaPreviaDeIdiomas(
  ajustes: AjustesDeIdioma,
  negocio: string,
  mercado: CodigoDeMercado = MERCADO_POR_DEFECTO
): VistaPreviaDeIdiomas {
  const perfil = resolverIdiomas(ajustes);
  const oferta = MERCADOS[mercado];
  const avisos: string[] = [];

  for (const cambio of perfil.cambios) {
    if (cambio.tipo === "principal" && cambio.a !== oferta.obligatorio) {
      avisos.push(
        `Con el ${enMinusculas(cambio.a)} activo, el ${enMinusculas(cambio.a)} pasa a ser el idioma principal: la voz que habla español no lo pronuncia.`
      );
    }
    if (cambio.tipo === "quitado") {
      avisos.push(
        `Se quita el ${enMinusculas(cambio.idioma)}: la voz de tu idioma principal todavía no lo habla.`
      );
    }
  }
  if (perfil.voz.proveedor === "soniox") {
    avisos.push(
      `Con el ${enMinusculas(perfil.principal)} como idioma principal atiende con otra voz, que habla todos tus idiomas pero suena algo menos expresiva y contesta unas décimas de segundo más tarde.`
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
    entradilla:
      perfil.idiomas.length === 1
        ? `Atiende siempre en ${enMinusculas(perfil.principal)}.`
        : `Saluda en ${enMinusculas(perfil.principal)} y sigue en el idioma de quien llama.`,
    saludo: componerSaludo(perfil.principal, negocio),
    avisos,
  };
}
