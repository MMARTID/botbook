"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarX2, Copy, Plus, Trash2, X } from "lucide-react";
import { updateMyBusiness } from "@/lib/api";
import { DIAS_DEL_HORARIO, errorDeTramos } from "@/lib/horario";
import type { Business, BusinessSchedule, ScheduleDay, WeekDay } from "@/lib/types";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import {
  DEFAULT_BUSINESS_SCHEDULE,
  formatExceptionDate,
  isBusinessSchedule,
  localDateString,
  upcomingExceptions,
} from "@/components/business-hours-editor";
import { AzulejoIcono, BarraGuardar, Interruptor } from "@/components/movil/piezas";
import { PantallaDeAjuste } from "@/components/movil/agente/pantalla-de-ajuste";

function clonar(horario: BusinessSchedule): BusinessSchedule {
  return JSON.parse(JSON.stringify(horario)) as BusinessSchedule;
}

function resumenDelDia(dia: ScheduleDay) {
  if (!dia.enabled) return "Cerrado";
  return dia.intervals.map((tramo) => `${tramo.start}–${tramo.end}`).join(" · ");
}

/**
 * Horario en el móvil: una tarjeta por día con su interruptor y el selector
 * de hora nativo, «Copiar el lunes a martes–viernes» y los días cerrados.
 * Los errores se explican bajo el día y Guardar solo aparece con cambios.
 */
export function HorarioMovil({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const { aviso, avisar, cerrar } = useAviso();
  // Por contenido y no por objeto: el negocio se vuelve a pedir al volver a
  // la app, y un objeto nuevo con el mismo horario borraría lo que el dueño
  // estaba editando si mira otra cosa a mitad.
  const firmaGuardada = JSON.stringify(isBusinessSchedule(business.schedule) ? business.schedule : DEFAULT_BUSINESS_SCHEDULE);
  const guardado = useMemo(() => clonar(JSON.parse(firmaGuardada) as BusinessSchedule), [firmaGuardada]);
  const [horario, setHorario] = useState(guardado);
  useEffect(() => setHorario(guardado), [guardado]);

  const [nuevaFecha, setNuevaFecha] = useState("");
  const [nuevoMotivo, setNuevoMotivo] = useState("");
  const [errorExcepcion, setErrorExcepcion] = useState<string | null>(null);

  const cambiado = JSON.stringify(horario) !== JSON.stringify(guardado);
  const errores = DIAS_DEL_HORARIO.filter(({ key }) => errorDeTramos(horario.week[key])).length;

  const guardar = useMutation({
    mutationFn: (nuevo: BusinessSchedule) => updateMyBusiness({ schedule: nuevo }),
    onSuccess: async (negocio) => {
      queryClient.setQueryData(["my-business"], negocio);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["booking-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["onboarding-state"] }),
      ]);
      avisar("Horario guardado y sincronizado con el agente.");
    },
    onError: () => avisar("No se pudo guardar. Revisa que los tramos no se solapen y que la apertura sea anterior al cierre.", "error"),
  });

  const cambiarDia = (clave: WeekDay, cambio: (dia: ScheduleDay) => ScheduleDay) =>
    setHorario((actual) => ({ ...actual, week: { ...actual.week, [clave]: cambio(actual.week[clave]) } }));

  const copiarLunes = () =>
    setHorario((actual) => {
      const semana = { ...actual.week };
      for (const clave of ["tuesday", "wednesday", "thursday", "friday"] as const) {
        semana[clave] = { enabled: actual.week.monday.enabled, intervals: actual.week.monday.intervals.map((tramo) => ({ ...tramo })) };
      }
      return { ...actual, week: semana };
    });

  const añadirDiaCerrado = () => {
    if (!nuevaFecha) return setErrorExcepcion("Elige la fecha que quieres cerrar.");
    if (nuevaFecha < localDateString(new Date())) return setErrorExcepcion("Esa fecha ya ha pasado.");
    if ((horario.exceptions ?? []).some((dia) => dia.date === nuevaFecha)) return setErrorExcepcion("Ese día ya está en la lista.");
    setErrorExcepcion(null);
    setHorario((actual) => ({
      ...actual,
      exceptions: [
        ...(actual.exceptions ?? []),
        { date: nuevaFecha, closed: true, intervals: [], ...(nuevoMotivo.trim() ? { label: nuevoMotivo.trim() } : {}) },
      ],
    }));
    setNuevaFecha("");
    setNuevoMotivo("");
  };

  const excepciones = upcomingExceptions(horario);

  return (
    <PantallaDeAjuste
      titulo="Horario del negocio"
      subtitulo="El agente comprueba estos tramos antes de ofrecer o confirmar una cita."
    >
      <div className="flex flex-col gap-2.5">
        <button type="button" onClick={copiarLunes} className="btn-secondary w-full">
          <Copy className="h-[18px] w-[18px]" aria-hidden="true" />
          Copiar el lunes a martes–viernes
        </button>
        <p className="mx-1 my-0.5 text-[13px] text-muted">Zona horaria: {business.timezone || "Europe/Madrid"}</p>

        {DIAS_DEL_HORARIO.map(({ key, nombre }) => {
          const dia = horario.week[key];
          const error = errorDeTramos(dia);
          return (
            <section key={key} className="panel py-0.5 pl-4 pr-3" aria-label={nombre}>
              <div className="flex min-h-[60px] items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-tinta">{nombre}</p>
                  <p className="mt-px text-sm tabular-nums text-muted">{resumenDelDia(dia)}</p>
                </div>
                <Interruptor
                  activo={dia.enabled}
                  etiqueta={`${nombre} abierto`}
                  onCambiar={(abierto) =>
                    cambiarDia(key, (actual) => ({
                      enabled: abierto,
                      intervals: abierto && actual.intervals.length === 0 ? [{ start: "09:00", end: "14:00" }] : actual.intervals,
                    }))
                  }
                />
              </div>
              {dia.enabled ? (
                <div className="flex flex-col gap-2 pb-3">
                  {dia.intervals.map((tramo, indice) => (
                    <div key={indice} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={tramo.start}
                        aria-label={`${nombre}, apertura del tramo ${indice + 1}`}
                        aria-invalid={Boolean(error)}
                        onChange={(evento) =>
                          cambiarDia(key, (actual) => ({
                            ...actual,
                            intervals: actual.intervals.map((t, i) => (i === indice ? { ...t, start: evento.target.value } : t)),
                          }))
                        }
                        className="field min-w-0 flex-1 px-1.5 text-center text-[15px] tabular-nums"
                      />
                      <span className="shrink-0 text-sm text-muted">a</span>
                      <input
                        type="time"
                        value={tramo.end}
                        aria-label={`${nombre}, cierre del tramo ${indice + 1}`}
                        aria-invalid={Boolean(error)}
                        onChange={(evento) =>
                          cambiarDia(key, (actual) => ({
                            ...actual,
                            intervals: actual.intervals.map((t, i) => (i === indice ? { ...t, end: evento.target.value } : t)),
                          }))
                        }
                        className="field min-w-0 flex-1 px-1.5 text-center text-[15px] tabular-nums"
                      />
                      {dia.intervals.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => cambiarDia(key, (actual) => ({ ...actual, intervals: actual.intervals.filter((_, i) => i !== indice) }))}
                          aria-label={`Quitar el tramo ${indice + 1} del ${nombre.toLowerCase()}`}
                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-apagado focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
                        >
                          <X className="h-[18px] w-[18px]" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {error ? (
                    <p role="alert" className="text-[13px] leading-[1.45] text-error">
                      {error}
                    </p>
                  ) : null}
                  {dia.intervals.length < 3 ? (
                    <button
                      type="button"
                      onClick={() =>
                        cambiarDia(key, (actual) => {
                          const ultimo = actual.intervals[actual.intervals.length - 1];
                          const inicio = ultimo?.end ?? "09:00";
                          const [h, m] = inicio.split(":").map(Number);
                          const fin = Math.min(h * 60 + m + 120, 23 * 60 + 30);
                          const finTexto = `${String(Math.floor(fin / 60)).padStart(2, "0")}:${String(fin % 60).padStart(2, "0")}`;
                          return { ...actual, intervals: [...actual.intervals, { start: inicio, end: finTexto }] };
                        })
                      }
                      className="flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-morado-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Añadir tramo
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {/* Días sueltos que no siguen el horario semanal: sin ellos, el agente
          daba por abierto un festivo por ser jueves. */}
      <section className="mt-6" aria-labelledby="dias-cerrados">
        <div className="flex items-start gap-3">
          <AzulejoIcono icono={CalendarX2} />
          <div className="min-w-0">
            <h2 id="dias-cerrados" className="text-base font-bold text-tinta">
              Festivos y días cerrados
            </h2>
            <p className="mt-0.5 text-sm leading-6 text-muted">El agente no ofrecerá ni confirmará citas en esas fechas.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2.5">
          <label className="text-sm font-semibold text-tinta-2">
            Fecha
            <input
              type="date"
              value={nuevaFecha}
              min={localDateString(new Date())}
              onChange={(evento) => setNuevaFecha(evento.target.value)}
              className="field mt-2 block w-full text-base font-normal"
            />
          </label>
          <label className="text-sm font-semibold text-tinta-2">
            Motivo (opcional)
            <input
              type="text"
              value={nuevoMotivo}
              maxLength={60}
              placeholder="Vacaciones, festivo local…"
              onChange={(evento) => setNuevoMotivo(evento.target.value)}
              className="field mt-2 block w-full text-base font-normal"
            />
          </label>
          {errorExcepcion ? (
            <p role="alert" className="text-sm text-error">
              {errorExcepcion}
            </p>
          ) : null}
          <button type="button" onClick={añadirDiaCerrado} className="btn-secondary w-full">
            <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
            Añadir día cerrado
          </button>
        </div>
        {excepciones.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {excepciones.map((excepcion) => (
              <li key={excepcion.date} className="flex items-center gap-3 rounded-2xl border border-linea bg-superficie py-2 pl-4 pr-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-tinta-2">{formatExceptionDate(excepcion.date)}</span>
                  <span className="block text-xs text-muted">
                    {excepcion.closed
                      ? excepcion.label || "Cerrado todo el día"
                      : excepcion.intervals.map((tramo) => `${tramo.start}–${tramo.end}`).join(" · ")}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setHorario((actual) => ({
                      ...actual,
                      exceptions: (actual.exceptions ?? []).filter((dia) => dia.date !== excepcion.date),
                    }))
                  }
                  aria-label={`Quitar el día cerrado del ${formatExceptionDate(excepcion.date)}`}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <BarraGuardar
        visible={cambiado}
        etiqueta="Guardar horario"
        guardando={guardar.isPending}
        deshabilitado={errores > 0}
        onGuardar={() => guardar.mutate(horario)}
        onDescartar={() => {
          setHorario(guardado);
          setErrorExcepcion(null);
        }}
      />
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </PantallaDeAjuste>
  );
}
