import "./_sin-movimiento";
import * as React from "react";
import { RecentCalls } from "alhabla-ui";

/**
 * No recibe props: lee `["recent-calls"]` de React Query. Las seis
 * conversaciones sembradas cubren reserva creada y modificada, un chat de
 * WhatsApp, un escalado con su motivo, los desenlaces más comunes y los tres
 * sentimientos, que es lo que hace legible el listado.
 */
export function ConLlamadas() {
  return (
    <div className="w-full max-w-2xl">
      <RecentCalls />
    </div>
  );
}
