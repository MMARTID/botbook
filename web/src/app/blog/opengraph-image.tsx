import { imagenOg, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og/plantilla";

export const runtime = "nodejs";
export const alt = "Blog de Alhabla";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return imagenOg({
    etiqueta: "Blog",
    titulo: "Ideas para no perder ni una llamada",
    subtitulo:
      "Lo que aprendemos atendiendo el teléfono de peluquerías, barberías, centros de estética, salones de uñas y fisios.",
    pastilla: null,
    pie: "Guías cortas, sin humo",
    derecha: {
      tipo: "panel",
      grande: "Blog",
      pequeno: "Llamadas, citas y atención al cliente",
    },
  });
}
