import { imagenOg, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og/plantilla";
import { fechaLarga, leerArticulo, listarArticulos } from "@/lib/blog";
import { NICHE_ACCENTS } from "@/lib/niche-accents";
import { nicheLandings, type NicheSlug } from "@/lib/niche-landings";

export const runtime = "nodejs";
export const alt = "Artículo del blog de Alhabla";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return listarArticulos().map((a) => ({ slug: a.slug }));
}

/** El artículo lleva la foto y el color de su sector cuando lo declara;
 * si no, el panel morado del blog. */
export default function OpenGraphImage({
  params,
}: {
  params: { slug: string };
}) {
  const articulo = leerArticulo(params.slug);
  const sector =
    articulo?.sector && articulo.sector in nicheLandings
      ? (articulo.sector as NicheSlug)
      : null;
  return imagenOg({
    etiqueta: sector ? `Blog · ${nicheLandings[sector].name}` : "Blog",
    titulo: articulo?.titulo ?? "Blog de Alhabla",
    subtitulo: articulo?.resumen,
    pastilla: null,
    pie: articulo ? fechaLarga(articulo.fecha) : undefined,
    acento: sector ? NICHE_ACCENTS[sector] : undefined,
    derecha: sector
      ? {
          tipo: "foto",
          fichero: `${sector}.jpg`,
          acento: NICHE_ACCENTS[sector],
          tarjeta: {
            titulo: "Guía del blog de Alhabla",
            texto: `Para ${nicheLandings[sector].name.toLowerCase()}`,
          },
        }
      : {
          tipo: "panel",
          grande: "Blog",
          pequeno: "Llamadas, citas y atención al cliente",
        },
  });
}
