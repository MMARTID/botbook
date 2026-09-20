import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

/**
 * Artículos del blog (PLAN-APP-DOMINIO.md § 4, fase 1): ficheros `.mdx` en
 * `content/blog`, con frontmatter mínimo, leídos en build. Sin CMS: escribir
 * un artículo es abrir un PR con un fichero. El nombre del fichero es el
 * slug (`/blog/<slug>`).
 */

export interface ArticuloMeta {
  slug: string;
  titulo: string;
  resumen: string;
  /** AAAA-MM-DD. */
  fecha: string;
  /** Sector al que se dirige, si alguno (para el enlace a su landing). */
  sector?: string;
  /** `true` para dejarlo fuera del listado, el sitemap y el RSS. */
  borrador?: boolean;
}

export interface Articulo extends ArticuloMeta {
  contenido: string;
}

const DIRECTORIO = path.join(process.cwd(), "content", "blog");
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function leer(slug: string): Articulo | null {
  if (!SLUG.test(slug)) return null;
  const fichero = path.join(DIRECTORIO, `${slug}.mdx`);
  if (!fs.existsSync(fichero)) return null;
  const { data, content } = matter(fs.readFileSync(fichero, "utf8"));
  if (typeof data.titulo !== "string" || typeof data.fecha !== "string") {
    throw new Error(`content/blog/${slug}.mdx: faltan «titulo» o «fecha» en el frontmatter`);
  }
  return {
    slug,
    titulo: data.titulo,
    resumen: typeof data.resumen === "string" ? data.resumen : "",
    fecha: data.fecha,
    sector: typeof data.sector === "string" ? data.sector : undefined,
    borrador: data.borrador === true,
    contenido: content,
  };
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
    .map((a) => ({ slug: a.slug, titulo: a.titulo, resumen: a.resumen, fecha: a.fecha, sector: a.sector, borrador: a.borrador }));
}

export function leerArticulo(slug: string): Articulo | null {
  const articulo = leer(slug);
  return articulo && !articulo.borrador ? articulo : null;
}

export function fechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}
