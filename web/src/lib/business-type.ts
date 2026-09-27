import type { BusinessType } from "./types";

export type { BusinessType };

export const BUSINESS_TYPES: BusinessType[] = [
  "peluqueria",
  "centro-de-estetica",
  "salon-de-unas",
  "barberia",
  "fisioterapia",
  "other",
];

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

export const BUSINESS_TYPE_PLACE_KEYWORDS: Record<BusinessType, string[]> = {
  barberia: ["barber_shop", "barber"],
  "salon-de-unas": ["nail_salon", "nail"],
  peluqueria: ["hair_care", "hair_salon"],
  "centro-de-estetica": ["beauty_salon", "spa"],
  fisioterapia: ["physiotherapist", "health"],
  other: [],
};

export function isBusinessType(value: unknown): value is BusinessType {
  return (
    typeof value === "string" && BUSINESS_TYPES.includes(value as BusinessType)
  );
}

export function normalizeBusinessType(value: unknown): BusinessType {
  if (isBusinessType(value)) return value;
  if (
    typeof value === "string" &&
    value in NICHE_SLUG_TO_BUSINESS_TYPE
  ) {
    return NICHE_SLUG_TO_BUSINESS_TYPE[value];
  }
  return "other";
}

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
