import "./_sin-movimiento";
import * as React from "react";
import { GoogleAuthButton } from "alhabla-ui";

/**
 * Único estado posible hoy. El registro público está desactivado a propósito:
 * el componente IGNORA todas sus props (`disabled`, `acceptedTerms`,
 * `onError`, `beforeStart`) y al pulsarlo abre la burbuja de «próximamente»,
 * no el flujo OAuth. Por eso no hay variante deshabilitada que enseñar.
 */
export function Predeterminado() {
  return (
    <div className="w-full max-w-sm">
      <GoogleAuthButton onError={() => {}} />
    </div>
  );
}

/** Composición real: separador y botón bajo el formulario de correo. */
export function BajoElFormulario() {
  return (
    <div className="panel w-full max-w-sm p-6">
      <button type="button" className="btn-primary w-full">
        Entrar
      </button>
      <div className="my-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-[#e5e5e5]" />
        <span className="text-xs text-muted">o</span>
        <span className="h-px flex-1 bg-[#e5e5e5]" />
      </div>
      <GoogleAuthButton onError={() => {}} />
    </div>
  );
}
