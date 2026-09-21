import { imagenOg, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og/plantilla";

export const runtime = "nodejs";
export const alt = "Aviso legal | Alhabla";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return imagenOg({
    etiqueta: "Legal",
    titulo: "Aviso legal",
    subtitulo:
      "Titularidad, condiciones de uso y contratación de la suscripción.",
    pastilla: null,
    pie: "alhabla.ai",
    derecha: {
      tipo: "panel",
      grande: "Legal",
      pequeno: "Claro y sin cláusulas copiadas",
    },
  });
}
