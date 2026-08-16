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

type OnboardingStepTexts = {
  heading: string;
  subheading: string;
  cta: string;
};

export const BUSINESS_TYPE_ONBOARDING_TEXTS: Record<
  BusinessType,
  {
    services: OnboardingStepTexts;
    team: OnboardingStepTexts & { employeeLabel: string };
    calendar: OnboardingStepTexts;
  }
> = {
  peluqueria: {
    services: {
      heading: "¿Qué servicios ofrece tu peluquería?",
      subheading: "Selecciona los cortes, tintes y tratamientos que sueles reservar por teléfono. Los marcamos todos por defecto; quita los que no apliquen.",
      cta: "Continuar con {count} servicio{s}",
    },
    team: {
      heading: "¿Cuántas personas atienden en tu peluquería?",
      subheading: "Configuraremos un profesional por cada persona que coja citas. Podrás renombrarlos después en ajustes.",
      cta: "Guardar equipo y continuar",
      employeeLabel: "Estilistas / peluqueros",
    },
    calendar: {
      heading: "Conecta el calendario de tu peluquería",
      subheading: "El asistente consultará disponibilidad y reservará citas directamente en tu agenda. Elige el calendario que usas a diario.",
      cta: "Conectar calendario",
    },
  },
  barberia: {
    services: {
      heading: "¿Qué servicios ofrece tu barbería?",
      subheading: "Selecciona cortes, arreglos de barba y packs que suelas reservar por teléfono. Los marcamos todos por defecto; quita los que no apliquen.",
      cta: "Continuar con {count} servicio{s}",
    },
    team: {
      heading: "¿Cuántos barberos trabajan en tu barbería?",
      subheading: "Configuraremos un profesional por cada barbero que coja citas. Podrás renombrarlos después en ajustes.",
      cta: "Guardar equipo y continuar",
      employeeLabel: "Barberos",
    },
    calendar: {
      heading: "Conecta el calendario de tu barbería",
      subheading: "El asistente consultará huecos y reservará cortes y barbas directamente en tu agenda. Elige el calendario que usas a diario.",
      cta: "Conectar calendario",
    },
  },
  "centro-de-estetica": {
    services: {
      heading: "¿Qué servicios ofrece tu centro de estética?",
      subheading: "Selecciona tratamientos faciales, masajes y depilaciones que suelas reservar por teléfono. Los marcamos todos por defecto; quita los que no apliquen.",
      cta: "Continuar con {count} servicio{s}",
    },
    team: {
      heading: "¿Cuántas personas atienden en tu centro?",
      subheading: "Configuraremos un profesional por cada persona que coja citas. Podrás renombrarlos después en ajustes.",
      cta: "Guardar equipo y continuar",
      employeeLabel: "Esteticistas / terapeutas",
    },
    calendar: {
      heading: "Conecta el calendario de tu centro de estética",
      subheading: "El asistente consultará disponibilidad y reservará tratamientos directamente en tu agenda. Elige el calendario que usas a diario.",
      cta: "Conectar calendario",
    },
  },
  "salon-de-unas": {
    services: {
      heading: "¿Qué servicios ofrece tu salón de uñas?",
      subheading: "Selecciona manicuras, pedicuras y nail art que suelas reservar por teléfono. Los marcamos todos por defecto; quita los que no apliquen.",
      cta: "Continuar con {count} servicio{s}",
    },
    team: {
      heading: "¿Cuántas personas atienden en tu salón de uñas?",
      subheading: "Configuraremos un profesional por cada persona que coja citas. Podrás renombrarlos después en ajustes.",
      cta: "Guardar equipo y continuar",
      employeeLabel: "Técnicas de uñas",
    },
    calendar: {
      heading: "Conecta el calendario de tu salón de uñas",
      subheading: "El asistente consultará huecos y reservará manicuras y pedicuras directamente en tu agenda. Elige el calendario que usas a diario.",
      cta: "Conectar calendario",
    },
  },
  fisioterapia: {
    services: {
      heading: "¿Qué servicios ofrece tu clínica de fisioterapia?",
      subheading: "Selecciona valoraciones, sesiones y rehabilitaciones que suelas reservar por teléfono. Los marcamos todos por defecto; quita los que no apliquen.",
      cta: "Continuar con {count} servicio{s}",
    },
    team: {
      heading: "¿Cuántos fisioterapeutas trabajan en tu clínica?",
      subheading: "Configuraremos un profesional por cada fisioterapeuta que coja citas. Podrás renombrarlos después en ajustes.",
      cta: "Guardar equipo y continuar",
      employeeLabel: "Fisioterapeutas",
    },
    calendar: {
      heading: "Conecta el calendario de tu clínica de fisioterapia",
      subheading: "El asistente consultará huecos y reservará sesiones directamente en tu agenda. Elige el calendario que usas a diario.",
      cta: "Conectar calendario",
    },
  },
  other: {
    services: {
      heading: "¿Qué servicios ofreces?",
      subheading: "Selecciona los servicios que sueles reservar por teléfono. Los marcamos todos por defecto; quita los que no apliquen.",
      cta: "Continuar con {count} servicio{s}",
    },
    team: {
      heading: "¿Cuántas personas atienden en tu negocio?",
      subheading: "Configuraremos un profesional por cada persona que coja citas. Podrás renombrarlos después en ajustes.",
      cta: "Guardar equipo y continuar",
      employeeLabel: "Profesionales",
    },
    calendar: {
      heading: "Conecta tu calendario",
      subheading: "El asistente consultará disponibilidad y reservará citas directamente en tu agenda. Elige el calendario que usas a diario.",
      cta: "Conectar calendario",
    },
  },
};
