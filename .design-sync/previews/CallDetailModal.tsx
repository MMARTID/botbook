import "./_sin-movimiento";
import * as React from "react";
import { CallDetailModal } from "alhabla-ui";

/**
 * El modal es un overlay `fixed inset-0`. La tarjeta envuelve la historia en
 * un div con `transform` (bloque contenedor de los `fixed`), pero ese div mide
 * 0 de alto porque el overlay está fuera del flujo: `inset-0` colapsaba y la
 * captura salía en blanco o sin cabecera. Esta caja propia, con alto explícito
 * igual al viewport de la tarjeta (cfg.overrides) y su propio `transform`, es
 * la que el overlay llena. Al usarlo en una app no hace falta: se monta tal
 * cual y cubre la ventana.
 */
function Ventana({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[800px] w-full overflow-hidden bg-[#fafafa] [transform:translateZ(0)]">
      {children}
    </div>
  );
}

/** Consulta de precio: transcripción corta, sin reserva. */
export function Consulta() {
  return (
    <Ventana>
      <CallDetailModal callId="call-demo-corta" onClose={() => {}} />
    </Ventana>
  );
}

/** Llamada con reserva creada: el cuerpo largo hace scroll dentro del modal. */
export function ConReserva() {
  return (
    <Ventana>
      <CallDetailModal callId="call-demo-1" onClose={() => {}} />
    </Ventana>
  );
}
