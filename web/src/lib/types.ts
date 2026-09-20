/**
 * Tipos que usa la web de marketing. El contrato completo del backend vive en
 * la app (`frontend/src/lib/types.ts`); aquí solo lo que hace falta sin sesión.
 */

export type BusinessType =
  | "peluqueria"
  | "centro-de-estetica"
  | "salon-de-unas"
  | "barberia"
  | "fisioterapia"
  | "other";

export type PlanId = "inicio" | "pro" | "scale";

export type PlaceSearchResult = {
  placeId: string;
  name: string;
  address: string;
  photoUrl: string | null;
};

/** Resultado de búsqueda de la demo pública: enriquecido con foto y tipo de negocio detectado. */
export type DemoPlaceSearchResult = PlaceSearchResult & {
  businessType: BusinessType;
  photoUrl: string | null;
};

export type PlaceDetails = {
  placeId: string;
  name: string;
  address: string;
  phone: string | null;
  schedule: Record<string, unknown>;
  types: string[];
};
