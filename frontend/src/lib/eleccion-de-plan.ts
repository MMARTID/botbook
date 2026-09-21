import { isPlanId } from "./billing-navigation";
import { normalizeBusinessType } from "./business-type";
import { webUrl } from "./web-url";

/**
 * Adónde va quien pulsa «Elegir plan» en alhabla.ai/planes (ruta
 * /elegir-plan de la app). Con sesión, directo al checkout del plan; sin
 * ella, al registro de la web con el plan y el sector. Los destinos son
 * fijos y los parámetros se validan: nada de la query acaba en una URL sin
 * pasar por `isPlanId`/`normalizeBusinessType`.
 */
export function destinoDeEleccion(
  params: URLSearchParams,
  conSesion: boolean
): string {
  const plan = params.get("plan");
  const query = new URLSearchParams();
  if (isPlanId(plan)) query.set("plan", plan);
  if (conSesion) {
    return query.has("plan") ? `/checkout?${query.toString()}` : "/ajustes";
  }
  const niche = params.get("niche");
  if (niche) query.set("niche", normalizeBusinessType(niche));
  const cadena = query.toString();
  return webUrl(cadena ? `/register?${cadena}` : "/register");
}
