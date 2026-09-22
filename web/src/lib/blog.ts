import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

/**
 * Artículos del blog (PLAN-APP-DOMINIO.md § 4, fase 1): ficheros `.mdx` en
 * `content/blog`, con frontmatter, leídos en build. Sin CMS: escribir un
 * artículo es abrir un PR con un fichero. El nombre del fichero es el slug
 * (`/blog/<slug>`). Las reglas de redacción e imágenes están en
 * `content/blog/README.md`.
 */

export interface ArticuloMeta {
  slug: string;
  titulo: string;
  resumen: string;
  /** AAAA-MM-DD. */
  fecha: string;
  /** AAAA-MM-DD de la última revisión de fondo; sin él, la de publicación. */
  actualizado?: string;
  /** Quien firma; por defecto «Equipo de Alhabla». */
  autor: string;
  /** Sector al que se dirige, si alguno (para el enlace a su landing). */
  sector?: string;
  /** Imagen de cabecera: ruta bajo `public/` (p. ej. `/blog/<slug>/portada.jpg`). */
  imagen?: string;
  /** Texto alternativo de la imagen de cabecera (obligatorio si hay imagen). */
  imagenAlt?: string;
  /** Minutos de lectura estimados (200 palabras por minuto, mínimo 1). */
  minutosDeLectura: number;
  /** Idioma del texto: castellano por defecto; catalán para las landings de
   * Cataluña, Valencia y Baleares (va al `lang` del artículo y a Google). */
  idioma: Idioma;
  /** `true` para dejarlo fuera del listado, el sitemap y el RSS. */
  borrador?: boolean;
  /** De dónde sale el artículo: `content/blog/*.mdx` o el CMS de
   * BabyLoveGrowth (ver `blog-externo.ts`). Los dos comparten listado,
   * plantilla, sitemap y RSS; solo cambia de dónde se lee el cuerpo. */
  origen: Origen;
}

export const ORIGENES = ["propio", "babylovegrowth"] as const;
export type Origen = (typeof ORIGENES)[number];

/** Las fotos de BabyLoveGrowth son URLs absolutas de su CDN; las nuestras,
 * rutas bajo `public/`. Solo las segundas pasan por `next/image`. */
export function esImagenRemota(src: string): boolean {
  return /^https?:\/\//.test(src);
}

export interface Articulo extends ArticuloMeta {
  contenido: string;
}

export const AUTOR_POR_DEFECTO = "Equipo de Alhabla";

const DIRECTORIO = path.join(process.cwd(), "content", "blog");
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** El editor (Keystatic) escribe `fecha: 2026-09-21` sin comillas y YAML lo
 * entrega como Date; a mano suele ir entre comillas. Se aceptan las dos. */
function comoFecha(valor: unknown): string | undefined {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }
  return typeof valor === "string" ? valor : undefined;
}

export const IDIOMAS = ["es", "ca"] as const;
export type Idioma = (typeof IDIOMAS)[number];

/** 200 palabras por minuto es la media de lectura en pantalla; se ignoran
 * el frontmatter (ya separado) y la sintaxis de Markdown. */
export function minutosDeLectura(contenido: string): number {
  const palabras = contenido
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_`>\-|]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(palabras / 200));
}

function leer(slug: string): Articulo | null {
  if (!SLUG.test(slug)) return null;
  const fichero = path.join(DIRECTORIO, `${slug}.mdx`);
  if (!fs.existsSync(fichero)) return null;
  const { data, content } = matter(fs.readFileSync(fichero, "utf8"));
  const fecha = comoFecha(data.fecha);
  const actualizado = comoFecha(data.actualizado);
  if (typeof data.titulo !== "string" || !fecha) {
    throw new Error(`content/blog/${slug}.mdx: faltan «titulo» o «fecha» en el frontmatter`);
  }
  if (!FECHA.test(fecha)) {
    throw new Error(`content/blog/${slug}.mdx: «fecha» debe ser AAAA-MM-DD`);
  }
  if (data.actualizado !== undefined && data.actualizado !== null && (!actualizado || !FECHA.test(actualizado))) {
    throw new Error(`content/blog/${slug}.mdx: «actualizado» debe ser AAAA-MM-DD`);
  }
  if (data.idioma !== undefined && data.idioma !== "es" && data.idioma !== "ca") {
    throw new Error(`content/blog/${slug}.mdx: «idioma» debe ser «es» o «ca»`);
  }
  if (data.imagen !== undefined && data.imagen !== null && data.imagen !== "") {
    if (typeof data.imagen !== "string" || !data.imagen.startsWith("/")) {
      throw new Error(`content/blog/${slug}.mdx: «imagen» debe ser una ruta bajo public/, p. ej. /blog/${slug}/portada.jpg`);
    }
    if (typeof data.imagenAlt !== "string" || !data.imagenAlt.trim()) {
      throw new Error(`content/blog/${slug}.mdx: con «imagen» hace falta «imagenAlt» (qué se ve en la foto)`);
    }
  }
  return {
    slug,
    titulo: data.titulo,
    resumen: typeof data.resumen === "string" ? data.resumen : "",
    fecha,
    actualizado,
    autor: typeof data.autor === "string" && data.autor.trim() ? data.autor : AUTOR_POR_DEFECTO,
    sector: typeof data.sector === "string" && data.sector ? data.sector : undefined,
    imagen: typeof data.imagen === "string" && data.imagen ? data.imagen : undefined,
    imagenAlt: typeof data.imagenAlt === "string" && data.imagenAlt ? data.imagenAlt : undefined,
    idioma: data.idioma === "ca" ? "ca" : "es",
    minutosDeLectura: minutosDeLectura(content),
    borrador: data.borrador === true,
    origen: "propio",
    contenido: content,
  };
}

function sinContenido(a: Articulo): ArticuloMeta {
  const meta: ArticuloMeta & { contenido?: string } = { ...a };
  delete meta.contenido;
  return meta;
}

/** En producción los borradores no existen (404); en las previsualizaciones
 * de Vercel y en desarrollo sí, para poder verlos antes de publicar. */
const MOSTRAR_BORRADORES = process.env.VERCEL_ENV !== "production";

/** Publicados, del más reciente al más antiguo. Con `incluirBorradores`
 * también los borradores (solo para generar sus páginas en previsualización;
 * el listado, el sitemap y el RSS nunca los enseñan). */
export function listarArticulos(opciones: { incluirBorradores?: boolean } = {}): ArticuloMeta[] {
  if (!fs.existsSync(DIRECTORIO)) return [];
  const conBorradores = Boolean(opciones.incluirBorradores) && MOSTRAR_BORRADORES;
  return fs
    .readdirSync(DIRECTORIO)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => leer(f.replace(/\.mdx$/, "")))
    .filter((a): a is Articulo => a !== null && (conBorradores || !a.borrador))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map(sinContenido);
}

export function leerArticulo(slug: string): Articulo | null {
  const articulo = leer(slug);
  return articulo && (MOSTRAR_BORRADORES || !articulo.borrador) ? articulo : null;
}

/**
 * Otros artículos para «Sigue leyendo»: primero los del mismo sector, luego
 * el resto por fecha. Nunca el propio artículo.
 */
export function articulosRelacionados(
  actual: Pick<ArticuloMeta, "slug" | "sector">,
  todos: ArticuloMeta[],
  maximo = 3
): ArticuloMeta[] {
  const otros = todos.filter((a) => a.slug !== actual.slug);
  const mismoSector = otros.filter((a) => actual.sector && a.sector === actual.sector);
  const resto = otros.filter((a) => !mismoSector.includes(a));
  return [...mismoSector, ...resto].slice(0, maximo);
}

export function fechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/**
 * El blog completo: los artículos del repositorio y los de BabyLoveGrowth,
 * mezclados por fecha y sin duplicados. Si un slug existe en los dos sitios
 * gana el del repositorio (es el que podemos editar y revisar aquí) y se
 * avisa por consola, porque tener el mismo artículo dos veces en el sitemap
 * es contenido duplicado.
 *
 * Es asíncrona porque los externos llegan por red; el listado, el sitemap, el
 * RSS y las páginas de artículo la usan en lugar de `listarArticulos()`.
 */
export async function listarTodosLosArticulos(): Promise<ArticuloMeta[]> {
  const { listarArticulosExternos } = await import("./blog-externo");
  const propios = listarArticulos();
  const externos = await listarArticulosExternos();
  const slugsPropios = new Set(propios.map((a) => a.slug));
  const repetidos = externos.filter((a) => slugsPropios.has(a.slug)).map((a) => a.slug);
  if (repetidos.length > 0) {
    console.warn(
      `[Blog] slugs en el repositorio y en BabyLoveGrowth a la vez (gana el del repositorio): ${repetidos.join(", ")}`,
    );
  }
  return [...propios, ...externos.filter((a) => !slugsPropios.has(a.slug))].sort((a, b) =>
    b.fecha.localeCompare(a.fecha),
  );
}
