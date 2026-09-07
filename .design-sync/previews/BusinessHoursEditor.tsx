import "./_sin-movimiento";
import * as React from "react";
import { BusinessHoursEditor, DEFAULT_BUSINESS_SCHEDULE } from "alhabla-ui";

/** Abierto con el horario por defecto: L–V de 09:00 a 18:00, fin de semana cerrado. */
export function Abierto() {
  return (
    <div className="w-full max-w-3xl">
      <BusinessHoursEditor
        value={DEFAULT_BUSINESS_SCHEDULE}
        timeZone="Europe/Madrid"
        isSaving={false}
        onSave={() => {}}
        open
        onToggle={() => {}}
      />
    </div>
  );
}

/** Horario partido, el caso real de la mayoría de peluquerías españolas. */
export function HorarioPartido() {
  const horario = {
    version: 1,
    week: {
      monday: { enabled: false, intervals: [] },
      tuesday: {
        enabled: true,
        intervals: [
          { start: "10:00", end: "14:00" },
          { start: "16:30", end: "20:30" },
        ],
      },
      wednesday: {
        enabled: true,
        intervals: [
          { start: "10:00", end: "14:00" },
          { start: "16:30", end: "20:30" },
        ],
      },
      thursday: {
        enabled: true,
        intervals: [
          { start: "10:00", end: "14:00" },
          { start: "16:30", end: "20:30" },
        ],
      },
      friday: {
        enabled: true,
        intervals: [
          { start: "10:00", end: "14:00" },
          { start: "16:30", end: "21:00" },
        ],
      },
      saturday: { enabled: true, intervals: [{ start: "09:30", end: "14:00" }] },
      sunday: { enabled: false, intervals: [] },
    },
  };
  return (
    <div className="w-full max-w-3xl">
      <BusinessHoursEditor
        value={horario}
        timeZone="Europe/Madrid"
        isSaving={false}
        onSave={() => {}}
        open
        onToggle={() => {}}
      />
    </div>
  );
}

/** Cerrado: la cabecera resume el horario en una línea. */
export function Cerrado() {
  return (
    <div className="w-full max-w-3xl">
      <BusinessHoursEditor
        value={DEFAULT_BUSINESS_SCHEDULE}
        timeZone="Europe/Madrid"
        isSaving={false}
        onSave={() => {}}
        open={false}
        onToggle={() => {}}
      />
    </div>
  );
}
