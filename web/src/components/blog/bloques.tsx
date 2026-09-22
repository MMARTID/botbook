import Link from "next/link";
import {
  ArrowRight,
  Lightbulb,
  AlertTriangle,
  MessageSquareQuote,
} from "lucide-react";
import { nicheLandings, type NicheSlug } from "@/lib/niche-landings";

/**
 * Bloques de marca que se insertan desde el editor del blog (keystatic.config
 * › `bloquesDelEditor`) y que MDX renderiza aquí con los componentes reales
 * de la web. Mismo lenguaje visual que las landings: paneles redondeados,
 * lavado morado, iconos Lucide en contenedor rounded-xl. En el .mdx quedan
 * como etiquetas JSX (`<Cta … />`), así que también se pueden escribir a mano.
 */

const DESTINOS: Record<string, { href: string; texto: string }> = {
  planes: { href: "/planes", texto: "Ver planes" },
  demo: { href: "/#demo", texto: "Escuchar la demo" },
  como_funciona: { href: "/#como-funciona", texto: "Ver cómo funciona" },
  peluqueria: { href: "/peluqueria", texto: "Alhabla para peluquerías" },
  barberia: { href: "/barberia", texto: "Alhabla para barberías" },
  "centro-de-estetica": {
    href: "/centro-de-estetica",
    texto: "Alhabla para centros de estética",
  },
  "salon-de-unas": {
    href: "/salon-de-unas",
    texto: "Alhabla para salones de uñas",
  },
  fisioterapia: { href: "/fisioterapia", texto: "Alhabla para fisioterapia" },
};

export function Cta({
  titulo,
  texto,
  destino = "planes",
  boton,
}: {
  titulo: string;
  texto?: string;
  destino?: string;
  boton?: string;
}) {
  const d = DESTINOS[destino] ?? DESTINOS.planes;
  return (
    <aside className="not-prose my-10 rounded-3xl border border-[#ddd6fe] bg-[#f3eeff] p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6d28d9]">
        Alhabla
      </p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-[#0a0a0a]">
        {titulo}
      </p>
      {texto ? (
        <p className="mt-2 text-base leading-7 text-muted">{texto}</p>
      ) : null}
      <Link href={d.href} className="btn-primary mt-5 inline-flex px-6">
        {boton || d.texto}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </aside>
  );
}

export function Dato({
  cifra,
  texto,
  fuente,
  fuenteUrl,
}: {
  cifra: string;
  texto: string;
  fuente?: string;
  fuenteUrl?: string;
}) {
  return (
    <figure className="not-prose my-8 rounded-3xl border border-[#e5e5e5] bg-white p-6 sm:p-8">
      <p className="text-5xl font-extrabold tracking-[-0.03em] text-[#0a0a0a] sm:text-6xl">
        {cifra}
      </p>
      <p className="mt-3 text-base leading-7 text-[#27272a]">{texto}</p>
      {fuente ? (
        <figcaption className="mt-3 text-xs text-muted">
          Fuente:{" "}
          {fuenteUrl ? (
            <a
              href={fuenteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {fuente}
            </a>
          ) : (
            fuente
          )}
        </figcaption>
      ) : null}
    </figure>
  );
}

const AVISOS = {
  consejo: {
    Icon: Lightbulb,
    etiqueta: "Consejo",
    borde: "border-[#ddd6fe]",
    fondo: "bg-[#f3eeff]",
    color: "text-[#6d28d9]",
  },
  importante: {
    Icon: AlertTriangle,
    etiqueta: "Importante",
    borde: "border-[#f0dfa8]",
    fondo: "bg-[#fef8e7]",
    color: "text-[#9f7a15]",
  },
  ejemplo: {
    Icon: MessageSquareQuote,
    etiqueta: "Ejemplo real",
    borde: "border-[#e5e5e5]",
    fondo: "bg-[#fafafa]",
    color: "text-[#52525b]",
  },
} as const;

export function Aviso({
  tipo = "consejo",
  titulo,
  children,
}: {
  tipo?: keyof typeof AVISOS;
  titulo?: string;
  children?: React.ReactNode;
}) {
  const a = AVISOS[tipo] ?? AVISOS.consejo;
  return (
    <aside
      className={`not-prose my-8 flex gap-4 rounded-2xl border ${a.borde} ${a.fondo} p-5`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white ${a.color}`}
      >
        <a.Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 text-sm leading-6 text-[#27272a]">
        <p
          className={`text-xs font-semibold uppercase tracking-[0.12em] ${a.color}`}
        >
          {titulo || a.etiqueta}
        </p>
        <div className="mt-1 space-y-2 [&_p]:m-0">{children}</div>
      </div>
    </aside>
  );
}

export function Pasos({
  pasos = [],
}: {
  pasos?: { titulo: string; texto?: string }[];
}) {
  return (
    <ol className="not-prose my-8 space-y-3">
      {pasos.map((p, i) => (
        <li
          key={i}
          className="flex gap-4 rounded-2xl border border-[#e5e5e5] bg-white p-5"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0a0a0a] text-sm font-bold text-white">
            {i + 1}
          </span>
          <div>
            <p className="font-semibold text-[#0a0a0a]">{p.titulo}</p>
            {p.texto ? (
              <p className="mt-1 text-sm leading-6 text-muted">{p.texto}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Faq({
  preguntas = [],
}: {
  preguntas?: { pregunta: string; respuesta: string }[];
}) {
  return (
    <div className="not-prose my-8 divide-y divide-[#e5e5e5] overflow-hidden rounded-3xl border border-[#e5e5e5]">
      {preguntas.map((p, i) => (
        <details key={i} className="group p-5 open:bg-[#fafafa]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-[#0a0a0a]">
            {p.pregunta}
            <span
              className="text-[#8b5cf6] transition group-open:rotate-45"
              aria-hidden="true"
            >
              +
            </span>
          </summary>
          <p className="mt-3 text-sm leading-6 text-muted">{p.respuesta}</p>
        </details>
      ))}
    </div>
  );
}

/** Para el bloque de sector del editor: nombre visible del sector. */
export function nombreDeSector(slug: string): string {
  return slug in nicheLandings ? nicheLandings[slug as NicheSlug].name : slug;
}
