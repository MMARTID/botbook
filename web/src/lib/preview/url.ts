/**
 * «Ver vista previa» desde el editor del blog. Keystatic guarda cada
 * artículo en una rama (`blog/…`) y Vercel construye esa rama como
 * despliegue de previsualización con una URL previsible
 * (`<proyecto>-git-<rama>-<equipo>.vercel.app`). Aquí se calcula esa URL;
 * en `main` es la web publicada, y en desarrollo la propia ruta local.
 */
const PROYECTO = "alhabla-web";
const EQUIPO = "mmartids-projects";

/** La rama como la escribe Vercel en el subdominio. */
export function etiquetaDeRama(rama: string): string {
  const base = rama
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // El host completo no puede pasar de 63 caracteres.
  const maximo = 63 - `${PROYECTO}-git-`.length - `-${EQUIPO}`.length;
  return base.slice(0, maximo).replace(/-+$/g, "");
}

export function urlDePrevisualizacion(
  rama: string,
  destino: string,
  entorno: { enVercel: boolean; sitio: string }
): string {
  const ruta = destino.startsWith("/") ? destino : `/${destino}`;
  if (!entorno.enVercel) return ruta;
  if (rama === "main") return `${entorno.sitio}${ruta}`;
  return `https://${PROYECTO}-git-${etiquetaDeRama(rama)}-${EQUIPO}.vercel.app${ruta}`;
}

/** Solo rutas internas: nada de redirigir a dominios ajenos. */
export function esDestinoInterno(destino: string): boolean {
  return /^\/(?!\/)[\w\-/?=&#.%]*$/.test(destino);
}
