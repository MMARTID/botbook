"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useDesplazado, useEsMovil } from "@/hooks/use-es-movil";

export type DestinoDeVuelta = { href: string; etiqueta: string };

/**
 * Cabecera de las pantallas de la app móvil: una barra fija de 44 px y,
 * debajo, el título grande con su frase. Al desplazar, el título grande se
 * va por arriba y aparece el pequeño centrado en la barra, con su línea.
 *
 * - `volver`: pantalla de detalle (‹ Agente, ‹ Cuenta…). Sin él es una
 *   pestaña.
 * - `marca`: sustituye a la barra en Inicio (logotipo, negocio y estado).
 * - `accion`: botón redondo a la derecha de la barra.
 *
 * Vive dentro de `<main>`, que en móvil tiene 16 px de lado y 20 de arriba:
 * los márgenes negativos la llevan de borde a borde y hasta arriba.
 */
export function CabeceraMovil({
  titulo,
  subtitulo,
  volver,
  marca,
  accion,
  soloMovil = false,
  children,
}: {
  titulo: string;
  subtitulo?: React.ReactNode;
  volver?: DestinoDeVuelta;
  marca?: React.ReactNode;
  accion?: React.ReactNode;
  /** Se pinta junto a la cabecera de escritorio y se oculta desde `lg`. */
  soloMovil?: boolean;
  /** Acciones bajo el título (p. ej. «Analítica avanzada»). */
  children?: React.ReactNode;
}) {
  const desplazado = useDesplazado(volver ? 40 : 36);
  const esMovil = useEsMovil();
  const ocultar = soloMovil ? "lg:hidden" : "";

  // Junto a la de escritorio, solo mientras no se sepa que no hace falta:
  // así no hay dos títulos de página en el árbol de accesibilidad.
  if (soloMovil && esMovil === false) return null;

  // Los márgenes van con `!`: la cabecera suele caer dentro de un `space-y-*`
  // que, si no, le pondría su propio margen superior. Y son dos hermanos (no
  // un envoltorio) porque `sticky` solo se pega dentro de su padre.
  return (
    <>
      <div className={`sticky top-0 z-40 !-mx-4 !-mt-5 bg-white/95 px-4 pb-1.5 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-[14px] ${ocultar}`}>
        <div className="relative flex h-11 items-center gap-2.5">
          {marca ?? null}
          {volver ? <BotonVolver destino={volver} /> : null}
          {marca ? null : (
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute ${volver ? "inset-x-24" : "inset-x-16"} truncate text-center text-base font-bold text-[#0a0a0a] transition-opacity duration-150 ${desplazado ? "opacity-100" : "opacity-0"}`}
            >
              {titulo}
            </span>
          )}
          {marca ? null : <span className="flex-1" />}
          {accion ?? null}
        </div>
        <div
          aria-hidden="true"
          className={`absolute inset-x-0 bottom-0 h-px bg-[#e5e5e5] transition-opacity duration-150 ${desplazado ? "opacity-100" : "opacity-0"}`}
        />
      </div>
      <div className={`!mt-0 pb-3.5 pt-1.5 ${ocultar}`}>
        <h1
          className={`text-balance font-extrabold leading-[1.1] text-[#0a0a0a] ${volver ? "text-[30px] tracking-[-0.03em]" : "text-[32px] tracking-[-0.03em]"}`}
        >
          {titulo}
        </h1>
        {subtitulo ? <p className="mt-1.5 text-sm leading-[1.55] text-muted">{subtitulo}</p> : null}
        {children ? <div className="mt-3.5 flex flex-wrap gap-2">{children}</div> : null}
      </div>
    </>
  );
}

function BotonVolver({ destino }: { destino: DestinoDeVuelta }) {
  return (
    <Link
      href={destino.href}
      className="-ml-3 flex min-h-11 items-center gap-0.5 rounded-full pl-1 pr-3 text-base font-semibold text-[#0a0a0a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
    >
      <ChevronLeft className="h-6 w-6" aria-hidden="true" />
      {destino.etiqueta}
    </Link>
  );
}

/** Botón redondo de 44 px para la derecha de la barra. */
export const CLASES_BOTON_REDONDO =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#27272a] transition duration-200 hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] disabled:opacity-35";
