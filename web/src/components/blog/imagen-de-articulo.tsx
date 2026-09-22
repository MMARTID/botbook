import Image from "next/image";

/**
 * Imagen dentro de un artículo. En MDX se escribe `<Imagen src="…" alt="…"
 * pie="…" />` o con la sintaxis normal de Markdown `![alt](/blog/x/y.jpg)`
 * (el mapeo de `img` de abajo la convierte). Pasa por next/image: tamaños
 * responsive, formatos modernos y sin saltos de maquetación gracias a
 * `width`/`height` (una proporción aproximada basta; `height: auto` ajusta
 * a la real). Reglas de nombre, tamaño y `alt` en content/blog/README.md.
 */
export function ImagenDeArticulo({
  src,
  alt,
  pie,
  ancho = 1600,
  alto = 1000,
  prioridad = false,
}: {
  src: string;
  alt: string;
  pie?: string;
  ancho?: number;
  alto?: number;
  prioridad?: boolean;
}) {
  return (
    <figure className="my-8">
      <Image
        src={src}
        alt={alt}
        width={ancho}
        height={alto}
        priority={prioridad}
        sizes="(min-width: 1024px) 720px, 100vw"
        className="h-auto w-full rounded-2xl border border-[#e5e5e5]"
      />
      {pie ? (
        <figcaption className="mt-2 text-center text-sm text-muted">
          {pie}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Componentes que MDXRemote inyecta en cada artículo. */
export const componentesDeArticulo = {
  Imagen: ImagenDeArticulo,
  // `![alt](src)` de Markdown llega como <img>; sin `alt` no se pinta la
  // imagen (el README lo exige) para que ningún artículo salga sin texto
  // alternativo.
  img: (props: { src?: string; alt?: string; title?: string }) =>
    props.src && props.alt ? (
      <ImagenDeArticulo src={props.src} alt={props.alt} pie={props.title} />
    ) : null,
};
