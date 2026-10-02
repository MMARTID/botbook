"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, Check, Copy, ExternalLink, LoaderCircle, Phone, TriangleAlert, X } from "lucide-react";
import { moverCita } from "@/lib/api";
import { formatPhoneLocal, formatPrice } from "@/lib/format";
import { claveDeDia, diaLargo, horaDelNegocio } from "@/lib/fechas-negocio";
import { horaDeMinutos, tramosDelDia } from "@/lib/agenda-escritorio";
import { enlaceTel } from "@/lib/llamadas";
import type { CalendarState } from "@/lib/calendar-state";
import type { AgendaBooking, BookingProfessional, BusinessSchedule } from "@/lib/types";
import { copiarAlPortapapeles } from "@/components/movil/hoja-llamada";
import { finDeCita, importeDeCita, nombreDeCita } from "@/components/movil/hoja-cita";
import { Dialogo } from "@/components/escritorio/dialogo";
import { DatoDeDetalle, PanelDeDetalle } from "@/components/escritorio/piezas";
import { mensajeDeLaRespuesta } from "@/components/escritorio/agenda/acciones-de-cita";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function mmss(segundos: number | null) {
  if (!segundos) return null;
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}

/** «Reservada por la recepcionista el 30 sep, en una llamada de 2:14». */
export function origenDeLaCita(cita: AgendaBooking, timeZone: string) {
  if (cita.createdVia === "owner_chat") return "La apuntaste tú con el gestor.";
  const fecha = cita.origen?.startedAt ?? cita.createdAt;
  const cuando = fecha
    ? (() => {
        const [, mes, dia] = claveDeDia(fecha, timeZone).split("-").map(Number);
        return ` el ${dia} ${MESES_CORTOS[mes - 1]}`;
      })()
    : "";
  if (cita.createdVia === "whatsapp_lista_espera") return `La cogió de la lista de espera por WhatsApp${cuando}.`;
  if (cita.origen?.canal === "whatsapp" || cita.createdVia === "client_chat") {
    return `Reservada por la recepcionista${cuando}, en un chat de WhatsApp.`;
  }
  const duracion = mmss(cita.origen?.durationSecs ?? null);
  return `Reservada por la recepcionista${cuando}${duracion ? `, en una llamada de ${duracion}` : " por teléfono"}.`;
}

/**
 * Detalle de una cita a la derecha de la semana (wireframe 1e): sus datos,
 * llamar o copiar el teléfono, la conversación en la que se reservó, y
 * moverla o cancelarla sin salir de la agenda.
 */
export function DetalleDeCita({
  cita,
  timeZone,
  ahora,
  horario,
  profesionales,
  calendario,
  onCerrar,
  onMover,
  moviendo,
  onCancelar,
  cancelando,
  avisar,
}: {
  cita: AgendaBooking;
  timeZone: string;
  ahora: Date;
  horario: BusinessSchedule | null;
  profesionales: BookingProfessional[];
  calendario: CalendarState;
  onCerrar: () => void;
  onMover: (datos: { fechaHora: string; profesionalId?: string }) => void;
  moviendo: boolean;
  onCancelar: () => void;
  cancelando: boolean;
  avisar: (mensaje: string, tipo?: "success" | "error") => void;
}) {
  const [moviendoFormulario, setMoviendoFormulario] = useState(false);
  const [confirmarCancelacion, setConfirmarCancelacion] = useState(false);
  useEffect(() => {
    setMoviendoFormulario(false);
    setConfirmarCancelacion(false);
  }, [cita.id]);

  const pasada = finDeCita(cita) <= ahora;
  const importe = importeDeCita(cita);
  const telefono = cita.clientPhone;
  const dia = claveDeDia(cita.programedAt, timeZone);

  return (
    <PanelDeDetalle
      antetitulo={pasada ? "Cita pasada" : "Cita reservada"}
      titulo={nombreDeCita(cita)}
      onCerrar={onCerrar}
      ancho={360}
    >
      <p className="text-[15px] font-bold text-tinta">
        {diaLargo(dia)} · {horaDelNegocio(cita.programedAt, timeZone)} – {horaDelNegocio(finDeCita(cita), timeZone)}
      </p>
      <p className="mt-0.5 text-sm text-muted">
        {cita.durationMinutes} min{importe != null ? ` · ${formatPrice(importe)}` : ""}
      </p>

      <dl className="mt-3 divide-y divide-linea-suave rounded-2xl border border-linea bg-relleno px-3.5">
        <DatoDeDetalle termino="Profesional">{cita.professional?.name ?? "Cualquiera disponible"}</DatoDeDetalle>
        <DatoDeDetalle termino="Cliente">{cita.clientName ?? "Sin nombre"}</DatoDeDetalle>
        <DatoDeDetalle termino="Teléfono" numerico>
          {formatPhoneLocal(telefono) ?? "No disponible"}
        </DatoDeDetalle>
        {cita.numberPeople > 1 ? <DatoDeDetalle termino="Personas">{cita.numberPeople}</DatoDeDetalle> : null}
      </dl>

      {telefono ? (
        <div className="mt-3 flex gap-2">
          <a href={enlaceTel(telefono)} className="btn-primary h-10 flex-1 px-4">
            <Phone className="h-4 w-4" aria-hidden="true" />
            Llamar
          </a>
          <button
            type="button"
            onClick={() => copiarAlPortapapeles(formatPhoneLocal(telefono) ?? telefono, avisar)}
            className="btn-secondary h-10 flex-none px-4"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copiar
          </button>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-dashed border-linea px-3.5 py-3 text-sm leading-6 text-muted">
        {origenDeLaCita(cita, timeZone)}
        {cita.origen ? (
          <Link
            href={`/llamadas?llamada=${encodeURIComponent(cita.callId)}`}
            className="mt-1 flex min-h-9 items-center gap-1 font-semibold text-morado-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
          >
            {cita.origen.canal === "whatsapp" ? "Ver el chat" : "Ver la llamada"}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      {!pasada ? (
        <div className="mt-5 border-t border-linea pt-4">
          {moviendoFormulario ? (
            <FormularioDeMover
              cita={cita}
              timeZone={timeZone}
              ahora={ahora}
              horario={horario}
              profesionales={profesionales}
              moviendo={moviendo}
              onMover={onMover}
              onCancelar={() => setMoviendoFormulario(false)}
            />
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMoviendoFormulario(true)}
                disabled={!calendario.connected}
                className="btn-secondary h-10 flex-1 px-3"
              >
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                Mover
              </button>
              <button
                type="button"
                onClick={() => setConfirmarCancelacion(true)}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] border border-error-borde bg-superficie px-3 text-sm font-semibold text-error transition hover:bg-error-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Cancelar cita
              </button>
            </div>
          )}
          {!calendario.connected ? (
            <p className="mt-2 text-xs leading-5 text-muted">Para mover citas desde aquí, conecta tu calendario.</p>
          ) : null}
        </div>
      ) : null}

      {calendario.connected ? (
        <a
          href={calendario.webUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex min-h-10 items-center gap-1.5 text-sm font-semibold text-morado-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
        >
          Abrir {calendario.label}
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      ) : null}

      <Dialogo
        abierto={confirmarCancelacion}
        onCerrar={() => setConfirmarCancelacion(false)}
        titulo="¿Cancelar esta cita?"
        descripcion={`${nombreDeCita(cita)}${cita.clientName ? ` de ${cita.clientName}` : ""}, ${diaLargo(dia).toLowerCase()} a las ${horaDelNegocio(cita.programedAt, timeZone)}. Se quita de tu calendario y, si alguien esperaba un hueco a esa hora, se le avisa.`}
        pie={
          <>
            <button type="button" onClick={() => setConfirmarCancelacion(false)} className="btn-secondary h-10 px-4">
              No, dejarla
            </button>
            <button
              type="button"
              onClick={() => {
                onCancelar();
                setConfirmarCancelacion(false);
              }}
              disabled={cancelando}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-peligro px-4 text-sm font-semibold text-white transition hover:bg-peligro-hondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {cancelando ? "Cancelando…" : "Sí, cancelar la cita"}
            </button>
          </>
        }
      />
    </PanelDeDetalle>
  );
}

/** Las horas de un día en pasos de 15 minutos dentro de sus tramos
 * abiertos, sin pasarse del cierre con la duración de la cita. */
function horasPosibles(horario: BusinessSchedule | null, dia: string, duracion: number) {
  const tramos = tramosDelDia(horario, dia);
  if (tramos === null) {
    return Array.from({ length: (21 - 8) * 4 }, (_, indice) => horaDeMinutos(8 * 60 + indice * 15));
  }
  const horas: string[] = [];
  for (const tramo of tramos) {
    const [hi, mi] = tramo.start.split(":").map(Number);
    const [hf, mf] = tramo.end.split(":").map(Number);
    for (let minuto = hi * 60 + mi; minuto + duracion <= hf * 60 + mf; minuto += 15) horas.push(horaDeMinutos(minuto));
  }
  return horas;
}

/** Día, hora (en pasos de 15 min dentro del horario) y profesional, con el
 * hueco comprobado contra el servidor antes de dejar mover. Lo usan el
 * detalle de la agenda de escritorio y la hoja de la cita del móvil. */
export function FormularioDeMover({
  cita,
  timeZone,
  ahora,
  horario,
  profesionales,
  moviendo,
  onMover,
  onCancelar,
  conTitulo = true,
}: {
  cita: AgendaBooking;
  timeZone: string;
  ahora: Date;
  horario: BusinessSchedule | null;
  profesionales: BookingProfessional[];
  moviendo: boolean;
  onMover: (datos: { fechaHora: string; profesionalId?: string }) => void;
  onCancelar: () => void;
  /** En la hoja del móvil el título ya lo pone la hoja. */
  conTitulo?: boolean;
}) {
  const hoy = claveDeDia(ahora, timeZone);
  const [dia, setDia] = useState(() => claveDeDia(cita.programedAt, timeZone));
  const [hora, setHora] = useState(() => horaDelNegocio(cita.programedAt, timeZone));
  const [profesionalId, setProfesionalId] = useState("");
  const horas = useMemo(() => horasPosibles(horario, dia, cita.durationMinutes), [horario, dia, cita.durationMinutes]);
  const horaValida = horas.includes(hora) ? hora : null;
  const fechaHora = horaValida ? `${dia}T${horaValida}` : null;
  const igual =
    fechaHora === `${claveDeDia(cita.programedAt, timeZone)}T${horaDelNegocio(cita.programedAt, timeZone)}` && !profesionalId;

  const hueco = useQuery({
    queryKey: ["hueco", cita.id, fechaHora, profesionalId],
    queryFn: () => moverCita(cita.id, { fechaHora: fechaHora!, profesionalId: profesionalId || undefined, soloComprobar: true }),
    enabled: Boolean(fechaHora) && !igual,
    retry: false,
    staleTime: 15_000,
  });

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        if (fechaHora && hueco.isSuccess) onMover({ fechaHora, profesionalId: profesionalId || undefined });
      }}
      className="space-y-3"
      aria-label="Mover la cita"
    >
      {conTitulo ? <p className="text-sm font-bold text-tinta">Mover la cita</p> : null}
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <label className="text-xs font-semibold text-muted">
          Día
          <input
            type="date"
            value={dia}
            min={hoy}
            onChange={(evento) => evento.target.value && setDia(evento.target.value)}
            className="field mt-1 h-11 w-full px-3 text-sm text-tinta"
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Hora
          <select
            value={horaValida ?? ""}
            onChange={(evento) => setHora(evento.target.value)}
            className="field mt-1 h-11 w-full px-2 text-sm tabular-nums text-tinta"
            disabled={horas.length === 0}
          >
            {horaValida ? null : <option value="">—</option>}
            {horas.map((opcion) => (
              <option key={opcion} value={opcion}>
                {opcion}
              </option>
            ))}
          </select>
        </label>
      </div>
      {profesionales.length > 1 ? (
        <label className="block text-xs font-semibold text-muted">
          Profesional
          <select
            value={profesionalId}
            onChange={(evento) => setProfesionalId(evento.target.value)}
            className="field mt-1 h-11 w-full px-2 text-sm text-tinta"
          >
            <option value="">{cita.professional ? `${cita.professional.name} (la misma)` : "Quien esté libre"}</option>
            {profesionales
              .filter((profesional) => profesional.active && profesional.id !== cita.professional?.id)
              .map((profesional) => (
                <option key={profesional.id} value={profesional.id}>
                  {profesional.name}
                </option>
              ))}
          </select>
        </label>
      ) : null}

      <p className="flex min-h-6 items-start gap-1.5 text-sm leading-6" role="status">
        {horas.length === 0 ? (
          <span className="text-aviso">Ese día el negocio está cerrado.</span>
        ) : igual ? (
          <span className="text-muted">Elige otro día u otra hora.</span>
        ) : hueco.isFetching ? (
          <>
            <LoaderCircle className="mt-1 h-4 w-4 shrink-0 animate-spin text-morado" aria-hidden="true" />
            <span className="text-muted">Comprobando el hueco…</span>
          </>
        ) : hueco.isError ? (
          <>
            <TriangleAlert className="mt-1 h-4 w-4 shrink-0 text-error" aria-hidden="true" />
            <span className="text-error">{mensajeDeLaRespuesta(hueco.error, "No se ha podido comprobar ese hueco.")}</span>
          </>
        ) : hueco.isSuccess ? (
          <>
            <Check className="mt-1 h-4 w-4 shrink-0 text-exito" aria-hidden="true" />
            <span className="font-semibold text-exito">Hueco libre</span>
          </>
        ) : null}
      </p>

      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className="btn-secondary h-11 flex-none px-4">
          Volver
        </button>
        <button type="submit" disabled={!hueco.isSuccess || igual || moviendo || hueco.isFetching} className="btn-primary h-11 flex-1 px-4">
          {moviendo ? "Moviendo…" : horaValida ? `Mover a las ${horaValida}` : "Mover"}
        </button>
      </div>
      <p className="text-xs leading-5 text-muted">Se cambia también en tu calendario. Después podrás avisar al cliente.</p>
    </form>
  );
}
