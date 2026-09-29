import "./_sin-movimiento";
import * as React from "react";
import { GoogleAuthButton } from "alhabla-web-ui";

/**
 * Estado normal. Al pulsarlo redirige al OAuth de Google de verdad (con la
 * pastilla Beta encima mientras la app de Google sigue en revisión).
 */
export function Predeterminado() {
  return (
    <div className="w-full max-w-sm pt-3">
      <GoogleAuthButton onError={() => {}} />
    </div>
  );
}

/** `disabled`: p. ej. en el registro, hasta aceptar los términos. */
export function Deshabilitado() {
  return (
    <div className="w-full max-w-sm pt-3">
      <GoogleAuthButton onError={() => {}} disabled />
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
