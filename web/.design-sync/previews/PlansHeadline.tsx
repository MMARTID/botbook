import "./_sin-movimiento";
import * as React from "react";
import { PlansHeadline } from "alhabla-web-ui";

/**
 * Titular de /planes sin estimación de la calculadora: el genérico. Con una
 * estimación guardada en la sesión se personaliza con sus cifras.
 */
export function Titular() {
  return (
    <div className="w-full max-w-3xl">
      <PlansHeadline />
    </div>
  );
}
