import "./_sin-movimiento";
import * as React from "react";
import { ParticleField } from "alhabla-ui";

/**
 * `campo-particulas` se posiciona a pantalla completa, no dentro del flujo:
 * no se puede meter en una caja. Por eso la tarjeta se compone como una
 * página — fondo oscuro a sangre, las partículas encima y el contenido sobre
 * ellas — que es exactamente cómo se usa en la landing.
 */
export function SobreFondoOscuro() {
  return (
    <>
      <div className="fixed inset-0 -z-20 bg-[#0a0a0a]" />
      <ParticleField />
      <div className="relative z-10 px-10 py-16">
        <p className="max-w-xl text-3xl font-black leading-tight tracking-tight text-white">
          Cada llamada sin contestar es un cliente que ya reservó en otro sitio.
        </p>
        <p className="mt-3 max-w-lg text-sm leading-6 text-white/60">
          El campo de partículas es decorativo: va por detrás de todo y nunca
          debe competir con el texto.
        </p>
      </div>
    </>
  );
}
