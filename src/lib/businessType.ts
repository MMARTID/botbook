/**
 * Tipos de negocio soportados. Se usan para elegir plantilla de agente,
 * organizar asistentes en Retell y personalizar prompts en futuras iteraciones.
 */
export const BUSINESS_TYPES = [
  "peluqueria",
  "centro-de-estetica",
  "salon-de-unas",
  "barberia",
  "fisioterapia",
  "other",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  peluqueria: "Peluquería",
  "centro-de-estetica": "Centro de estética",
  "salon-de-unas": "Salón de uñas",
  barberia: "Barbería",
  fisioterapia: "Fisioterapia",
  other: "Otros",
};

export const NICHE_SLUG_TO_BUSINESS_TYPE: Record<string, BusinessType> = {
  peluqueria: "peluqueria",
  "centro-de-estetica": "centro-de-estetica",
  "salon-de-unas": "salon-de-unas",
  barberia: "barberia",
  fisioterapia: "fisioterapia",
};

/**
 * Palabras clave de Google Places API (campo `types`) que identifican cada nicho.
 * Cada tipo de negocio tiene exactamente 2 palabras clave oficiales. Si un lugar
 * contiene al menos una de ellas, se le asigna ese tipo. El orden del objeto
 * importa: se evalúa de más específico a más genérico.
 */
export const BUSINESS_TYPE_PLACE_KEYWORDS: Record<BusinessType, string[]> = {
  barberia: ["barber_shop", "barber"],
  "salon-de-unas": ["nail_salon", "nail"],
  peluqueria: ["hair_care", "hair_salon"],
  "centro-de-estetica": ["beauty_salon", "spa"],
  fisioterapia: ["physiotherapist", "health"],
  other: [],
};

export function isBusinessType(value: unknown): value is BusinessType {
  return typeof value === "string" && BUSINESS_TYPES.includes(value as BusinessType);
}

export function normalizeBusinessType(value: unknown): BusinessType {
  if (isBusinessType(value)) return value;
  if (typeof value === "string" && value in NICHE_SLUG_TO_BUSINESS_TYPE) {
    return NICHE_SLUG_TO_BUSINESS_TYPE[value];
  }
  return "other";
}

/**
 * Detecta el tipo de negocio a partir de los `types` devueltos por Google Places API.
 * Solo se fija en si algún type contiene alguna de las palabras clave definidas.
 */
export function detectBusinessTypeFromPlaceTypes(
  placeTypes: string[] | null | undefined
): BusinessType {
  if (!Array.isArray(placeTypes)) return "other";

  for (const [businessType, keywords] of Object.entries(BUSINESS_TYPE_PLACE_KEYWORDS)) {
    if (businessType === "other") continue;
    for (const placeType of placeTypes) {
      for (const keyword of keywords) {
        if (placeType.toLowerCase().includes(keyword.toLowerCase())) {
          return businessType as BusinessType;
        }
      }
    }
  }

  return "other";
}
