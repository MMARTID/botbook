/** `?next=/checkout?plan=pro` tras un 401: solo rutas internas de la app
 * (una URL absoluta o `//host` sería un redirect abierto). */
export function destinoTrasLogin(search: string): string {
  const next = new URLSearchParams(search).get("next");
  return next && /^\/(?!\/)/.test(next) ? next : "/";
}
