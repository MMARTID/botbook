import "./_sin-movimiento";
import * as React from "react";
import { UpcomingCalendarEvents } from "alhabla-ui";

/**
 * Los eventos vienen de `["calendar-events", businessId, 15]` en la caché de
 * React Query, así que el `businessId` debe ser exactamente "biz-demo": con
 * cualquier otro la tarjeta cae en el estado de error de la agenda.
 */
export function ProximosEventos() {
  return (
    <div className="w-full max-w-3xl">
      <UpcomingCalendarEvents
        businessId="biz-demo"
        timeZone="Europe/Madrid"
        onReconnectRequired={() => {}}
      />
    </div>
  );
}
