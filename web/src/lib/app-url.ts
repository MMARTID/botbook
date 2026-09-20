/**
 * Dónde vive la app (app.alhabla.ai). La web solo enlaza a ella: «Entrar»,
 * el salto tras el registro y los enlaces al panel. En desarrollo, sin la
 * variable, la app corre en el mismo puerto que antes del reparto.
 */
export const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").replace(/\/$/, "");

export function appUrl(ruta = ""): string {
  return `${appBaseUrl}${ruta}`;
}
