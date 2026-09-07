import "./_sin-movimiento";
import * as React from "react";
import { MobileNav } from "alhabla-ui";

/**
 * Sólo existe por debajo de `md` (el contenedor lleva `md:hidden`), por eso la
 * tarjeta se fuerza a un viewport de móvil en cfg.overrides.
 */
export function Cerrado() {
  return (
    <header className="flex w-full items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
      <span className="text-lg font-black tracking-tight text-[#0a0a0a]">
        Alhabla
      </span>
      <MobileNav />
    </header>
  );
}
