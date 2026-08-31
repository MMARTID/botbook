import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

type LegalPageProps = {
  title: string;
  description: string;
  updatedAt: string;
  children: React.ReactNode;
};

/**
 * Contenedor de las páginas legales. Modo lectura: una sola columna estrecha,
 * el papel del sistema de fondo y nada que compita con el texto.
 */
export function LegalPage({ title, description, updatedAt, children }: LegalPageProps) {
  return (
    <main className="relative isolate min-h-screen w-full overflow-hidden text-[#17211c]">
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[linear-gradient(180deg,#fbfcf8_0%,#f1f5ec_44%,#e9efe5_100%)]" />
      <div className="pointer-events-none absolute -left-40 top-12 -z-10 h-[30rem] w-[30rem] rounded-full bg-[#b8d96e]/20 blur-[110px]" />

      <header className="border-b border-white/60 bg-[#f8faf5]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-[4.5rem]">
          <Link href="/landing" aria-label="Ir al inicio de Alhabla" className="flex min-w-0 items-center gap-2.5">
            <BrandMark className="h-10 w-10 shrink-0" />
            <p className="text-base font-semibold leading-5 text-[#1e2b22]">Alhabla</p>
          </Link>
          <Link href="/landing" className="btn-secondary h-11 px-4">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-[#1e2b22] sm:text-4xl">{title}</h1>
        <p className="mt-4 max-w-[68ch] text-base leading-8 text-[#54634b]">{description}</p>
        <p className="mt-6 text-sm text-[#54634b]">
          Última actualización: <time dateTime={updatedAt}>{updatedAt}</time>
        </p>

        <div className="mt-10 space-y-10">{children}</div>
      </article>

      <footer className="border-t border-white/70 bg-[#1e2b22] text-white/70">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
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

/** Sección de una página legal: un h2 y su cuerpo, con la medida de lectura acotada. */
export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="max-w-[68ch]">
      <h2 className="text-xl font-semibold tracking-tight text-[#1e2b22]">{title}</h2>
      <div className="mt-4 space-y-4 text-base leading-8 text-[#54634b]">{children}</div>
    </section>
  );
}

/**
 * Aviso para el equipo: marca los datos que tiene que aportar una persona
 * antes de publicar. Visible a propósito — un dato legal inventado es peor
 * que un hueco señalado.
 */
export function LegalTodo({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-[#e6d9a8] bg-[#fdf8e7] px-4 py-3 text-sm leading-7 text-[#6b5310]">
      <strong className="font-semibold">Pendiente de completar antes de publicar:</strong> {children}
    </p>
  );
}
