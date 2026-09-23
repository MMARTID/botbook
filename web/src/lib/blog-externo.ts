import {
  BlogClient,
  readingTimeMinutes,
  stripToText,
  type BlogArticle,
  type BlogArticleSummary,
} from "babylovegrowth-next-js-blog";
import { IDIOMAS, type ArticuloMeta, type Idioma } from "./blog";

/**
 * Artículos escritos en BabyLoveGrowth (babylovegrowth.ai), que los publica en
 * su propio CMS y los sirve por API. No están en el repositorio, así que
 * Keystatic no los toca: se editan en su panel.
 *
 * Viven en el MISMO blog que los `.mdx` de `content/blog` — mismo listado,
 * misma plantilla de artículo, mismo sitemap y mismo RSS. Partir el blog en
 * dos secciones repartiría la autoridad de `alhabla.ai/blog` entre dos URLs
 * distintas, que es justo lo contrario de para lo que se contrata esto.
 *
 * Regla de oro: si la API falla o no hay clave, el blog sigue funcionando con
 * los artículos del repositorio. Nunca se rompe una página por esto, pero
 * tampoco se calla: cada fallo se registra con su motivo.
 */

const CLAVE = process.env.BABYLOVEGROWTH_BLOG_API_KEY;

/** Un día en producción; casi en vivo en desarrollo para ver los cambios. */
const REVALIDAR = process.env.NODE_ENV === "development" ? 10 : 86_400;

const cliente = CLAVE
  ? new BlogClient({
      apiKey: CLAVE,
      baseUrl: process.env.BABYLOVEGROWTH_BLOG_API_URL,
      revalidate: REVALIDAR,
    })
  : null;

/** Sin clave, todo esto se comporta como «no hay artículos externos». */
export const HAY_BLOG_EXTERNO = cliente !== null;

export interface ArticuloExterno extends ArticuloMeta {
  /** HTML ya renderizado por BabyLoveGrowth. */
  html: string;
  /** JSON-LD que manda la API, si trae (Article y FAQ). */
  jsonLd: Array<Record<string, unknown>>;
}

async function conRed<T>(que: string, tarea: () => Promise<T>, siFalla: T): Promise<T> {
  if (!cliente) return siFalla;
  try {
    return await tarea();
  } catch (error) {
    console.error(
      `[Blog] BabyLoveGrowth: ${que} falló — ${error instanceof Error ? error.message : String(error)}`,
    );
    return siFalla;
  }
}

function idiomaDe(codigo: string | undefined): Idioma | null {
  const corto = (codigo ?? "es").slice(0, 2).toLowerCase();
  return (IDIOMAS as readonly string[]).includes(corto) ? (corto as Idioma) : null;
}

/** `2026-09-23T10:11:12Z` → `2026-09-23`, que es lo que usa el resto del blog. */
function soloFecha(valor: string | undefined): string {
  const fecha = valor ? new Date(valor) : null;
  return fecha && !Number.isNaN(fecha.getTime())
    ? fecha.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
}

function aMeta(articulo: BlogArticleSummary, texto?: string): ArticuloMeta {
  const fecha = soloFecha(articulo.created_at);
  const actualizado = soloFecha(articulo.updated_at);
  return {
    slug: articulo.slug,
    titulo: articulo.title,
    resumen: articulo.meta_description || articulo.excerpt || "",
    fecha,
    actualizado: actualizado !== fecha ? actualizado : undefined,
    autor: AUTOR_EXTERNO,
    // El sector no existe en BabyLoveGrowth: sus artículos salen sin pastilla
    // y sin el bloque final de la landing del sector, no con uno inventado.
    sector: undefined,
    imagen: articulo.hero_image_url || undefined,
    imagenAlt: articulo.hero_image_url ? articulo.title : undefined,
    minutosDeLectura: texto ? readingTimeMinutes(texto) : 4,
    idioma: idiomaDe(articulo.languageCode) ?? "es",
    origen: "babylovegrowth",
  };
}

export const AUTOR_EXTERNO = "Equipo de Alhabla";

/**
 * Publicados, del más reciente al más antiguo. Se quedan fuera los idiomas
 * que la web no habla (solo castellano y catalán): un artículo en inglés en
 * alhabla.ai no lo va a leer nadie y ensucia el sitemap.
 */
export async function listarArticulosExternos(): Promise<ArticuloMeta[]> {
  const articulos = await conRed("listar artículos", () => cliente!.getAllArticles(), []);
  const descartados: string[] = [];
  const validos = articulos.filter((a) => {
    if (!a.slug || !a.title) return false;
    if (idiomaDe(a.languageCode) === null) {
      descartados.push(`${a.slug} (${a.languageCode})`);
      return false;
    }
    return true;
  });
  if (descartados.length > 0) {
    console.warn(
      `[Blog] BabyLoveGrowth: ${descartados.length} artículos fuera por idioma no soportado: ${descartados.join(", ")}`,
    );
  }
  return validos.map((a) => aMeta(a)).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/**
 * El HTML de BabyLoveGrowth empieza repitiendo dos cosas que nuestra
 * plantilla ya pinta: el título como `<h1>` y la foto de cabecera. Dejarlas
 * significa dos `<h1>` en la misma página (Google se queda con uno y no
 * sabes cuál) y la misma foto dos veces seguidas. Se quitan solo si están
 * justo al principio: en medio del texto son contenido legítimo.
 *
 * De paso, las imágenes del cuerpo salen sin `loading`, así que se marcan
 * como diferidas — son de su CDN y ninguna es la que se ve al entrar.
 */
export function limpiarHtml(html: string, heroImageUrl?: string): string {
  let limpio = html.trimStart();

  // 1. El <h1> de apertura (con o sin atributos).
  limpio = limpio.replace(/^<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i, "");

  // 2. El párrafo de apertura que solo contiene la foto de cabecera.
  if (heroImageUrl) {
    const patron = new RegExp(
      `^<p>\\s*<img\\b[^>]*src=["']${escaparParaRegExp(heroImageUrl)}["'][^>]*>\\s*</p>\\s*`,
      "i",
    );
    limpio = limpio.replace(patron, "");
  }

  // 3. Carga diferida en las imágenes que no la declaren.
  return limpio.replace(/<img\b(?![^>]*\bloading=)/gi, '<img loading="lazy"');
}

function escaparParaRegExp(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function leerArticuloExterno(slug: string): Promise<ArticuloExterno | null> {
  const articulo = await conRed<BlogArticle | null>(
    `leer «${slug}»`,
    () => cliente!.getArticleBySlug(slug),
    null,
  );
  if (!articulo || !articulo.published) return null;
  if (idiomaDe(articulo.languageCode) === null) return null;
  const html = limpiarHtml(articulo.content_html || "", articulo.hero_image_url);
  return {
    ...aMeta(articulo, stripToText(articulo.content_markdown || html)),
    html,
    jsonLd: [articulo.jsonLd, articulo.faqJsonLd].filter(
      (bloque): bloque is Record<string, unknown> => Boolean(bloque),
    ),
  };
}
