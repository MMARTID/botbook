import "./_sin-movimiento";
import * as React from "react";
import { ParticleField } from "alhabla-web-ui";

/**
 * `.campo-particulas` es una capa fija a pantalla completa en `-z-10`, no algo
 * que se meta en una caja: la tarjeta se compone como una página pública —
 * contenedor `relative isolate` sin fondo propio, las partículas detrás y el
 * contenido encima—, que es como la montan entrar, el alta y el registro.
 */
export function SobreBlanco() {
  return (
    <main className="relative isolate flex min-h-[420px] items-center justify-center px-6 py-16">
      <ParticleField />
      <div className="panel w-full max-w-sm p-6">
        <p className="text-2xl font-black tracking-tight text-[#0a0a0a]">
          Entra en tu panel
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">
          El campo de partículas es decorativo: va por detrás de todo y nunca
          debe competir con el contenido.
        </p>
      </div>
    </main>
  );
}
