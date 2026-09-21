/**
 * Dónde vive la web pública (alhabla.ai): landing, planes, legal y el
 * registro de cuenta. La app solo enlaza a ella (PLAN-APP-DOMINIO.md § 4).
 * En desarrollo la web corre en :3002.
 */
export const webBaseUrl = (process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3002").replace(/\/$/, "");

export function webUrl(ruta = ""): string {
  return `${webBaseUrl}${ruta}`;
}
