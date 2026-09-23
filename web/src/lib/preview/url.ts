/** Solo rutas internas: nada de redirigir a dominios ajenos. */
export function esDestinoInterno(destino: string): boolean {
  return /^\/(?!\/)[\w\-/?=&#.%]*$/.test(destino);
}
