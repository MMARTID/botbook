"use client";

import type { ComponentType, SVGProps } from "react";
import { Check, Headset, Phone, Smartphone, UserRound } from "lucide-react";
import type { CustomerLineType } from "@/lib/types";

type Tarjeta = {
  tipo: CustomerLineType;
  titulo: string;
  descripcion: string;
  Icono: ComponentType<SVGProps<SVGSVGElement>>;
};

/**
 * Las cuatro respuestas a «¿A qué número te llaman tus clientes?»
 * (PLAN-TELEFONIA-UX.md § 3). El alta las enseña todas; la tarjeta de desvío
 * de un negocio antiguo solo las tres que tienen una línea que desviar.
 */
export const TARJETAS_DE_LINEA: readonly Tarjeta[] = [
  {
    tipo: "fijo",
    titulo: "El fijo del local",
    descripcion: "El teléfono de la tienda o la consulta.",
    Icono: Phone,
  },
  {
    tipo: "movil_trabajo",
    titulo: "Un móvil de trabajo",
    descripcion: "Un móvil solo para el negocio, distinto del tuyo.",
    Icono: Smartphone,
  },
  {
    tipo: "movil_personal",
    titulo: "Mi móvil personal",
    descripcion: "El mismo con el que hablas con todo el mundo.",
    Icono: UserRound,
  },
  {
    tipo: "alhabla",
    titulo: "Todavía no tengo: quiero usar el de Alhabla",
    descripcion: "Publicas el número de Alhabla como teléfono del negocio.",
    Icono: Headset,
  },
];

export const TIPOS_CON_LINEA_PROPIA: readonly CustomerLineType[] = [
  "fijo",
  "movil_trabajo",
  "movil_personal",
];

type TarjetasDeLineaProps = {
  /** Nombre del grupo de radios: distinto por pantalla si conviven dos. */
  name: string;
  value: CustomerLineType | null;
  onChange: (tipo: CustomerLineType) => void;
  /** Qué tarjetas enseñar; por defecto las cuatro. */
  tipos?: readonly CustomerLineType[];
  disabled?: boolean;
  "aria-labelledby": string;
};

/**
 * Grupo de radios nativos disfrazados de tarjetas: el teclado, el foco y el
 * lector de pantalla los tratan como lo que son, y el estilo se cuelga del
 * `peer-checked` de Tailwind.
 */
export function TarjetasDeLinea({
  name,
  value,
  onChange,
  tipos,
  disabled = false,
  "aria-labelledby": labelledBy,
}: TarjetasDeLineaProps) {
  const tarjetas = tipos
    ? TARJETAS_DE_LINEA.filter((tarjeta) => tipos.includes(tarjeta.tipo))
    : TARJETAS_DE_LINEA;

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="grid gap-2 sm:grid-cols-2"
    >
      {tarjetas.map(({ tipo, titulo, descripcion, Icono }) => {
        const id = `${name}-${tipo}`;
        return (
          <div key={tipo} className="relative">
            <input
              id={id}
              type="radio"
              name={name}
              value={tipo}
              checked={value === tipo}
              onChange={() => onChange(tipo)}
              disabled={disabled}
              className="peer sr-only"
            />
            <label
              htmlFor={id}
              className="flex h-full cursor-pointer items-start gap-3 rounded-2xl border border-[#e5e5e5] bg-white p-3.5 transition duration-200 hover:border-[#a78bfa] peer-checked:border-[#8b5cf6] peer-checked:bg-[#f3eeff] peer-focus-visible:ring-2 peer-focus-visible:ring-[#8b5cf6] peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-60"
            >
              {/* Elegida, la tarjeta ya es lavado morado: el azulejo pasa a
                  blanco para no desaparecer (La Regla del Azulejo No
                  Anidado). */}
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#8b5cf6] ${
                  value === tipo ? "bg-white" : "bg-[#f3eeff]"
                }`}
              >
                <Icono className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[#0a0a0a]">
                  {titulo}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted">
                  {descripcion}
                </span>
              </span>
              {/* La elección no puede ir solo por color. */}
              {value === tipo ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#6d28d9]" aria-hidden="true" />
              ) : null}
            </label>
          </div>
        );
      })}
    </div>
  );
}
