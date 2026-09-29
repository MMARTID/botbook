import "./_sin-movimiento";
import * as React from "react";
import { LegalTodo } from "alhabla-web-ui";

/**
 * El componente ya pone el rótulo «Pendiente antes de publicar:», así que los
 * `children` son sólo lo que falta — no repitas la etiqueta. Los textos son de
 * ejemplo: las páginas legales publicadas no tienen ningún hueco pendiente.
 */
export function Pendiente() {
  return (
    <div className="w-full max-w-2xl">
      <LegalTodo>Fecha de entrada en vigor de esta versión.</LegalTodo>
    </div>
  );
}

/** Dentro de la prosa legal, que es donde aparece de verdad. */
export function EntreParrafos() {
  return (
    <div className="w-full max-w-2xl">
      <p className="text-sm leading-6 text-muted">
        Estas condiciones se aplican desde la fecha indicada y sustituyen a
        cualquier versión anterior.
      </p>
      <div className="mt-3">
        <LegalTodo>Fecha de entrada en vigor de esta versión.</LegalTodo>
      </div>
    </div>
  );
}
