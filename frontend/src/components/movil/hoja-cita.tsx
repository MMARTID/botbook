"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink, Phone } from "lucide-react";
import { formatPhoneLocal, formatPrice } from "@/lib/format";
import { claveDeDia, diaLargo, horaDelNegocio } from "@/lib/fechas-negocio";
import { enlaceTel } from "@/lib/llamadas";
import type { CalendarState } from "@/lib/calendar-state";
import type { AgendaBooking } from "@/lib/types";
import { CuerpoDeHoja, HojaInferior } from "@/components/movil/hoja-inferior";
import { copiarAlPortapapeles } from "@/components/movil/hoja-llamada";

/** Solo hay importe si todos los servicios de la cita tienen precio. */
export function importeDeCita(cita: Pick<AgendaBooking, "services">) {
  return cita.services.length > 0 && cita.services.every((servicio) => servicio.priceCents != null)
    ? cita.services.reduce((suma, servicio) => suma + (servicio.priceCents ?? 0), 0)
    : null;
}

export function finDeCita(cita: Pick<AgendaBooking, "programedAt" | "durationMinutes">) {
  return new Date(new Date(cita.programedAt).getTime() + cita.durationMinutes * 60_000);
}

export function nombreDeCita(cita: Pick<AgendaBooking, "services">) {
  return cita.services.map((servicio) => servicio.name).join(" + ") || "Cita reservada";
}

/** Detalle de una cita: todos sus datos y llamar o copiar el teléfono sin
 * salir de la agenda. */
export function HojaCita({
  cita,
  timeZone,
  calendario,
  onCerrar,
  avisar,
}: {
  cita: AgendaBooking | null;
  timeZone: string;
  calendario: CalendarState;
  onCerrar: () => void;
  avisar: (mensaje: string, tipo?: "success" | "error") => void;
}) {
  const [ultima, setUltima] = useState(cita);
  useEffect(() => {
    if (cita) setUltima(cita);
  }, [cita]);
  const visible = cita ?? ultima;
  if (!visible) return null;

  const telefono = visible.clientPhone;
  const importe = importeDeCita(visible);
  const filas: Array<[string, string, boolean?]> = [
    ["Día", diaLargo(claveDeDia(visible.programedAt, timeZone))],
    [
      "Hora",
      `${horaDelNegocio(visible.programedAt, timeZone)} – ${horaDelNegocio(finDeCita(visible), timeZone)} · ${visible.durationMinutes} min`,
      true,
    ],
    ["Profesional", visible.professional?.name ?? "Cualquiera disponible"],
    ["Teléfono", formatPhoneLocal(telefono) ?? "No disponible", true],
  ];
  if (visible.numberPeople > 1) filas.push(["Personas", `${visible.numberPeople} personas`]);
  if (importe != null) filas.push(["Precio", formatPrice(importe) ?? "", true]);

  return (
    <HojaInferior abierta={Boolean(cita)} onCerrar={onCerrar} antetitulo="Cita reservada" titulo={nombreDeCita(visible)}>
      <CuerpoDeHoja>
        <dl className="text-[15px]">
          {filas.map(([termino, valor, numerico], indice) => (
            <div
              key={termino}
              className={`flex justify-between gap-3 border-t border-[#e5e5e5] py-3 ${indice === filas.length - 1 ? "border-b" : ""}`}
            >
              <dt className="text-muted">{termino}</dt>
              <dd className={`text-right font-semibold text-[#0a0a0a] ${numerico ? "tabular-nums" : ""}`}>{valor}</dd>
            </div>
          ))}
        </dl>
        {telefono ? (
          <div className="mt-4 flex gap-2">
            <a href={enlaceTel(telefono)} className="btn-primary flex-1 px-4">
              <Phone className="h-[18px] w-[18px]" aria-hidden="true" />
              Llamar
            </a>
            <button
              type="button"
              onClick={() => copiarAlPortapapeles(formatPhoneLocal(telefono) ?? telefono, avisar)}
              className="btn-secondary flex-none px-5"
            >
              <Copy className="h-[18px] w-[18px]" aria-hidden="true" />
              Copiar
            </button>
          </div>
        ) : null}
        {calendario.connected ? (
          <a
            href={calendario.webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 flex min-h-12 w-full items-center justify-center gap-1.5 text-sm font-bold text-[#6d28d9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
          >
            Abrir {calendario.label}
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : null}
      </CuerpoDeHoja>
    </HojaInferior>
  );
}
