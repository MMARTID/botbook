/**
 * Lo que el panel necesita de los idiomas, para que el frontend no repita
 * reglas: qué se ofrece (catalogoParaElPanel) y qué hará la recepcionista
 * con una selección (vistaPreviaDeIdiomas), con textos en español listos
 * para mostrar a un dueño que no tiene por qué saber de voces ni de
 * transcripción. Desde el 2026-10-05 el dueño solo elige el idioma
 * principal y la voz, y el panel dice cuántos idiomas habla. Puro: el
 * nombre del negocio llega como parámetro.
 */
import {
  IDIOMAS,
  MERCADOS,
  MERCADO_POR_DEFECTO,
  componerSaludo,
  esCooficial,
  familiaDeVoces,
  idiomasQueHabla,
  type CodigoDeIdioma,
  type CodigoDeMercado,
  type FamiliaDeVoces,
  type GeneroDeVoz,
  type VozDelCatalogo,
} from "./catalogo.js";
import { funcionQueExige, type CambioDeIdiomas } from "./ajustes.js";
import { resolverIdiomas, type AjustesDeIdioma } from "./resolver.js";
import { planesQueIncluyen, type PlanFeature } from "../planFeatures.js";

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

/** Cómo agrupa el panel los idiomas principales: el obligatorio y las
 * cooficiales a la vista; los extranjeros bajo «Otro idioma». */
export type TipoDeIdiomaDelPanel = "obligatorio" | "cooficial" | "extranjero";

export interface PrincipalDelPanel extends IdiomaDelPanel {
  tipo: TipoDeIdiomaDelPanel;
  /** Los que habla con este principal, en orden canónico: lo que se guarda
   * en `languages` al elegirlo (idiomasQueHabla). */
  idiomas: CodigoDeIdioma[];
  /** «Habla en 7 idiomas: español, inglés, … Saluda en español y sigue en
   * el idioma de quien llama.» */
  entradilla: string;
  /** Si elegirlo exige una función del plan: la clave que el panel busca
   * en `planFeatures` (GET /billing/summary) y el texto del candado
   * («Disponible en Pro y Scale»). null si vale cualquier plan. */
  requiere: { funcion: PlanFeature; texto: string } | null;
  /** De qué familia son sus `voces`: «ultra» (las nativas de este idioma)
   * o «soniox» (las de esta cooficial). */
  familia: FamiliaDeVoces;
  /** Las voces que atienden con este principal. Por género, la de por
   * defecto primero, luego las recomendadas y luego el resto. */
  voces: VozDelPanel[];
}

export interface CatalogoDelPanel {
  obligatorio: IdiomaDelPanel;
  principales: PrincipalDelPanel[];
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
 * frase de recepcionista en `idioma`, el principal de su lista de voces:
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

const enMinusculas = (codigo: CodigoDeIdioma) =>
  IDIOMAS[codigo].etiqueta.toLowerCase();

/** «catalán, euskera o gallego». */
function enumerar(palabras: readonly string[], conjuncion: string): string {
  return palabras.length < 2
    ? palabras.join("")
    : `${palabras.slice(0, -1).join(", ")} ${conjuncion} ${palabras[palabras.length - 1]}`;
}

/**
 * Lo que dice el panel de los idiomas que habla con `principal`: «Habla en
 * 7 idiomas: español, inglés, francés, alemán, italiano, portugués y
 * neerlandés. Saluda en español y sigue en el idioma de quien llama.» La
 * lista empieza por el principal (con una cooficial, «Habla en 8 idiomas:
 * catalán, español…»).
 */
export function entradillaDeIdiomas(
  principal: CodigoDeIdioma,
  idiomas: readonly CodigoDeIdioma[] = idiomasQueHabla(principal)
): string {
  if (idiomas.length < 2) {
    return `Atiende siempre en ${enMinusculas(principal)}.`;
  }
  const lista = [
    principal,
    ...idiomas.filter((idioma) => idioma !== principal),
  ].map(enMinusculas);
  return `Habla en ${lista.length} idiomas: ${enumerar(lista, "y")}. Saluda en ${enMinusculas(principal)} y sigue en el idioma de quien llama.`;
}

function requisitoDelPlan(
  principal: CodigoDeIdioma
): PrincipalDelPanel["requiere"] {
  const funcion = funcionQueExige(principal);
  return funcion
    ? { funcion, texto: `Disponible en ${planesQueIncluyen(funcion)}` }
    : null;
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
      idiomas: idiomasQueHabla(codigo),
      entradilla: entradillaDeIdiomas(codigo),
      requiere: requisitoDelPlan(codigo),
      familia: familiaDeVoces(codigo).familia,
      voces: vocesEnPanel(codigo, IDIOMAS[codigo].voces ?? []),
    })),
    etiquetas: Object.fromEntries(
      Object.entries(IDIOMAS).map(([codigo, idioma]) => [
        codigo,
        idioma.etiqueta,
      ])
    ) as Record<CodigoDeIdioma, string>,
  };
}

/**
 * Lo que leía de cada voz y de cada principal el panel anterior al
 * 2026-10-05, el de producción (`habla`, `expresiva`,
 * `secundariosCompatibles`). Vercel publica la app antes de que Cloud Run
 * sirva este backend, y una pestaña abierta con la app anterior sigue
 * pidiendo el catálogo después: sin estos campos, «Cómo atiende» lanzaba al
 * pintar (`voz.habla.includes`). QUITAR en la PR siguiente, cuando ninguna
 * app los pida.
 */
export interface VozDelPanelAnterior extends VozDelPanel {
  habla: "todos" | CodigoDeIdioma[];
  /** Las Ultra. */
  expresiva: boolean;
}

export interface PrincipalDelPanelAnterior extends PrincipalDelPanel {
  /** Las casillas de «¿Qué otros idiomas habla?» del panel anterior: los
   * que habla con este principal salvo el obligatorio y él mismo. Salen
   * marcadas (los `languages` guardados son todos) y desmarcarlas no cambia
   * nada al guardar. */
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
      secundariosCompatibles: principal.idiomas.filter(
        (idioma) => idioma !== oferta.obligatorio && idioma !== principal.codigo
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
  /** Los que habla con el principal, tal como se guardarán. */
  languages: CodigoDeIdioma[];
  /** El idioma principal. */
  voiceLanguage: CodigoDeIdioma;
  /** La voz que atenderá y su género. */
  voz: string;
  voiceGender: GeneroDeVoz;
  /** De qué familia son `voces`: «soniox» con un principal cooficial. */
  familia: FamiliaDeVoces;
  /** Las voces que se pueden elegir con este principal (entre ellas está
   * `voz`), con su muestra. */
  voces: VozDelPanel[];
  /** «Habla en 7 idiomas: … Saluda en español y sigue en el idioma de
   * quien llama.» (entradillaDeIdiomas). */
  entradilla: string;
  /** El saludo real, con el nombre del negocio. */
  saludo: string;
  /** Lo que el dueño debe saber antes de guardar, en orden de importancia. */
  avisos: string[];
}

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
        : `Saludará en ${enMinusculas(cambio.a)}.`;
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
    // Medido con llamadas reales el 2026-10-03 (AGENTS.md § «Idiomas de
    // atención y voz en Telnyx»): sin flux, el fin de turno lo marca
    // Soniox, y cada respuesta llega entre 1,4 y 2 segundos (p50 con
    // clientes en catalán y en castellano) frente a los 0,9 del español con
    // flux.
    avisos.push(
      `Con el ${cooficial} como idioma principal, la recepcionista tarda algo más en contestar: entre 1,4 y 2 segundos por respuesta, frente a unos 0,9 con el ${enMinusculas(oferta.obligatorio)}, también cuando le hablan en castellano.`
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
  // Con un principal de voces Ultra, flux no entiende las lenguas
  // cooficiales (47 % de error de palabra con un cliente en catalán, tanda
  // «B piloto» del laboratorio, 2026-10-05) y la voz no cambia a mitad de
  // llamada: un assistant de Telnyx tiene una sola. Que el dueño no lo
  // deduzca de «Habla en 7 idiomas». Revisar si se adopta el
  // conversation_flow que salta a Marta al oír catalán.
  const cooficiales = oferta.principales.filter(esCooficial);
  if (!perfil.cooficial && cooficiales.length > 0) {
    const funcion = funcionQueExige(cooficiales[0]);
    avisos.push(
      `No entiende ${enumerar(
        cooficiales.map((cooficial) => `el ${enMinusculas(cooficial)}`),
        "ni"
      )}: para atender en una de esas lenguas, elígela como idioma principal${
        funcion ? ` (planes ${planesQueIncluyen(funcion)})` : ""
      }.`
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

  return {
    languages: perfil.idiomas,
    voiceLanguage: perfil.principal,
    voz: perfil.voz.id,
    voiceGender: perfil.genero,
    familia: perfil.familia,
    voces: vocesEnPanel(perfil.principal, perfil.voces),
    entradilla: entradillaDeIdiomas(perfil.principal, perfil.idiomas),
    saludo: componerSaludo(perfil.principal, negocio),
    avisos,
  };
}
