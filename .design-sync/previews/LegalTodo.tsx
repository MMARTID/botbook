import "./_sin-movimiento";
import * as React from "react";
import { LegalTodo } from "alhabla-ui";

/**
 * El componente ya pone el rótulo «Pendiente de completar antes de publicar:»,
 * así que los `children` son sólo lo que falta — no repitas la etiqueta.
 */
export function Pendiente() {
  return (
    <div className="w-full max-w-2xl">
      <LegalTodo>
        Falta el nombre fiscal, el NIF y el domicilio social del titular.
      </LegalTodo>
    </div>
  );
}

/** Dentro de la prosa legal, que es donde aparece de verdad. */
export function EntreParrafos() {
  return (
    <div className="w-full max-w-2xl">
      <p className="text-sm leading-6 text-muted">
        Los datos identificativos del responsable del sitio se recogen en este
        apartado conforme a la LSSI-CE.
      </p>
      <div className="mt-3">
        <LegalTodo>Datos fiscales del titular.</LegalTodo>
      </div>
    </div>
  );
}
