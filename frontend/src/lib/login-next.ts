/** `?next=/checkout?plan=pro` tras un 401: solo rutas internas de la app
 * (una URL absoluta o `//host` sería un redirect abierto). */
export function destinoTrasLogin(search: string): string {
  const next = new URLSearchParams(search).get("next");
  if (!next || !next.startsWith("/")) return "/";
  // El navegador trata `\` como `/` y descarta tabuladores y saltos de línea
  // al resolver la URL, así que `/\host` o `/<tab>/host` acaban en otro
  // dominio. Se resuelve contra un origen ficticio y solo vale si sigue en él.
  try {
    const base = "https://app.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
