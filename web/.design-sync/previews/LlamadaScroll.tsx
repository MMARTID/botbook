import * as React from "react";
import { LlamadaScroll } from "alhabla-web-ui";

/**
 * Sin `_sin-movimiento` a propósito: con movimiento reducido la sección se
 * cambia por su versión quieta (tres tarjetas de texto) y la tarjeta no
 * enseñaría la animación. Aquí sale el escenario tal y como se ve al llegar a
 * la sección, en el paso 1 («Contesta»); el resto lo mueve el scroll.
 *
 * La sección mide 340vh con el escenario pegado arriba (sticky). Esta caja,
 * con el alto del viewport de la tarjeta (cfg.overrides) y overflow oculto,
 * recorta el recorrido que sobra. En una página se monta tal cual.
 */
export function AlLlegar() {
  return (
    <div className="relative h-[800px] w-full overflow-hidden bg-white">
      <LlamadaScroll />
    </div>
  );
}
