"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, Copy, ExternalLink, Phone, X } from "lucide-react";
import { getBookingSettings } from "@/lib/api";
import { formatPhoneLocal, formatPrice } from "@/lib/format";
import { claveDeDia, diaLargo, horaDelNegocio } from "@/lib/fechas-negocio";
import { horarioDelNegocio } from "@/lib/agenda-escritorio";
import { getCalendarState } from "@/lib/calendar-state";
import { enlaceTel } from "@/lib/llamadas";
import type { AgendaBooking, Business } from "@/lib/types";
import { useAhora } from "@/hooks/use-es-movil";
import { CuerpoDeHoja, HojaInferior } from "@/components/movil/hoja-inferior";
import { copiarAlPortapapeles } from "@/components/movil/hoja-llamada";
import { FormularioDeMover, origenDeLaCita } from "@/components/escritorio/agenda/detalle-de-cita";
import { useAccionesDeCita } from "@/components/escritorio/agenda/acciones-de-cita";

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

/**
 * Detalle de una cita en el móvil, como el panel lateral del escritorio:
 * sus datos, llamar o copiar, la conversación en la que se reservó, y
 * moverla (con el hueco comprobado) o cancelarla sin salir de la hoja.
 * Después, si se le puede escribir, pregunta «¿Avisamos por WhatsApp?».
 * Sirve igual desde Inicio y desde la Agenda.
 */
export function HojaCita({
  cita,
  business,
  onCerrar,
  avisar,
  onMovida,
}: {
  cita: AgendaBooking | null;
  business: Business;
  onCerrar: () => void;
  avisar: (mensaje: string, tipo?: "success" | "error") => void;
  /** Tras mover la cita, el día al que ha ido (la Agenda salta a él). */
  onMovida?: (dia: string) => void;
}) {
  const timeZone = business.timezone || "Europe/Madrid";
  const calendario = getCalendarState(business);
  const horario = horarioDelNegocio(business.schedule);
  const ahora = useAhora();
  const acciones = useAccionesDeCita(avisar);
  const ajustes = useQuery({ queryKey: ["booking-settings"], queryFn: getBookingSettings, enabled: Boolean(cita) });
  const profesionales = (ajustes.data?.professionals ?? []).filter((profesional) => profesional.active);

  const [ultima, setUltima] = useState(cita);
  const [modo, setModo] = useState<"detalle" | "mover" | "cancelar">("detalle");
  useEffect(() => {
    if (cita) setUltima(cita);
    setModo("detalle");
  }, [cita]);
  const visible = cita ?? ultima;

  const aviso = acciones.avisoPendiente;
  const hojaDeAviso = (
    <HojaInferior
      abierta={Boolean(aviso)}
      onCerrar={acciones.descartarAviso}
      titulo={`¿Avisamos a ${aviso?.cliente ?? "tu cliente"} por WhatsApp?`}
      subtitulo={
        aviso
          ? `Le mandamos un mensaje ${aviso.tipo === "cambio" ? "con la nueva hora" : "diciendo que su cita queda cancelada"} al ${formatPhoneLocal(aviso.telefono) ?? aviso.telefono}.`
          : undefined
      }
    >
      <CuerpoDeHoja>
        {aviso ? (
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={() => acciones.avisarAlCliente.mutate(aviso)}
              disabled={acciones.avisarAlCliente.isPending}
              className="btn-primary w-full px-4"
            >
              {acciones.avisarAlCliente.isPending ? "Enviando…" : "Avisar por WhatsApp"}
            </button>
            <a href={enlaceTel(aviso.telefono)} onClick={acciones.descartarAviso} className="btn-secondary w-full px-4">
              <Phone className="h-[18px] w-[18px]" aria-hidden="true" />
              Le llamo yo
            </a>
          </div>
        ) : null}
      </CuerpoDeHoja>
    </HojaInferior>
  );

  if (!visible) return hojaDeAviso;

  const telefono = visible.clientPhone;
  const importe = importeDeCita(visible);
  const pasada = finDeCita(visible) <= ahora;
  const dia = claveDeDia(visible.programedAt, timeZone);
  const filas: Array<[string, string, boolean?]> = [
    ["Día", diaLargo(dia)],
    [
      "Hora",
      `${horaDelNegocio(visible.programedAt, timeZone)} – ${horaDelNegocio(finDeCita(visible), timeZone)} · ${visible.durationMinutes} min`,
      true,
    ],
    ["Profesional", visible.professional?.name ?? "Cualquiera disponible"],
    ["Cliente", visible.clientName ?? "Sin nombre"],
    ["Teléfono", formatPhoneLocal(telefono) ?? "No disponible", true],
  ];
  if (visible.numberPeople > 1) filas.push(["Personas", `${visible.numberPeople} personas`]);
  if (importe != null) filas.push(["Precio", formatPrice(importe) ?? "", true]);

  return (
    <>
      <HojaInferior
        abierta={Boolean(cita)}
        onCerrar={onCerrar}
        antetitulo={pasada ? "Cita pasada" : modo === "mover" ? "Mover la cita" : "Cita reservada"}
        titulo={nombreDeCita(visible)}
      >
        <CuerpoDeHoja>
          {modo === "mover" ? (
            <div className="pb-2">
              <FormularioDeMover
                cita={visible}
                timeZone={timeZone}
                ahora={ahora}
                horario={horario}
                profesionales={profesionales}
                moviendo={acciones.mover.isPending}
                onMover={(datos) =>
                  acciones.mover.mutate(
                    { id: visible.id, ...datos },
                    {
                      onSuccess: () => {
                        onCerrar();
                        onMovida?.(datos.fechaHora.slice(0, 10));
                      },
                    }
                  )
                }
                onCancelar={() => setModo("detalle")}
                conTitulo={false}
              />
            </div>
          ) : modo === "cancelar" ? (
            <div className="pb-2">
              <p className="text-[15px] leading-[1.55] text-tinta-2">
                {nombreDeCita(visible)}
                {visible.clientName ? ` de ${visible.clientName}` : ""}, {diaLargo(dia).toLowerCase()} a las{" "}
                {horaDelNegocio(visible.programedAt, timeZone)}. Se quita de tu calendario y, si alguien esperaba un hueco a
                esa hora, se le avisa.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => acciones.cancelar.mutate(visible.id, { onSuccess: onCerrar })}
                  disabled={acciones.cancelar.isPending}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-peligro px-4 text-[15px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  {acciones.cancelar.isPending ? "Cancelando…" : "Sí, cancelar la cita"}
                </button>
                <button type="button" onClick={() => setModo("detalle")} className="btn-secondary w-full px-4">
                  No, dejarla
                </button>
              </div>
            </div>
          ) : (
            <>
              <dl className="text-[15px]">
                {filas.map(([termino, valor, numerico], indice) => (
                  <div
                    key={termino}
                    className={`flex justify-between gap-3 border-t border-linea py-3 ${indice === filas.length - 1 ? "border-b" : ""}`}
                  >
                    <dt className="text-muted">{termino}</dt>
                    <dd className={`text-right font-semibold text-tinta ${numerico ? "tabular-nums" : ""}`}>{valor}</dd>
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
              <div className="mt-4 rounded-2xl border border-dashed border-linea px-3.5 py-3 text-sm leading-6 text-muted">
                {origenDeLaCita(visible, timeZone)}
                {visible.origen ? (
                  <Link
                    href={`/llamadas?llamada=${encodeURIComponent(visible.callId)}`}
                    onClick={onCerrar}
                    className="mt-0.5 flex min-h-11 items-center gap-1 font-semibold text-morado-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
                  >
                    {visible.origen.canal === "whatsapp" ? "Ver el chat" : "Ver la llamada"}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
              {!pasada ? (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModo("mover")}
                    disabled={!calendario.connected}
                    className="btn-secondary flex-1 px-3"
                  >
                    <CalendarClock className="h-[18px] w-[18px]" aria-hidden="true" />
                    Mover
                  </button>
                  <button
                    type="button"
                    onClick={() => setModo("cancelar")}
                    className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[10px] border border-error-borde bg-superficie px-3 text-sm font-semibold text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
                  >
                    <X className="h-[18px] w-[18px]" aria-hidden="true" />
                    Cancelar cita
                  </button>
                </div>
              ) : null}
              {!pasada && !calendario.connected ? (
                <p className="mt-2 text-[13px] leading-5 text-muted">Para mover citas desde aquí, conecta tu calendario.</p>
              ) : null}
              {calendario.connected ? (
                <a
                  href={calendario.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex min-h-12 w-full items-center justify-center gap-1.5 text-sm font-bold text-morado-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
                >
                  Abrir {calendario.label}
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              ) : null}
            </>
          )}
        </CuerpoDeHoja>
      </HojaInferior>
      {hojaDeAviso}
    </>
  );
}
