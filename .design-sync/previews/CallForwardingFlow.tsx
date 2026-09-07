import "./_sin-movimiento";
import * as React from "react";
import { CallForwardingFlow, nicheLandings } from "alhabla-ui";

/** Acento morado de marca: el diagrama tal cual aparece en la landing general. */
export function Predeterminado() {
  return (
    <div className="w-full max-w-4xl">
      <CallForwardingFlow />
    </div>
  );
}

/**
 * Con el acento real del nicho de peluquerías (rosa), que es el contraste que
 * demuestra que `accent` retinta iconos, chips y estados del diagrama.
 */
export function ConAcentoDeNicho() {
  return (
    <div className="w-full max-w-4xl">
      <CallForwardingFlow accent={nicheLandings.peluqueria.accent} />
    </div>
  );
}
