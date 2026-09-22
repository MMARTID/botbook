import Image from "next/image";
import Link from "next/link";
import { Clock3 } from "lucide-react";
import { fechaLarga, type ArticuloMeta } from "@/lib/blog";
import { NICHE_ACCENTS } from "@/lib/niche-accents";
import { nicheLandings, type NicheSlug } from "@/lib/niche-landings";

export function esSector(valor: string | undefined): valor is NicheSlug {
  return valor !== undefined && valor in nicheLandings;
}

/** Pastilla del sector con su color de acento (la misma que en las landings). */
export function PastillaDeSector({ sector }: { sector: NicheSlug }) {
  const acento = NICHE_ACCENTS[sector];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: acento.soft, color: acento.deep }}
    >
      {nicheLandings[sector].name}
    </span>
  );
}

/**
 * Tarjeta del listado y de «Sigue leyendo». Con imagen de cabecera la
 * enseña; sin ella, la foto del sector (las mismas de las landings) para que
 * la rejilla nunca quede con huecos vacíos. La destacada (el artículo más
 * reciente) va a dos columnas en escritorio: foto a la izquierda, texto a la
 * derecha.
 */
export function TarjetaDeArticulo({
  articulo,
  destacado = false,
}: {
  articulo: ArticuloMeta;
  destacado?: boolean;
}) {
  const sector = esSector(articulo.sector) ? articulo.sector : null;
  const src = articulo.imagen ?? `/heroes/${sector ?? "general"}.jpg`;
  const alt = articulo.imagen ? (articulo.imagenAlt ?? "") : "";
  return (
    <article className="group h-full overflow-hidden rounded-3xl border border-[#e5e5e5] bg-white transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(0,0,0,0.07)]">
      <Link
        href={`/blog/${articulo.slug}`}
        className={`flex h-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${
          destacado ? "lg:grid lg:grid-cols-2" : ""
        }`}
      >
        <div
          className={`relative w-full overflow-hidden ${destacado ? "aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-[22rem]" : "aspect-[3/2]"}`}
        >
          <Image
            src={src}
            alt={alt}
            fill
            sizes={
              destacado
                ? "(min-width: 1024px) 640px, 100vw"
                : "(min-width: 1024px) 400px, 100vw"
            }
            className="object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        </div>
        <div
          className={`flex flex-1 flex-col p-5 sm:p-6 ${destacado ? "lg:justify-center lg:p-10" : ""}`}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {sector ? <PastillaDeSector sector={sector} /> : null}
            <span>{fechaLarga(articulo.fecha)}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {articulo.minutosDeLectura} min
            </span>
          </div>
          <h2
            className={`mt-3 font-bold tracking-tight text-[#0a0a0a] group-hover:text-[#6d28d9] ${
              destacado ? "text-2xl sm:text-3xl" : "text-xl"
            }`}
          >
            {articulo.titulo}
          </h2>
          {articulo.resumen ? (
            <p
              className={`mt-3 text-sm leading-6 text-muted ${destacado ? "sm:text-base sm:leading-7" : "line-clamp-3"}`}
            >
              {articulo.resumen}
            </p>
          ) : null}
          <span
            className={`pt-4 text-sm font-semibold text-[#6d28d9] ${destacado ? "" : "mt-auto"}`}
          >
            Leer el artículo →
          </span>
        </div>
      </Link>
    </article>
  );
}
