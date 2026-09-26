"use client";

import { MODOS_DE_PASAR_LLAMADAS } from "@/lib/pasar-llamadas";
import type { ModoDePasarLlamadas } from "@/lib/types";

type PasarLlamadasProps = {
  /** Nombre del grupo de radios: distinto por pantalla si conviven dos. */
  name: string;
  value: ModoDePasarLlamadas;
  onChange: (modo: ModoDePasarLlamadas) => void;
  disabled?: boolean;
  "aria-labelledby": string;
};

/**
 * El ajuste «Cuándo pasarme llamadas» (fase 4 del plan de telefonía) como
 * grupo de radios nativos: lo comparten la pantalla «Usar Alhabla como
 * número principal» y Ajustes › Teléfono › Tu recepcionista.
 */
export function PasarLlamadas({
  name,
  value,
  onChange,
  disabled = false,
  "aria-labelledby": labelledBy,
}: PasarLlamadasProps) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid gap-2">
      {MODOS_DE_PASAR_LLAMADAS.map(({ modo, titulo, descripcion }) => {
        const id = `${name}-${modo}`;
        return (
          <div key={modo} className="relative">
            <input
              id={id}
              type="radio"
              name={name}
              value={modo}
              checked={value === modo}
              onChange={() => onChange(modo)}
              disabled={disabled}
              className="peer sr-only"
            />
            <label
              htmlFor={id}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#e5e5e5] bg-white p-3.5 transition duration-200 hover:border-[#a78bfa] peer-checked:border-[#8b5cf6] peer-checked:bg-[#f3eeff] peer-focus-visible:ring-2 peer-focus-visible:ring-[#8b5cf6] peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  value === modo
                    ? "border-[#8b5cf6] bg-[#8b5cf6]"
                    : "border-[#a1a1aa] bg-white"
                }`}
              >
                {value === modo ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#0a0a0a]">
                  {titulo}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted">
                  {descripcion}
                </span>
              </span>
            </label>
          </div>
        );
      })}
    </div>
  );
}
