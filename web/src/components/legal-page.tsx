import { Children, isValidElement } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

type LegalPageProps = {
  title: string;
  description: string;
  /** Fecha ISO (`2026-10-04`); se muestra como «4 de octubre de 2026». */
  updatedAt: string;
  /** Muestra bajo la cabecera un índice con los `LegalSection` que tengan `id`. */
  indice?: boolean;
  children: React.ReactNode;
};

type LegalSectionProps = {
  title: string;
  /** Ancla del apartado: lo enlaza el índice y permite citarlo desde fuera. */
  id?: string;
  children: React.ReactNode;
};

/** «2026-10-04» → «4 de octubre de 2026» (UTC, para que no dependa del servidor). */
function fechaLarga(iso: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

/**
 * Contenedor de documentos legales con la misma jerarquía visual del producto.
 * Con `indice`, el listado de apartados sale de los propios `LegalSection`
 * hijos (los que llevan `id`), así que no puede quedarse desfasado del texto.
 */
export function LegalPage({ title, description, updatedAt, indice = false, children }: LegalPageProps) {
  const apartados = indice
    ? Children.toArray(children).flatMap((hijo) =>
        isValidElement<LegalSectionProps>(hijo) && hijo.type === LegalSection && hijo.props.id
          ? [{ id: hijo.props.id, title: hijo.props.title }]
          : []
      )
    : [];

  return (
    <main className="min-h-screen bg-white text-[#0a0a0a]">
      <a href="#contenido-legal" className="sr-only z-[80] rounded-[10px] bg-[#0a0a0a] px-4 py-3 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Saltar al contenido legal</a>
      <header className="sticky top-0 z-50 border-b border-[#e5e5e5] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-[4.5rem] sm:px-6 lg:px-8">
          <Link href="/" aria-label="Ir al inicio de Alhabla" className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">
            <BrandMark className="h-10 w-10 shrink-0" />
            <p className="text-base font-bold tracking-[-0.02em] text-[#0a0a0a]">Alhabla</p>
          </Link>
          <Link href="/" className="btn-secondary h-11 px-4">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver al inicio
          </Link>
        </div>
      </header>

      <article id="contenido-legal" className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <header className="max-w-3xl border-b border-[#e5e5e5] pb-8 sm:pb-10">
          <h1 className="text-balance text-4xl font-extrabold tracking-[-0.035em] text-[#0a0a0a] sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-[64ch] text-base leading-8 text-muted sm:text-lg">{description}</p>
          <p className="mt-5 text-sm text-muted">
            Última actualización: <time dateTime={updatedAt} className="font-medium text-tinta-2">{fechaLarga(updatedAt)}</time>
          </p>
        </header>
        {apartados.length > 0 ? (
          <nav aria-label="Contenido de esta página" className="mt-8 max-w-3xl rounded-3xl border border-linea bg-relleno p-5 sm:p-6">
            <p className="text-sm font-semibold text-tinta">En esta página</p>
            <ul className="mt-3 text-sm sm:columns-2 sm:gap-x-8">
              {apartados.map(({ id, title: apartado }) => (
                <li key={id} className="break-inside-avoid py-1">
                  <a href={`#${id}`} className="rounded font-medium text-morado-tinta underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado">
                    {apartado}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <div className="mt-10 max-w-3xl space-y-10 sm:space-y-12">{children}</div>
      </article>

      <footer className="border-t border-[#262626] bg-[#0a0a0a] text-white/70">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p className="text-sm">
            <span className="font-semibold text-white">Alhabla</span> — Recepción telefónica para negocios con cita previa.
          </p>
          <nav aria-label="Enlaces legales" className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
            <Link href="/legal/privacidad" className="transition hover:text-white">
              Privacidad
            </Link>
            <Link href="/legal/aviso-legal" className="transition hover:text-white">
              Aviso legal
            </Link>
            <a href="mailto:hola@alhabla.ai" className="transition hover:text-white">
              Contacto
            </a>
          </nav>
        </div>
      </footer>
    </main>
  );
}

/**
 * Sección de una página legal: un h2 y su cuerpo, con la medida de lectura
 * acotada. `scroll-mt-24` deja el título por debajo de la cabecera fija al
 * llegar por un ancla.
 */
export function LegalSection({ title, id, children }: LegalSectionProps) {
  return (
    <section id={id} className="max-w-[68ch] scroll-mt-24">
      <h2 className="text-balance text-xl font-bold tracking-[-0.02em] text-[#0a0a0a] sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-muted sm:text-base sm:leading-8">{children}</div>
    </section>
  );
}

/**
 * Ficha de datos de una página legal (quién es el titular, qué NIF…): pares
 * término/valor en una lista de definición, más fácil de escanear que un
 * párrafo.
 */
export function LegalFicha({ datos }: { datos: readonly { termino: string; valor: React.ReactNode }[] }) {
  return (
    <dl className="divide-y divide-linea-suave rounded-3xl border border-linea bg-relleno px-5 py-1 sm:px-6">
      {datos.map(({ termino, valor }) => (
        <div key={termino} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
          <dt className="text-sm font-medium text-tinta">{termino}</dt>
          <dd className="text-[15px] leading-7 text-apagado sm:text-base">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Aviso para el equipo: marca los datos que tiene que aportar una persona
 * antes de publicar. Visible a propósito — un dato legal inventado es peor
 * que un hueco señalado.
 */
export function LegalTodo({ children }: { children: React.ReactNode }) {
  return (
    <aside role="note" className="flex gap-3 rounded-2xl border border-[#f0dfa8] bg-[#fef8e7] p-4 text-sm leading-6 text-[#6b5310] sm:p-5">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#9f7a15]" aria-hidden="true" />
      <p><strong className="font-semibold">Pendiente antes de publicar:</strong> {children}</p>
    </aside>
  );
}
