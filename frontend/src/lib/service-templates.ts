import type { BusinessType } from "./types";

export type ServiceTemplate = {
  name: string;
  durationMinutes: number;
};

export type ServiceTemplateCategory = {
  category: string;
  services: ServiceTemplate[];
};

export const SERVICE_TEMPLATE_CATEGORIES: Record<
  BusinessType,
  ServiceTemplateCategory[]
> = {
  peluqueria: [
    {
      category: "Cortes",
      services: [
        { name: "Corte", durationMinutes: 30 },
        { name: "Corte infantil", durationMinutes: 30 },
        { name: "Corte con lavado y peinado", durationMinutes: 60 },
        { name: "Corte y barba", durationMinutes: 45 },
        { name: "Repaso de nuca y patillas", durationMinutes: 15 },
      ],
    },
    {
      category: "Color",
      services: [
        { name: "Coloración", durationMinutes: 90 },
        { name: "Mechas", durationMinutes: 120 },
        { name: "Babylights / Balayage", durationMinutes: 150 },
        { name: "Matiz / Baño de color", durationMinutes: 30 },
        { name: "Decoloración", durationMinutes: 150 },
        { name: "Retoque de raíces", durationMinutes: 60 },
        { name: "Mechas californianas", durationMinutes: 120 },
      ],
    },
    {
      category: "Tratamientos",
      services: [
        { name: "Tratamiento capilar", durationMinutes: 45 },
        { name: "Alisado de keratina", durationMinutes: 180 },
        { name: "Botox capilar", durationMinutes: 90 },
        { name: "Permanente", durationMinutes: 120 },
        { name: "Hidratación profunda", durationMinutes: 45 },
      ],
    },
    {
      category: "Peinado y eventos",
      services: [
        { name: "Peinado", durationMinutes: 30 },
        { name: "Lavar y peinar / Brushing", durationMinutes: 45 },
        { name: "Recogido de fiesta / Novia", durationMinutes: 90 },
        { name: "Prueba de peinado para novia", durationMinutes: 90 },
        { name: "Ondas / Rizado con plancha", durationMinutes: 30 },
      ],
    },
  ],
  barberia: [
    {
      category: "Cortes",
      services: [
        { name: "Corte", durationMinutes: 30 },
        { name: "Degradado / Fade", durationMinutes: 35 },
        { name: "Corte con lavado", durationMinutes: 40 },
        { name: "Corte infantil", durationMinutes: 25 },
        { name: "Corte jubilado / Niño", durationMinutes: 25 },
      ],
    },
    {
      category: "Barba",
      services: [
        { name: "Arreglo de barba", durationMinutes: 20 },
        { name: "Afeitado", durationMinutes: 30 },
        { name: "Afeitado tradicional a navaja con toalla caliente", durationMinutes: 40 },
        { name: "Diseño de barba y perfilado", durationMinutes: 25 },
        { name: "Tinte o camuflaje de canas para barba", durationMinutes: 20 },
      ],
    },
    {
      category: "Packs",
      services: [
        { name: "Corte y barba", durationMinutes: 45 },
        { name: "Corte, barba y cejas", durationMinutes: 60 },
        { name: "Corte, barba y tratamiento facial", durationMinutes: 75 },
      ],
    },
    {
      category: "Extras",
      services: [
        { name: "Arreglo de cejas", durationMinutes: 15 },
        { name: "Tratamiento facial", durationMinutes: 30 },
        { name: "Tinte o camuflaje de canas para cabello", durationMinutes: 30 },
        { name: "Mascarilla facial exprés", durationMinutes: 20 },
      ],
    },
  ],
  "centro-de-estetica": [
    {
      category: "Facial",
      services: [
        { name: "Limpieza facial", durationMinutes: 60 },
        { name: "Higiene facial profunda con punta de diamante", durationMinutes: 60 },
        { name: "Peeling facial", durationMinutes: 45 },
        { name: "Microdermoabrasión", durationMinutes: 45 },
        { name: "Radiofrecuencia facial", durationMinutes: 45 },
        { name: "Tratamiento facial", durationMinutes: 75 },
      ],
    },
    {
      category: "Corporal",
      services: [
        { name: "Masaje relajante", durationMinutes: 60 },
        { name: "Masaje descontracturante", durationMinutes: 60 },
        { name: "Tratamiento reductor / Maderoterapia", durationMinutes: 60 },
        { name: "Presoterapia", durationMinutes: 45 },
        { name: "Radiofrecuencia corporal", durationMinutes: 45 },
      ],
    },
    {
      category: "Depilación",
      services: [
        { name: "Depilación", durationMinutes: 30 },
        { name: "Depilación láser (zona pequeña)", durationMinutes: 15 },
        { name: "Depilación láser (cuerpo entero)", durationMinutes: 60 },
        { name: "Depilación a la cera (piernas enteras + ingles)", durationMinutes: 45 },
        { name: "Depilación a la cera (cejas y labio)", durationMinutes: 20 },
        { name: "Diseño y depilación de cejas con hilo", durationMinutes: 20 },
      ],
    },
    {
      category: "Mirada y manos",
      services: [
        { name: "Lifting y tinte de pestañas", durationMinutes: 60 },
        { name: "Extensión de pestañas", durationMinutes: 90 },
        { name: "Manicura", durationMinutes: 45 },
      ],
    },
  ],
  "salon-de-unas": [
    {
      category: "Manicura",
      services: [
        { name: "Manicura", durationMinutes: 30 },
        { name: "Manicura y pedicura", durationMinutes: 75 },
        { name: "Manicura rusa / Combinada", durationMinutes: 50 },
        { name: "Manicura tradicional", durationMinutes: 30 },
        { name: "Manicura francesa", durationMinutes: 45 },
      ],
    },
    {
      category: "Pedicura",
      services: [
        { name: "Pedicura", durationMinutes: 45 },
        { name: "Pedicura completa con spa y durezas", durationMinutes: 60 },
        { name: "Pedicura con esmaltado semipermanente", durationMinutes: 60 },
      ],
    },
    {
      category: "Esmaltado permanente",
      services: [
        { name: "Esmaltado semipermanente", durationMinutes: 45 },
        { name: "Retirada de semipermanente / Gel", durationMinutes: 20 },
        { name: "Retirada de acrílico", durationMinutes: 20 },
      ],
    },
    {
      category: "Extensiones",
      services: [
        { name: "Uñas acrílicas", durationMinutes: 60 },
        { name: "Relleno de gel / Acrílico", durationMinutes: 60 },
        { name: "Extensión de uñas con gel", durationMinutes: 90 },
        { name: "Extensión de uñas soft gel", durationMinutes: 75 },
        { name: "Nivelación con base de refuerzo", durationMinutes: 60 },
        { name: "Reconstrucción de uña rota", durationMinutes: 15 },
      ],
    },
    {
      category: "Decoración",
      services: [
        { name: "Nail art / Decoración (por unidad)", durationMinutes: 15 },
        { name: "Piedras y pedrería (por unidad)", durationMinutes: 10 },
      ],
    },
  ],
  fisioterapia: [
    {
      category: "Valoración",
      services: [
        { name: "Valoración", durationMinutes: 30 },
        { name: "Primera valoración de fisioterapia", durationMinutes: 60 },
      ],
    },
    {
      category: "Sesiones",
      services: [
        { name: "Sesión de fisioterapia", durationMinutes: 45 },
        { name: "Sesión de seguimiento", durationMinutes: 45 },
        { name: "Terapia manual", durationMinutes: 45 },
        { name: "Rehabilitación", durationMinutes: 60 },
      ],
    },
    {
      category: "Especializadas",
      services: [
        { name: "Tratamiento de punción seca", durationMinutes: 45 },
        { name: "Drenaje linfático manual", durationMinutes: 50 },
        { name: "Electrolisis percutánea (EPI)", durationMinutes: 45 },
        { name: "Sesión de Osteopatía", durationMinutes: 50 },
        { name: "Fisioterapia del suelo pélvico", durationMinutes: 60 },
        { name: "Fisioterapia para ATM", durationMinutes: 45 },
        { name: "Fisioterapia respiratoria", durationMinutes: 45 },
      ],
    },
    {
      category: "Deportiva",
      services: [
        { name: "Fisioterapia deportiva / Descarga muscular", durationMinutes: 50 },
        { name: "Readaptación deportiva", durationMinutes: 60 },
        { name: "Masaje terapéutico", durationMinutes: 30 },
        { name: "Vendaje neuromuscular", durationMinutes: 20 },
      ],
    },
  ],
  other: [
    {
      category: "General",
      services: [
        { name: "Consulta inicial", durationMinutes: 30 },
        { name: "Sesión estándar", durationMinutes: 60 },
        { name: "Seguimiento", durationMinutes: 30 },
        { name: "Cita de asesoramiento", durationMinutes: 30 },
      ],
    },
    {
      category: "Extras",
      services: [
        { name: "Bono / Sesión de revisión", durationMinutes: 45 },
        { name: "Urgencia", durationMinutes: 30 },
        { name: "Servicio a domicilio", durationMinutes: 60 },
        { name: "Sesión extendida", durationMinutes: 90 },
        { name: "Recogida o entrega", durationMinutes: 15 },
      ],
    },
  ],
};

/** Lista plana (todas las categorías juntas) para lo que no necesita
 * agrupación — p. ej. buscar por nombre o construir el set inicial. */
export function getServiceTemplate(businessType: BusinessType): ServiceTemplate[] {
  const categories = SERVICE_TEMPLATE_CATEGORIES[businessType] ?? SERVICE_TEMPLATE_CATEGORIES.other;
  return categories.flatMap((category) => category.services);
}

export function getServiceTemplateCategories(
  businessType: BusinessType
): ServiceTemplateCategory[] {
  return SERVICE_TEMPLATE_CATEGORIES[businessType] ?? SERVICE_TEMPLATE_CATEGORIES.other;
}
