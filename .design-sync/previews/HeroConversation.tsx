import "./_sin-movimiento";
import * as React from "react";
import { HeroConversation } from "alhabla-ui";

/**
 * Pausada a propósito: el componente rota conversaciones y escribe mensaje a
 * mensaje, así que sin `paused` la tarjeta capturaría un fotograma cualquiera.
 */
export function Pausada() {
  return (
    <div className="w-full max-w-md">
      <HeroConversation paused />
    </div>
  );
}

/** Guion propio: `conversationsOverride` sustituye el reparto por defecto. */
export function GuionPropio() {
  return (
    <div className="w-full max-w-md">
      <HeroConversation
        paused
        conversationsOverride={[
          {
            caller: "Cliente nuevo · móvil",
            context: "Primera cita",
            messages: [
              { sender: "client", text: "¿Hacéis mechas balayage?", delay: 0.35 },
              {
                sender: "agent",
                text: "Sí. Son unas dos horas. ¿Te va bien el jueves a las 16:00?",
                delay: 2.15,
              },
              { sender: "client", text: "Perfecto, el jueves.", delay: 3.75 },
            ],
            result: "Cita confirmada",
            resultDetail: "agenda actualizada al colgar",
            duration: 6600,
          },
        ]}
      />
    </div>
  );
}
