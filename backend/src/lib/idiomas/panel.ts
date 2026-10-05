/**
 * Lo que el panel necesita de los idiomas, para que el frontend no repita
 * reglas: qué se ofrece (catalogoParaElPanel) y qué hará la recepcionista
 * con una selección (vistaPreviaDeIdiomas), con textos en español listos
 * para mostrar a un dueño que no tiene por qué saber de voces ni de
 * transcripción. Puro: el nombre del negocio llega como parámetro.
 */
import {
  CODIGOS_DE_IDIOMA,
  IDIOMAS,
  MERCADOS,
  MERCADO_POR_DEFECTO,
  componerSaludo,
  esCooficial,
  otrosIdiomasConSaludo,
  type CodigoDeIdioma,
  type CodigoDeMercado,
  type FamiliaDeVoces,
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
  /** Cómo suena, en español («Cálida y acogedora»). */
  descripcion: string;
  /** De atención al cliente: se enseña sin desplegar «Ver todas las
   * voces». */
  recomendada: boolean;
  /** La que atiende si el dueño no elige: la primera de su género. */
  porDefecto: boolean;
  /** Ruta de su muestra en la app (rutaDeMuestra). */
  muestra: string;
}

/** Cómo agrupa el panel los idiomas del saludo: el obligatorio y las
 * cooficiales a la vista; los extranjeros bajo «Otro idioma». */
export type TipoDeIdiomaDelPanel = "obligatorio" | "cooficial" | "extranjero";

export interface PrincipalDelPanel extends IdiomaDelPanel {
  tipo: TipoDeIdiomaDelPanel;
  /** Los idiomas que se pueden activar con este saludo, además del
   * obligatorio, en el orden del panel (otrosIdiomasConSaludo). Las
   * cooficiales, como mucho una a la vez. */
  otrosIdiomas: CodigoDeIdioma[];
  /** De qué familia son sus `voces`: «ultra» (las nativas de este idioma)
   * o «soniox» (las de esta cooficial). */
  familia: FamiliaDeVoces;
  /** Las voces que atienden con este saludo y sin cooficial activa o, si
   * es una cooficial, siempre que esté activa (también con saludo en el
   * obligatorio). Por género, la de por defecto primero, luego las
   * recomendadas y luego el resto. */
  voces: VozDelPanel[];
}

export interface CatalogoDelPanel {
  obligatorio: IdiomaDelPanel;
  principales: PrincipalDelPanel[];
  /** Los otros idiomas que se ofrecen con cualquier saludo (salvo el
   * suyo). */
  secundarios: IdiomaDelPanel[];
  /** Las lenguas cooficiales que se ofrecen: con saludo en el obligatorio
   * también como otro idioma, como mucho una a la vez. */
  cooficiales: IdiomaDelPanel[];
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
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

const PREFIJO_ULTRA = "Telnyx.Ultra.";

/**
 * Dónde sirve la app (frontend/public) la muestra de una voz diciendo una
 * frase de recepcionista en `idioma`, el de su lista de voces (el del
 * saludo para las Ultra, la cooficial para las de Soniox):
 * `/voces/<iso>/<slug>.mp3`, con el uuid de las Ultra (sus nombres se
 * repiten entre idiomas y cambian con la curación) y el nombre en
 * minúsculas de las de Soniox (`/voces/ca/marta.mp3`). Las genera
 * scripts/muestrasDeVoces.ts.
 */
export function rutaDeMuestra(
  idioma: CodigoDeIdioma,
  voz: Pick<VozDelCatalogo, "id" | "nombre">
): string {
  const slug = voz.id.startsWith(PREFIJO_ULTRA)
    ? voz.id.slice(PREFIJO_ULTRA.length).toLowerCase()
    : sinAcentos(voz.nombre);
  return `/voces/${IDIOMAS[idioma].iso}/${slug}.mp3`;
}

/** Las voces para el panel; la de por defecto de cada género es la
 * primera de su género en `voces`. */
function vocesEnPanel(
  idioma: CodigoDeIdioma,
  voces: readonly VozDelCatalogo[]
): VozDelPanel[] {
  return voces.map((voz) => ({
    id: voz.id,
    nombre: voz.nombre,
    genero: voz.genero,
    descripcion: voz.descripcion,
    recomendada: voz.recomendada,
    porDefecto: voces.find((otra) => otra.genero === voz.genero) === voz,
    muestra: rutaDeMuestra(idioma, voz),
  }));
}

export function catalogoParaElPanel(
  mercado: CodigoDeMercado = MERCADO_POR_DEFECTO
): CatalogoDelPanel {
  const oferta = MERCADOS[mercado];
  return {
    obligatorio: enPanel(oferta.obligatorio),
    principales: oferta.principales.map((codigo) => ({
      ...enPanel(codigo),
      tipo:
        codigo === oferta.obligatorio
          ? "obligatorio"
          : esCooficial(codigo)
            ? "cooficial"
            : "extranjero",
      otrosIdiomas: otrosIdiomasConSaludo(oferta, codigo),
      familia: esCooficial(codigo) ? "soniox" : "ultra",
      voces: vocesEnPanel(codigo, IDIOMAS[codigo].voces ?? []),
    })),
    secundarios: oferta.secundarios.map(enPanel),
    cooficiales: oferta.principales.filter(esCooficial).map(enPanel),
    etiquetas: Object.fromEntries(
      Object.entries(IDIOMAS).map(([codigo, idioma]) => [
        codigo,
        idioma.etiqueta,
      ])
    ) as Record<CodigoDeIdioma, string>,
  };
}

/**
 * Lo que leía de cada voz y de cada saludo el panel anterior al 2026-10-05
 * (`habla`, `expresiva`, `secundariosCompatibles`). Vercel publica la app
 * antes de que Cloud Run sirva este backend, y una pestaña abierta con la
 * app anterior sigue pidiendo el catálogo después: sin estos campos, «Cómo
 * atiende» lanzaba al pintar (`voz.habla.includes`). QUITAR en la PR
 * siguiente, cuando ninguna app los pida.
 */
export interface VozDelPanelAnterior extends VozDelPanel {
  habla: "todos" | CodigoDeIdioma[];
  /** Las Ultra. */
  expresiva: boolean;
}

export interface PrincipalDelPanelAnterior extends PrincipalDelPanel {
  /** Los idiomas extranjeros que se pueden activar con este saludo (sin
   * cooficiales: el panel anterior solo las ofrecía como saludo). */
  secundariosCompatibles: CodigoDeIdioma[];
  voces: VozDelPanelAnterior[];
}

export interface CatalogoConCamposDelPanelAnterior extends CatalogoDelPanel {
  principales: PrincipalDelPanelAnterior[];
}

/** GET /business/me/idiomas: el catálogo del panel con los campos del panel
 * anterior, solo mientras dura el despliegue (ver VozDelPanelAnterior). */
export function catalogoConCamposDelPanelAnterior(
  mercado: CodigoDeMercado = MERCADO_POR_DEFECTO
): CatalogoConCamposDelPanelAnterior {
  const oferta = MERCADOS[mercado];
  const catalogo = catalogoParaElPanel(mercado);
  const delCatalogo = new Map(
    Object.values(IDIOMAS).flatMap((idioma) =>
      (idioma.voces ?? []).map((voz) => [voz.id, voz] as const)
    )
  );
  return {
    ...catalogo,
    principales: catalogo.principales.map((principal) => ({
      ...principal,
      secundariosCompatibles: oferta.secundarios.filter(
        (secundario) => secundario !== principal.codigo
      ),
      voces: principal.voces.map((voz) => {
        const original = delCatalogo.get(voz.id)!;
        return {
          ...voz,
          habla: original.habla === "todos" ? "todos" : [...original.habla],
          expresiva: original.proveedor === "telnyx",
        };
      }),
    })),
  };
}

export interface VistaPreviaDeIdiomas {
  /** La selección tal como se guardará (normalizada). */
  languages: CodigoDeIdioma[];
  /** El idioma en que saluda. */
  voiceLanguage: CodigoDeIdioma;
  /** La voz que atenderá y su género. */
  voz: string;
  voiceGender: GeneroDeVoz;
  /** De qué familia son `voces`: «soniox» con una cooficial activa. */
  familia: FamiliaDeVoces;
  /** Las voces que se pueden elegir con esta selección (entre ellas está
   * `voz`), con su muestra. */
  voces: VozDelPanel[];
  /** «Saluda en catalán y sigue en el idioma de quien llama.» */
  entradilla: string;
  /** El saludo real, con el nombre del negocio. */
  saludo: string;
  /** Lo que el dueño debe saber antes de guardar, en orden de importancia. */
  avisos: string[];
}

const enMinusculas = (codigo: CodigoDeIdioma) =>
  IDIOMAS[codigo].etiqueta.toLowerCase();

/** «catalán, euskera o gallego». */
function enumerar(palabras: readonly string[], conjuncion: string): string {
  return palabras.length < 2
    ? palabras.join("")
    : `${palabras.slice(0, -1).join(", ")} ${conjuncion} ${palabras[palabras.length - 1]}`;
}

/** Lo que el dueño debe saber de una corrección de su selección, o null si
 * no hace falta decirle nada. */
export function avisoDeCambio(
  cambio: CambioDeIdiomas,
  obligatorio: CodigoDeIdioma
): string | null {
  switch (cambio.tipo) {
    case "principal":
      if (cambio.a === obligatorio) return null;
      return esCooficial(cambio.a)
        ? `Con el ${enMinusculas(cambio.a)} activo, la recepcionista saluda en ${enMinusculas(cambio.a)} o en ${enMinusculas(obligatorio)}: saludará en ${enMinusculas(cambio.a)}.`
        : `Saludará en ${enMinusculas(cambio.a)}.`;
    case "quitado":
      if (cambio.motivo === "otraCooficial") {
        const cooficiales = CODIGOS_DE_IDIOMA.filter(esCooficial);
        return `Solo puede hablar una de estas lenguas a la vez: ${enumerar(cooficiales.map(enMinusculas), "o")}. Se quita el ${enMinusculas(cambio.idioma)}.`;
      }
      return `Se quita el ${enMinusculas(cambio.idioma)}: la voz que atiende todavía no lo habla.`;
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
  if (perfil.cooficial) {
    const cooficial = enMinusculas(perfil.cooficial);
    // Medido con llamadas reales el 2026-10-03: sin flux, el fin de turno
    // lo marca Soniox, que entiende todos los idiomas activos, y cada
    // respuesta llega hacia el segundo y medio en vez del segundo, también
    // a quien habla castellano.
    avisos.push(
      `Con el ${cooficial} activo, la recepcionista tarda algo más en contestar: hacia segundo y medio en vez de un segundo, también cuando le hablan en castellano.`
    );
    const nombres = (["femenina", "masculina"] as const)
      .map((genero) => perfil.voces.find((voz) => voz.genero === genero))
      .filter((voz): voz is VozDelCatalogo => voz !== undefined)
      .map((voz) => voz.nombre);
    avisos.push(
      `Atiende con ${enumerar(nombres, "o")}, las voces que hablan ${cooficial}.`
    );
  } else if (perfil.principal !== oferta.obligatorio) {
    avisos.push(
      `También saluda en ${enMinusculas(perfil.principal)} a los clientes de aquí; si le contestan en ${enMinusculas(oferta.obligatorio)}, sigue en ${enMinusculas(oferta.obligatorio)}.`
    );
  }
  if (
    !(oferta.principales as readonly CodigoDeIdioma[]).includes(
      perfil.principal
    )
  ) {
    avisos.push(
      `Saludar en ${enMinusculas(perfil.principal)} ya no se ofrece: lo mantenemos, pero si lo cambias no podrás volver a elegirlo.`
    );
  }

  const idiomaDeLasVoces = perfil.cooficial ?? perfil.principal;
  return {
    languages: perfil.idiomas,
    voiceLanguage: perfil.principal,
    voz: perfil.voz.id,
    voiceGender: perfil.genero,
    familia: perfil.familia,
    voces: vocesEnPanel(idiomaDeLasVoces, perfil.voces),
    entradilla:
      perfil.idiomas.length === 1
        ? `Atiende siempre en ${enMinusculas(perfil.principal)}.`
        : `Saluda en ${enMinusculas(perfil.principal)} y sigue en el idioma de quien llama.`,
    saludo: componerSaludo(perfil.principal, negocio),
    avisos,
  };
}
