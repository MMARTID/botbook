/**
 * Cuántos proxies hay delante del backend, para que Fastify calcule
 * `request.ip` (la clave de todos los límites por IP: login, recuperar
 * contraseña, la demo de la web).
 *
 * Cada proxy AÑADE la IP de quien le habla al final de X-Forwarded-For, así
 * que lo que hay a la izquierda lo escribe el cliente y se puede falsificar.
 * Con `trustProxy: true` Fastify confiaba en toda la cadena y tomaba la
 * entrada de más a la izquierda: rotando esa cabecera, cada intento de login
 * caía en un cubo nuevo del rate limit. Con N saltos de confianza, la IP es la
 * que escribió el proxy más externo, que ya no la controla el cliente.
 *
 * - Cloud Run servido directamente (URL run.app o domain mapping) y el túnel
 *   de Cloudflare de desarrollo: 1 salto (el valor por defecto).
 * - Detrás de un balanceador HTTPS externo de Google: 2 saltos.
 */
export function saltosDeProxyDeConfianza(
  valor: string | undefined = process.env.TRUST_PROXY_HOPS
): number {
  if (valor === undefined || valor.trim() === "") return 1;
  const saltos = Number(valor);
  if (!Number.isInteger(saltos) || saltos < 0 || saltos > 5) {
    throw new Error(
      `TRUST_PROXY_HOPS debe ser un entero entre 0 y 5 (recibido: "${valor}")`
    );
  }
  return saltos;
}

/**
 * Función de confianza para `trustProxy`. Desde fastify 5.12.5 un número de
 * saltos se trata como «no confiar en nadie» (no puede validar quién es el
 * par inmediato), así que se pasa como función. Es seguro aquí porque el
 * contenedor de Cloud Run solo es alcanzable a través del proxy de Google.
 */
export function confianzaEnProxies(
  saltos: number = saltosDeProxyDeConfianza()
): (direccion: string, salto: number) => boolean {
  return (_direccion, salto) => salto < saltos;
}
