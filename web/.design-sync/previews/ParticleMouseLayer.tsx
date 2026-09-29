import * as React from "react";
import { ParticleMouseLayer } from "alhabla-web-ui";

/**
 * Sin `_sin-movimiento` a propósito: con `prefers-reduced-motion` (o sin
 * puntero fino) la capa no arranca y no pinta nada. Es un canvas
 * `fixed inset-0 -z-10` del tamaño de la ventana: la caja con alto explícito
 * y `transform` es el bloque contenedor que llena dentro de la tarjeta (en una
 * página se monta suelta, detrás de todo). El cursor se simula en el centro
 * para que se vea la repulsión; los puntos se siembran al azar.
 */
export function AlrededorDelCursor() {
  React.useEffect(() => {
    const temporizador = window.setTimeout(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", {
          clientX: window.innerWidth / 2,
          clientY: window.innerHeight / 2,
        })
      );
    }, 50);
    return () => window.clearTimeout(temporizador);
  }, []);

  return (
    <div className="relative isolate flex h-[480px] w-full items-center justify-center overflow-hidden bg-white [transform:translateZ(0)]">
      <ParticleMouseLayer />
      <div className="panel w-full max-w-sm p-6">
        <p className="text-2xl font-black tracking-tight text-[#0a0a0a]">
          Los puntos se apartan del cursor
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Solo en escritorio y sin movimiento reducido. Va detrás de todo, como
          adorno: nunca tapa ni compite con el contenido.
        </p>
      </div>
    </div>
  );
}
