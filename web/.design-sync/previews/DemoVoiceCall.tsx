import "./_sin-movimiento";
import * as React from "react";
import { DemoVoiceCall } from "alhabla-web-ui";

/**
 * La demo es un overlay `fixed inset-0`. La tarjeta envuelve la historia en un
 * div con `transform`, pero ese div mide 0 de alto porque el overlay está
 * fuera del flujo: `inset-0` colapsaba y la captura salía recortada. Esta caja,
 * con el alto del viewport de la tarjeta (cfg.overrides) y su propio
 * `transform`, es la que el overlay llena. En una página se monta tal cual.
 *
 * Se queda en el primer paso (buscar el negocio): no busca en Google Places
 * hasta que hay 3 letras ni pide micrófono hasta que se pulsa llamar, así que
 * la tarjeta no toca la red.
 */
export function BuscarNegocio() {
  return (
    <div className="relative h-[760px] w-full overflow-hidden bg-[#fafafa] [transform:translateZ(0)]">
      <DemoVoiceCall open onClose={() => {}} niche="peluqueria" />
    </div>
  );
}
