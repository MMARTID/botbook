import { z } from "zod";

export const ResourceIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const CapacitySchema = z.object({
  bookingCapacity: z.coerce.number().int().min(1).max(50),
});

export const ServiceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  durationMinutes: z.coerce.number().int().min(5).max(480),
  // Opcional y anulable: `null` elimina una tarifa publicada sin borrar el
  // servicio. El máximo evita que un error de tecleo distorsione el panel.
  priceCents: z
    .coerce.number()
    .int()
    .min(0)
    .max(10_000_000)
    .nullable()
    .optional(),
  active: z.boolean().optional(),
});

export const UpdateServiceSchema = ServiceSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Debes indicar al menos un campo"
);

// Nivel de un profesional en un servicio, tal como lo maneja el panel.
// "normal" (lo hace) es el valor por defecto y no se guarda como fila.
export const PROFESSIONAL_SERVICE_LEVELS = ["especialista", "normal", "no_sugerir"] as const;
export type ProfessionalServiceLevelInput = (typeof PROFESSIONAL_SERVICE_LEVELS)[number];

const ServiceLevelsSchema = z.record(z.string().min(1), z.enum(PROFESSIONAL_SERVICE_LEVELS));

export const ProfessionalSchema = z.object({
  name: z.string().trim().min(1).max(80),
  active: z.boolean().optional(),
  // Mapa completo serviceId → nivel. Si viene, manda sobre serviceIds.
  serviceLevels: ServiceLevelsSchema.optional(),
  // Legado del panel anterior a los niveles: cada id se guarda como
  // especialista, que es lo que significaba la casilla.
  serviceIds: z.array(z.string().min(1)).default([]),
});

export const UpdateProfessionalSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    active: z.boolean().optional(),
    serviceLevels: ServiceLevelsSchema.optional(),
    serviceIds: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Debes indicar al menos un campo"
  );
