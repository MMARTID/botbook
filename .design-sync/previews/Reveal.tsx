import "./_sin-movimiento";
import * as React from "react";
import { Reveal } from "alhabla-ui";

/**
 * Envoltorio de aparición al entrar en pantalla. En la tarjeta el contenido
 * ya está en viewport, así que se captura su estado final — que es justo el
 * que hay que revisar: `Reveal` no debe alterar la maquetación.
 */
export function BloqueDeSeccion() {
  return (
    <Reveal className="w-full max-w-lg">
      <div className="panel p-6">
        <h3 className="text-xl font-black tracking-tight text-[#0a0a0a]">
          Atiende como en casa
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          El agente conoce tus servicios, tus profesionales y tus huecos reales,
          así que responde con la información del negocio y no con generalidades.
        </p>
      </div>
    </Reveal>
  );
}

/** Cascada: `delay` escalonado es como se usa en las rejillas de la landing. */
export function EnCascada() {
  return (
    <div className="grid w-full max-w-xl gap-3">
      {["Contesta siempre", "Reserva en tu agenda", "Sin cambiar de número"].map(
        (titulo, indice) => (
          <Reveal key={titulo} delay={indice * 0.08}>
            <div className="panel p-4 text-sm font-semibold text-[#0a0a0a]">
              {titulo}
            </div>
          </Reveal>
        ),
      )}
    </div>
  );
}
