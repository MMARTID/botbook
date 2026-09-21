import { imagenOg, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og/plantilla";
import { nicheLandings } from "@/lib/niche-landings";

const content = nicheLandings["peluqueria"];

export const runtime = "nodejs";
export const alt = `${content.title} | Alhabla`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return imagenOg({
    etiqueta: content.name,
    titulo: content.heroTitle,
    subtitulo: content.heroDescription,
    pie: "7 días de prueba · Sin permanencia",
    acento: content.accent,
    derecha: {
      tipo: "foto",
      fichero: "peluqueria.jpg",
      acento: content.accent,
    },
  });
}
