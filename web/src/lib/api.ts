import axios from "axios";
import type { DemoPlaceSearchResult, PlaceDetails } from "./types";

/**
 * Cliente de la API para la web de marketing (PLAN-APP-DOMINIO.md § 4, fase
 * 1): solo lo que la web necesita sin sesión — el registro, el enlace de
 * Google Login y la demo de voz. Todo lo demás vive en la app
 * (`frontend/src/lib/api.ts`). Sin interceptor de token: aquí nunca hay
 * sesión que adjuntar.
 */

const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

// Sin esta variable, el bundle cae en el rewrite de next.config.mjs, que
// apunta a http://localhost:3000 — en Vercel eso es la propia función
// serverless y el registro y la demo quedan mudos. Rompe el build en vez de
// desplegarse roto (misma lección que en la app).
if (!configuredBaseUrl && process.env.NODE_ENV === "production") {
  throw new Error(
    "Falta NEXT_PUBLIC_API_BASE_URL. En producción la web tiene que apuntar al backend real (https://api.alhabla.ai); el rewrite a localhost:3000 solo vale en desarrollo.",
  );
}

export const api = axios.create({
  baseURL: configuredBaseUrl ?? "/api/backend",
});

export async function getGoogleAuthUrl(acceptedTerms?: boolean) {
  const { data } = await api.get<{ url: string }>("/auth/google", {
    params: acceptedTerms ? { acceptedTerms: "true" } : undefined,
  });
  return data.url;
}

export type RegisterInput = {
  email: string;
  password: string;
  isEuropeanUnion: boolean;
  acceptedTerms: boolean;
  businessType?: string;
};

/** Crea la cuenta. `pase` es el código de un solo uso con el que la app abre
 * la sesión (`/auth/entrar?pase=`); `token` sigue viniendo por compatibilidad. */
export async function registerAccount(input: RegisterInput) {
  const { data } = await api.post<{ token: string; pase?: string }>("/auth/register", input);
  return data;
}

/** Datos mínimos que la landing pública puede usar para contextualizar una demo. */
export type DemoPlaceDetails = Pick<PlaceDetails, "placeId" | "name" | "address" | "types">;

/**
 * Google Places para la demo pública. Se mantiene separado de la búsqueda de
 * registro, que requiere sesión y devuelve la ficha completa del negocio.
 */
export async function searchDemoPlaces(query: string) {
  const { data } = await api.get<{ results: DemoPlaceSearchResult[] }>("/demo/places/autocomplete", {
    params: { q: query },
  });
  return data.results;
}

export async function getDemoPlaceDetails(placeId: string) {
  const { data } = await api.get<DemoPlaceDetails>(`/demo/places/details/${encodeURIComponent(placeId)}`);
  return data;
}

export type DemoWebCall = {
  /** Assistant de Telnyx de la cuenta de demostración del nicho. */
  assistantId: string;
  niche: string;
  maxDurationSeconds: number;
};

export async function createDemoWebCall(niche?: string, placeId?: string) {
  // Timeout explícito: sin uno, un fallo de red silencioso deja al visitante
  // mirando "Conectando demo…" indefinidamente en vez de ver un error
  // accionable. Al expirar, axios lanza un error cuyo mensaje contiene
  // "timeout" — el mismo texto en español que ya usa describeDemoError()
  // para el resto de fallos de red se muestra sin cambios adicionales.
  const { data } = await api.post<DemoWebCall>(
    "/demo/web-call",
    {
      ...(niche ? { niche } : {}),
      ...(placeId ? { placeId } : {}),
    },
    { timeout: 15000 },
  );
  return data;
}
