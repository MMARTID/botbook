"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { elegirTema, usePreferenciaDeTema, type PreferenciaDeTema } from "@/lib/tema";

const OPCIONES: Array<{ valor: PreferenciaDeTema; texto: string; icono: LucideIcon }> = [
  { valor: "sistema", texto: "Sistema", icono: Monitor },
  { valor: "claro", texto: "Claro", icono: Sun },
  { valor: "oscuro", texto: "Oscuro", icono: Moon },
];

/**
 * «Sistema · Claro · Oscuro», en Cuenta (móvil) y en Ajustes › Cuenta
 * (escritorio). Por defecto, el del sistema; la elección se queda en este
 * dispositivo.
 */
export function SelectorDeTema({ className = "" }: { className?: string }) {
  const preferencia = usePreferenciaDeTema();
  return (
    <div role="radiogroup" aria-label="Apariencia" className={`flex gap-1 rounded-full border border-linea bg-relleno p-1 ${className}`}>
      {OPCIONES.map(({ valor, texto, icono: Icono }) => {
        const elegida = preferencia === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={elegida}
            onClick={() => elegirTema(valor)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${
              elegida ? "bg-lavado text-morado-tinta ring-1 ring-inset ring-lavado-borde" : "text-apagado hover:text-tinta"
            }`}
          >
            <Icono className="h-4 w-4" aria-hidden="true" />
            {texto}
          </button>
        );
      })}
    </div>
  );
}
