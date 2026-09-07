import "./_sin-movimiento";
import * as React from "react";
import { BrandMark } from "alhabla-ui";

/** Tamaño de cabecera junto al wordmark: el uso real en la barra superior. */
export function EnCabecera() {
  return (
    <div className="flex items-center gap-2">
      <BrandMark className="h-8 w-8" />
      <span className="text-lg font-black tracking-tight text-[#0a0a0a]">
        Alhabla
      </span>
    </div>
  );
}

/** Escala: el mismo trazo funciona de favicon a marca de agua. */
export function Escala() {
  return (
    <div className="flex items-end gap-5">
      <BrandMark className="h-6 w-6" />
      <BrandMark className="h-10 w-10" />
      <BrandMark className="h-16 w-16" />
    </div>
  );
}

/** Sobre fondo negro, que es como aparece en el pie y en las tarjetas oscuras. */
export function SobreOscuro() {
  return (
    <div className="flex items-center gap-2 rounded-3xl bg-[#0a0a0a] px-6 py-5">
      <BrandMark className="h-8 w-8" />
      <span className="text-lg font-black tracking-tight text-white">
        Alhabla
      </span>
    </div>
  );
}
