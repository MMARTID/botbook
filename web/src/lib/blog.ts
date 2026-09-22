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
  /** `true` para dejarlo fuera del listado, el sitemap y el RSS. */
  borrador?: boolean;
}

export interface Articulo extends ArticuloMeta {
  contenido: string;
}

export const AUTOR_POR_DEFECTO = "Equipo de Alhabla";

const DIRECTORIO = path.join(process.cwd(), "content", "blog");
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

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
  if (typeof data.titulo !== "string" || typeof data.fecha !== "string") {
    throw new Error(`content/blog/${slug}.mdx: faltan «titulo» o «fecha» en el frontmatter`);
  }
  if (!FECHA.test(data.fecha)) {
    throw new Error(`content/blog/${slug}.mdx: «fecha» debe ser AAAA-MM-DD`);
  }
  if (data.actualizado !== undefined && (typeof data.actualizado !== "string" || !FECHA.test(data.actualizado))) {
    throw new Error(`content/blog/${slug}.mdx: «actualizado» debe ser AAAA-MM-DD`);
  }
  if (data.imagen !== undefined) {
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
    fecha: data.fecha,
    actualizado: typeof data.actualizado === "string" ? data.actualizado : undefined,
    autor: typeof data.autor === "string" && data.autor.trim() ? data.autor : AUTOR_POR_DEFECTO,
    sector: typeof data.sector === "string" ? data.sector : undefined,
    imagen: typeof data.imagen === "string" ? data.imagen : undefined,
    imagenAlt: typeof data.imagenAlt === "string" ? data.imagenAlt : undefined,
    minutosDeLectura: minutosDeLectura(content),
    borrador: data.borrador === true,
    contenido: content,
  };
}

function sinContenido(a: Articulo): ArticuloMeta {
  const meta: ArticuloMeta & { contenido?: string } = { ...a };
  delete meta.contenido;
  return meta;
}

/** Publicados, del más reciente al más antiguo. */
export function listarArticulos(): ArticuloMeta[] {
  if (!fs.existsSync(DIRECTORIO)) return [];
  return fs
    .readdirSync(DIRECTORIO)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => leer(f.replace(/\.mdx$/, "")))
    .filter((a): a is Articulo => a !== null && !a.borrador)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map(sinContenido);
}

export function leerArticulo(slug: string): Articulo | null {
  const articulo = leer(slug);
  return articulo && !articulo.borrador ? articulo : null;
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
