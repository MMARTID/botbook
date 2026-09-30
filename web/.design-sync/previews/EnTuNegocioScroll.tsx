import * as React from "react";
import { EnTuNegocioScroll } from "alhabla-web-ui";

/**
 * Sin `_sin-movimiento` a propósito, como «En tu bolsillo»: con movimiento
 * reducido la sección se cambia por su versión quieta. Aquí sale el escenario
 * al llegar a la sección, en el paso 1 («Tu panel»). El modelo 3D va embebido
 * en el bundle (recursosPublicos en prepare.mjs): sin él, la sección caería a
 * su versión quieta.
 *
 * La sección mide 360vh con el escenario pegado arriba (sticky). Esta caja,
 * con el alto del viewport de la tarjeta (cfg.overrides) y overflow oculto,
 * recorta el recorrido que sobra. En una página se monta tal cual.
 */
export function AlLlegar() {
  return (
    <div className="relative h-[800px] w-full overflow-hidden bg-white">
      <EnTuNegocioScroll />
    </div>
  );
}
