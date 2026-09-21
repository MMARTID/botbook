import { imagenOg, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og/plantilla";

export const runtime = "nodejs";
export const alt = "Política de privacidad | Alhabla";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return imagenOg({
    etiqueta: "Legal",
    titulo: "Política de privacidad",
    subtitulo: "Qué datos tratamos, para qué y cómo ejercer tus derechos.",
    pastilla: null,
    pie: "alhabla.ai",
    derecha: {
      tipo: "panel",
      grande: "Legal",
      pequeno: "Claro y sin cláusulas copiadas",
    },
  });
}
