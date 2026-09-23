import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { absoluteUrl } from "@/lib/seo";

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
  /** Imagen de cabecera: ruta bajo `public/` (p. ej. `/blog/<slug>/portada.jpg`)
   * o URL de Unsplash/Pexels (los únicos hosts remotos permitidos, declarados
   * en `images.remotePatterns` de next.config). */
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
  /** Los artículos se editan en `content/blog/*.mdx` con Keystatic. */
  origen: "propio";
}

export interface Articulo extends ArticuloMeta {
  contenido: string;
}

export const AUTOR_POR_DEFECTO = "Equipo de Alhabla";

const DIRECTORIO = path.join(process.cwd(), "content", "blog");
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Cabeceras remotas permitidas, además de las locales bajo `public/`. Solo
 * Unsplash y Pexels (licencia libre verificable); cualquier otro host no pasa
 * la validación, igual que no pasaría por `next/image`. */
const IMAGEN_REMOTA = /^https:\/\/(images\.unsplash\.com|images\.pexels\.com)\//;

/** Solo las ramas que crea Keystatic para un artículo o la principal. */
export function esRamaDePrevisualizacion(rama: string): boolean {
  return rama === "main" || /^blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rama);
}

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

/** URL absoluta de la cabecera para los datos estructurados: las remotas
 * (Unsplash/Pexels) ya lo son; las locales cuelgan del dominio del sitio. */
export function urlAbsolutaDeImagen(imagen: string): string {
  return imagen.startsWith("http") ? imagen : absoluteUrl(imagen);
}

function articuloDesdeMdx(slug: string, fuente: string): Articulo | null {
  if (!SLUG.test(slug)) return null;
  const { data, content } = matter(fuente);
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
    if (typeof data.imagen !== "string" || !(data.imagen.startsWith("/") || IMAGEN_REMOTA.test(data.imagen))) {
      throw new Error(
        `content/blog/${slug}.mdx: «imagen» debe ser una ruta bajo public/ (p. ej. /blog/${slug}/portada.jpg) o una URL de Unsplash/Pexels`,
      );
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

function leer(slug: string): Articulo | null {
  if (!SLUG.test(slug)) return null;
  const fichero = path.join(DIRECTORIO, `${slug}.mdx`);
  if (!fs.existsSync(fichero)) return null;
  return articuloDesdeMdx(slug, fs.readFileSync(fichero, "utf8"));
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
 * Lee el artículo exactamente como está guardado en la rama del editor. La
 * petición se hace con el token temporal de la sesión de Keystatic, por lo
 * que un borrador no se hace público ni depende de una URL de Vercel.
 */
export async function leerArticuloDePrevisualizacion(
  slug: string,
  rama: string,
  tokenDeGitHub: string
): Promise<Articulo | null> {
  if (!SLUG.test(slug) || !esRamaDePrevisualizacion(rama) || !tokenDeGitHub) return null;
  const ruta = `web/content/blog/${slug}.mdx`;
  const url = new URL(`https://api.github.com/repos/MMARTID/botbook/contents/${ruta}`);
  url.searchParams.set("ref", rama);
  const respuesta = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${tokenDeGitHub}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  if (!respuesta.ok) return null;
  const archivo: unknown = await respuesta.json();
  if (
    !archivo ||
    typeof archivo !== "object" ||
    !("content" in archivo) ||
    typeof archivo.content !== "string" ||
    !("encoding" in archivo) ||
    archivo.encoding !== "base64"
  ) {
    return null;
  }
  return articuloDesdeMdx(slug, Buffer.from(archivo.content.replace(/\n/g, ""), "base64").toString("utf8"));
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
