import "./_sin-movimiento";
import * as React from "react";
import { BrandMark } from "alhabla-web-ui";

/** Junto al wordmark, como en la cabecera de la web y la barra de la app. */
export function EnCabecera() {
  return (
    <div className="flex items-center gap-3">
      <BrandMark className="h-10 w-10 shrink-0" />
      <span className="text-base font-bold text-[#0a0a0a]">Alhabla</span>
    </div>
  );
}

/** Escala: el mismo isotipo funciona de favicon a marca de agua. */
export function Escala() {
  return (
    <div className="flex items-end gap-5">
      <BrandMark className="h-6 w-6" />
      <BrandMark className="h-10 w-10" />
      <BrandMark className="h-16 w-16" />
    </div>
  );
}

/** Sobre fondo negro, que es como aparece en el pie de la web. */
export function SobreOscuro() {
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-[#0a0a0a] px-6 py-5">
      <BrandMark className="h-8 w-8 shrink-0" />
      <span className="text-sm text-white">© 2026 Alhabla</span>
    </div>
  );
}
