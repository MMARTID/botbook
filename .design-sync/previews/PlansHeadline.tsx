import "./_sin-movimiento";
import * as React from "react";
import { PlansHeadline } from "alhabla-ui";

/** Titular de la sección de precios. No recibe props: el copy es fijo. */
export function Titular() {
  return (
    <div className="w-full max-w-3xl">
      <PlansHeadline />
    </div>
  );
}
