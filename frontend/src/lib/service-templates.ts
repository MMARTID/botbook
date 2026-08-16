import type { BusinessType } from "./types";

export type ServiceTemplate = {
  name: string;
  durationMinutes: number;
};

export const SERVICE_TEMPLATES: Record<BusinessType, ServiceTemplate[]> = {
   peluqueria: [
    { name: "Corte", durationMinutes: 30 },
    { name: "Corte y barba", durationMinutes: 45 },
    { name: "Coloración", durationMinutes: 90 },
    { name: "Mechas", durationMinutes: 120 },
    { name: "Tratamiento capilar", durationMinutes: 45 },
    { name: "Peinado", durationMinutes: 30 },
    { name: "Lavar y peinar / Brushing", durationMinutes: 45 },
    { name: "Babylights / Balayage", durationMinutes: 150 },
    { name: "Matiz / Baño de color", durationMinutes: 30 },
    { name: "Alisado de keratina", durationMinutes: 180 },
    { name: "Retoque de raíces", durationMinutes: 60 },
    { name: "Recogido de fiesta / Novia", durationMinutes: 90 },
  ],
  barberia: [
    { name: "Corte", durationMinutes: 30 },
    { name: "Corte y barba", durationMinutes: 45 },
    { name: "Afeitado", durationMinutes: 30 },
    { name: "Arreglo de barba", durationMinutes: 20 },
    { name: "Degradado / Fade", durationMinutes: 35 },
    { name: "Afeitado tradicional a navaja con toalla caliente", durationMinutes: 40 },
    { name: "Diseño de barba y perfilado", durationMinutes: 25 },
    { name: "Corte jubilado / Niño", durationMinutes: 25 },
    { name: "Tinte o camuflaje de canas para barba", durationMinutes: 20 },
  ],
  "centro-de-estetica": [
    { name: "Limpieza facial", durationMinutes: 60 },
    { name: "Tratamiento facial", durationMinutes: 75 },
    { name: "Masaje relajante", durationMinutes: 60 },
    { name: "Depilación", durationMinutes: 30 },
    { name: "Manicura", durationMinutes: 45 },
    { name: "Higiene facial profunda con punta de diamante", durationMinutes: 60 },
    { name: "Depilación láser (zona pequeña)", durationMinutes: 15 },
    { name: "Depilación láser (cuerpo entero)", durationMinutes: 60 },
    { name: "Depilación a la cera (piernas enteras + ingles)", durationMinutes: 45 },
    { name: "Lifting y tinte de pestañas", durationMinutes: 60 },
    { name: "Diseño y depilación de cejas con hilo", durationMinutes: 20 },
    { name: "Tratamiento reductor / Maderoterapia", durationMinutes: 60 },
  ],
  "salon-de-unas": [
    { name: "Manicura", durationMinutes: 30 },
    { name: "Pedicura", durationMinutes: 45 },
    { name: "Esmaltado semipermanente", durationMinutes: 45 },
    { name: "Uñas acrílicas", durationMinutes: 60 },
    { name: "Manicura y pedicura", durationMinutes: 75 },
    { name: "Manicura rusa / Combinada", durationMinutes: 50 },
    { name: "Relleno de gel / Acrílico", durationMinutes: 60 },
    { name: "Retirada de semipermanente / Gel", durationMinutes: 20 },
    { name: "Pedicura completa con spa y durezas", durationMinutes: 60 },
    { name: "Nail art / Decoración (por unidad)", durationMinutes: 15 },
    { name: "Reconstrucción de uña rota", durationMinutes: 15 },
  ],
  fisioterapia: [
    { name: "Sesión de fisioterapia", durationMinutes: 45 },
    { name: "Masaje terapéutico", durationMinutes: 30 },
    { name: "Rehabilitación", durationMinutes: 60 },
    { name: "Valoración", durationMinutes: 30 },
    { name: "Tratamiento de punción seca", durationMinutes: 45 },
    { name: "Drenaje linfático manual", durationMinutes: 50 },
    { name: "Fisioterapia deportiva / Descarga muscular", durationMinutes: 50 },
    { name: "Fisioterapia del suelo pélvico", durationMinutes: 60 },
    { name: "Electrolisis percutánea (EPI)", durationMinutes: 45 },
    { name: "Sesión de Osteopatía", durationMinutes: 50 },
  ],
  other: [
    { name: "Consulta inicial", durationMinutes: 30 },
    { name: "Sesión estándar", durationMinutes: 60 },
    { name: "Seguimiento", durationMinutes: 30 },
    { name: "Bono / Sesión de revisión", durationMinutes: 45 },
    { name: "Urgencia", durationMinutes: 30 },
  ],
};


export function getServiceTemplate(businessType: BusinessType): ServiceTemplate[] {
  return SERVICE_TEMPLATES[businessType] ?? SERVICE_TEMPLATES.other;
}
