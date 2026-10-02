"use client";

import Link from "next/link";

const SECCIONES = [
  { clave: "historial", href: "/llamadas", texto: "Historial" },
  { clave: "analitica", href: "/llamadas/analitica", texto: "Analítica avanzada" },
] as const;

/** «Historial · Analítica avanzada»: las dos caras de Llamadas en escritorio. */
export function SeccionesDeLlamadas({ actual }: { actual: (typeof SECCIONES)[number]["clave"] }) {
  return (
    <nav aria-label="Secciones de llamadas" className="inline-flex shrink-0 gap-0.5 rounded-full border border-linea bg-relleno p-[3px]">
      {SECCIONES.map((seccion) =>
        seccion.clave === actual ? (
          <span
            key={seccion.clave}
            aria-current="page"
            className="flex min-h-9 items-center rounded-full bg-lavado px-3.5 text-sm font-semibold text-morado-tinta ring-1 ring-inset ring-lavado-borde"
          >
            {seccion.texto}
          </span>
        ) : (
          <Link
            key={seccion.clave}
            href={seccion.href}
            className="flex min-h-9 items-center rounded-full px-3.5 text-sm font-semibold text-apagado transition hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
          >
            {seccion.texto}
          </Link>
        )
      )}
    </nav>
  );
}
