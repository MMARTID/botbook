import "./_sin-movimiento";
import * as React from "react";
import { SettingsSection } from "alhabla-ui";
import { CalendarClock, ScissorsLineDashed } from "lucide-react";

/** Abierta: el resumen desaparece y se muestra el contenido completo. */
export function Abierta() {
  return (
    <div className="w-full max-w-2xl">
      <SettingsSection
        id="capacity"
        icon={CalendarClock}
        title="Capacidad de reservas"
        summary="2 plazas simultáneas"
        open
        onToggle={() => {}}
      >
        <div className="p-4 sm:p-5">
          <p className="max-w-2xl text-sm leading-6 text-muted">
            Indica cuántas citas simultáneas puede atender el negocio dentro de
            su horario. Es independiente del número de profesionales.
          </p>
          <button type="button" className="btn-primary mt-4">
            Guardar capacidad
          </button>
        </div>
      </SettingsSection>
    </div>
  );
}

/** Cerrada: título más un resumen de estado de una línea. */
export function Cerrada() {
  return (
    <div className="w-full max-w-2xl">
      <SettingsSection
        id="services"
        icon={ScissorsLineDashed}
        title="Servicios"
        summary="6 servicios"
        open={false}
        onToggle={() => {}}
      >
        <div className="p-4 sm:p-5 text-sm text-muted">Contenido oculto.</div>
      </SettingsSection>
    </div>
  );
}

/** `pending` marca la sección como pendiente sin sacar al usuario del flujo. */
export function Pendiente() {
  return (
    <div className="w-full max-w-2xl">
      <SettingsSection
        id="professionals"
        icon={ScissorsLineDashed}
        title="Servicios"
        summary="Sin servicios configurados"
        pending
        open={false}
        onToggle={() => {}}
      >
        <div className="p-4 sm:p-5 text-sm text-muted">Contenido oculto.</div>
      </SettingsSection>
    </div>
  );
}
