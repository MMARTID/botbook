import { imagenOg, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og/plantilla";
import { formatPlanPrice, plans } from "@/lib/plans";

export const runtime = "nodejs";
export const alt = "Planes y precios de Alhabla";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return imagenOg({
    etiqueta: "Planes y precios",
    titulo:
      "Una recepcionista que atiende 24/7 por menos de lo que cuesta una cita perdida",
    subtitulo:
      "Minutos incluidos en cada plan, sin permanencia y con 7 días de prueba.",
    pastilla: null,
    pie: "Cancela cuando quieras",
    derecha: {
      tipo: "precios",
      planes: plans.map((plan) => ({
        nombre: plan.name,
        precio: formatPlanPrice(plan.price),
        destacado: plan.id === "pro",
      })),
    },
  });
}
