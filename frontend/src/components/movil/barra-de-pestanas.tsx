"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bot, CalendarDays, CircleUserRound, House, Phone, type LucideIcon } from "lucide-react";
import { getCalls } from "@/lib/api";

type Pestaña = { href: string; etiqueta: string; icono: LucideIcon };

const PESTAÑAS: Pestaña[] = [
  { href: "/", etiqueta: "Inicio", icono: House },
  { href: "/agenda", etiqueta: "Agenda", icono: CalendarDays },
  { href: "/llamadas", etiqueta: "Llamadas", icono: Phone },
  { href: "/agente", etiqueta: "Agente", icono: Bot },
  { href: "/ajustes", etiqueta: "Cuenta", icono: CircleUserRound },
];

/** Las pantallas que llevan barra de pestañas; el resto son de detalle. */
export function esRutaDePestaña(pathname: string) {
  return PESTAÑAS.some((pestaña) => pestaña.href === pathname);
}

/**
 * Llamadas con un recado sin atender. Viene en los `conteos` de cualquier
 * página del historial; sin backend que los mande, no hay insignia.
 */
export function usePorDevolver(enabled: boolean) {
  const consulta = useQuery({
    queryKey: ["llamadas-conteos"],
    queryFn: () => getCalls(1, 0),
    enabled,
    refetchInterval: 5 * 60_000,
  });
  return consulta.data?.conteos?.porDevolver ?? 0;
}

/**
 * Barra inferior de la app móvil: las cinco pestañas, sin «Más». La cuenta,
 * la facturación y la ayuda viven en la pestaña Cuenta.
 */
export function BarraDePestañas({
  pathname,
  porDevolver,
  avisoDeMinutos,
}: {
  pathname: string;
  porDevolver: number;
  avisoDeMinutos: boolean;
}) {
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-linea bg-superficie/95 px-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-[14px] lg:hidden"
    >
      <div className="mx-auto grid max-w-xl grid-cols-5 gap-0.5">
        {PESTAÑAS.map((pestaña) => {
          const activa = pathname === pestaña.href;
          const Icono = pestaña.icono;
          const insignia = pestaña.href === "/llamadas" && porDevolver > 0 ? porDevolver : null;
          const punto = pestaña.href === "/ajustes" && avisoDeMinutos;
          return (
            <Link
              key={pestaña.href}
              href={pestaña.href}
              aria-current={activa ? "page" : undefined}
              className={`flex min-h-[49px] flex-col items-center gap-[3px] rounded-2xl pt-1 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${
                activa ? "text-morado-tinta" : "text-apagado"
              }`}
            >
              <span
                className={`relative flex h-[30px] w-14 items-center justify-center rounded-full transition-colors duration-200 ${
                  activa ? "bg-lavado ring-1 ring-inset ring-lavado-borde" : ""
                }`}
              >
                <Icono className="h-[22px] w-[22px]" aria-hidden="true" />
                {insignia ? (
                  <span className="absolute -top-[3px] right-1.5 h-[18px] min-w-[18px] rounded-full bg-tinta px-[5px] text-center text-[11px] font-bold leading-[18px] text-sobre-tinta shadow-[0_0_0_2px_rgb(var(--superficie))]">
                    {insignia > 99 ? "99+" : insignia}
                    <span className="sr-only"> por devolver</span>
                  </span>
                ) : null}
                {punto ? (
                  <span className="absolute right-[11px] top-px h-2.5 w-2.5 rounded-full bg-aviso-icono shadow-[0_0_0_2px_rgb(var(--superficie))]">
                    <span className="sr-only">Quedan pocos minutos del plan</span>
                  </span>
                ) : null}
              </span>
              <span>{pestaña.etiqueta}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
