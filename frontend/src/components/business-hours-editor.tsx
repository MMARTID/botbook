"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarX2, Copy, Plus, Save, Trash2 } from "lucide-react";
import { SettingsSection } from "@/components/settings-section";
import type {
  BusinessSchedule,
  ScheduleDay,
  ScheduleException,
  WeekDay,
} from "@/lib/types";

const DAYS: Array<{ key: WeekDay; label: string; shortLabel: string }> = [
  { key: "monday", label: "Lunes", shortLabel: "L" },
  { key: "tuesday", label: "Martes", shortLabel: "M" },
  { key: "wednesday", label: "Miércoles", shortLabel: "X" },
  { key: "thursday", label: "Jueves", shortLabel: "J" },
  { key: "friday", label: "Viernes", shortLabel: "V" },
  { key: "saturday", label: "Sábado", shortLabel: "S" },
  { key: "sunday", label: "Domingo", shortLabel: "D" },
];

export const DEFAULT_BUSINESS_SCHEDULE: BusinessSchedule = {
  version: 1,
  week: {
    monday: { enabled: true, intervals: [{ start: "09:00", end: "18:00" }] },
    tuesday: { enabled: true, intervals: [{ start: "09:00", end: "18:00" }] },
    wednesday: { enabled: true, intervals: [{ start: "09:00", end: "18:00" }] },
    thursday: { enabled: true, intervals: [{ start: "09:00", end: "18:00" }] },
    friday: { enabled: true, intervals: [{ start: "09:00", end: "18:00" }] },
    saturday: { enabled: false, intervals: [] },
    sunday: { enabled: false, intervals: [] },
  },
};

function isBusinessSchedule(value: unknown): value is BusinessSchedule {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BusinessSchedule>;
  return candidate.version === 1 && Boolean(candidate.week) && DAYS.every(({ key }) => Boolean(candidate.week?.[key]));
}

function cloneSchedule(schedule: BusinessSchedule): BusinessSchedule {
  return JSON.parse(JSON.stringify(schedule)) as BusinessSchedule;
}

function scheduleSummary(day: ScheduleDay) {
  if (!day.enabled) return "Cerrado";
  return day.intervals.map((interval) => `${interval.start}–${interval.end}`).join(" · ");
}

/** Resumen de una línea del horario para la cabecera plegable de ajustes. */
export function getScheduleSummary(schedule: BusinessSchedule): string {
  const openDays = DAYS.filter(({ key }) => schedule.week[key].enabled);
  if (openDays.length === 0) return "Cerrado toda la semana";

  const firstText = scheduleSummary(schedule.week[openDays[0].key]);
  const uniform = openDays.every(({ key }) => scheduleSummary(schedule.week[key]) === firstText);

  const base =
    openDays.length === 7 && uniform
      ? `Todos los días · ${firstText}`
      : uniform
        ? `${openDays.length} días · ${firstText}`
        : `${openDays.length} ${openDays.length === 1 ? "día abierto" : "días abiertos"} con horario propio`;

  const proximas = upcomingExceptions(schedule).length;
  return proximas > 0
    ? `${base} · ${proximas} ${proximas === 1 ? "día especial" : "días especiales"}`
    : base;
}

/** Excepciones de hoy en adelante, ordenadas. Las pasadas se conservan en el
 * horario guardado pero no se enseñan: solo serían ruido. */
function upcomingExceptions(schedule: BusinessSchedule): ScheduleException[] {
  const hoy = localDateString(new Date());
  return (schedule.exceptions ?? [])
    .filter((exception) => exception.date >= hoy)
    .sort((izquierda, derecha) => izquierda.date.localeCompare(derecha.date));
}

function localDateString(date: Date): string {
  // La fecha local del usuario, no la UTC: a las 23:30 en Madrid, toISOString
  // ya devuelve el día siguiente y el festivo de hoy desaparecería de la lista.
  const desfase = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - desfase).toISOString().slice(0, 10);
}

function formatExceptionDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export function BusinessHoursEditor({
  value,
  timeZone,
  isSaving,
  onSave,
  open,
  onToggle,
}: {
  value: Record<string, unknown>;
  timeZone: string;
  isSaving: boolean;
  onSave: (schedule: BusinessSchedule) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const initialSchedule = useMemo(
    () => cloneSchedule(isBusinessSchedule(value) ? value : DEFAULT_BUSINESS_SCHEDULE),
    [value],
  );
  const [schedule, setSchedule] = useState(initialSchedule);
  const [selectedDay, setSelectedDay] = useState<WeekDay>("monday");
  const [nuevaFecha, setNuevaFecha] = useState("");
  const [nuevoMotivo, setNuevoMotivo] = useState("");
  const [errorExcepcion, setErrorExcepcion] = useState<string | null>(null);

  useEffect(() => setSchedule(initialSchedule), [initialSchedule]);

  const selected = schedule.week[selectedDay];
  const updateDay = (updater: (day: ScheduleDay) => ScheduleDay) => {
    setSchedule((current) => ({
      ...current,
      week: { ...current.week, [selectedDay]: updater(current.week[selectedDay]) },
    }));
  };

  const excepciones = upcomingExceptions(schedule);

  const añadirDiaCerrado = () => {
    if (!nuevaFecha) {
      setErrorExcepcion("Elige la fecha que quieres cerrar.");
      return;
    }
    if (nuevaFecha < localDateString(new Date())) {
      setErrorExcepcion("Esa fecha ya ha pasado.");
      return;
    }
    if ((schedule.exceptions ?? []).some((item) => item.date === nuevaFecha)) {
      setErrorExcepcion("Ese día ya está en la lista.");
      return;
    }
    setErrorExcepcion(null);
    setSchedule((current) => ({
      ...current,
      exceptions: [
        ...(current.exceptions ?? []),
        {
          date: nuevaFecha,
          closed: true,
          intervals: [],
          ...(nuevoMotivo.trim() ? { label: nuevoMotivo.trim() } : {}),
        },
      ],
    }));
    setNuevaFecha("");
    setNuevoMotivo("");
  };

  const quitarExcepcion = (date: string) => {
    setSchedule((current) => ({
      ...current,
      exceptions: (current.exceptions ?? []).filter((item) => item.date !== date),
    }));
  };

  const copyToWeekdays = () => {
    setSchedule((current) => {
      const source = current.week[selectedDay];
      const week = { ...current.week };
      for (const day of DAYS.slice(0, 5)) week[day.key] = cloneScheduleDay(source);
      return { ...current, week };
    });
  };

  return (
    <SettingsSection
      id="business-hours"
      icon={CalendarClock}
      title="Horario del negocio"
      summary={`${getScheduleSummary(schedule)} · ${timeZone}`}
      open={open}
      onToggle={onToggle}
    >
      <p className="max-w-2xl px-4 pt-4 text-sm leading-6 text-muted sm:px-6">
        El agente recibe siempre este horario estructurado y lo comprueba antes de ofrecer o confirmar una cita.
      </p>

      <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="space-y-2">
          {DAYS.map((day) => (
            <button
              key={day.key}
              type="button"
              onClick={() => setSelectedDay(day.key)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 ${selectedDay === day.key ? "border-[#8b5cf6] bg-[#f3eeff]" : "border-[#e5e5e5] bg-white hover:bg-[#fafafa]"}`}
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${schedule.week[day.key].enabled ? "bg-[#8b5cf6] text-[#ffffff]" : "bg-[#f4f4f5] text-[#a1a1aa]"}`}>
                {day.shortLabel}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#27272a]">{day.label}</span>
                <span className="block truncate text-xs text-muted">{scheduleSummary(schedule.week[day.key])}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-[#0a0a0a]">{DAYS.find((day) => day.key === selectedDay)?.label}</p>
              <p className="text-sm text-muted">Activa el día y añade hasta tres tramos.</p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-[#e5e5e5] bg-white px-3 py-2 text-sm font-semibold text-[#27272a]">
              <input
                type="checkbox"
                className="accent-[#8b5cf6]"
                checked={selected.enabled}
                onChange={(event) => updateDay((day) => ({
                  enabled: event.target.checked,
                  intervals: event.target.checked && day.intervals.length === 0 ? [{ start: "09:00", end: "18:00" }] : day.intervals,
                }))}
              />
              {selected.enabled ? "Abierto" : "Cerrado"}
            </label>
          </div>

          {selected.enabled ? (
            <div className="mt-5 space-y-3">
              {/* Las horas se envuelven en vez de repartirse el ancho a partes
                  iguales: `input[type=time]` lo pinta el navegador con el
                  formato del usuario, y en 12 horas («06:00 PM» más el icono de
                  reloj) no cabía en media fila de móvil: recortaba la hora. */}
              {selected.intervals.map((interval, index) => (
                <div key={`${selectedDay}-${index}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white p-3">
                  <input
                    type="time"
                    value={interval.start}
                    onChange={(event) => updateDay((day) => ({ ...day, intervals: day.intervals.map((item, itemIndex) => itemIndex === index ? { ...item, start: event.target.value } : item) }))}
                    className="field min-w-[7.5rem] flex-1 px-3"
                    aria-label="Hora de apertura"
                  />
                  <span className="text-sm text-muted">a</span>
                  <input
                    type="time"
                    value={interval.end}
                    onChange={(event) => updateDay((day) => ({ ...day, intervals: day.intervals.map((item, itemIndex) => itemIndex === index ? { ...item, end: event.target.value } : item) }))}
                    className="field min-w-[7.5rem] flex-1 px-3"
                    aria-label="Hora de cierre"
                  />
                  {/* Con un solo tramo no hay nada que borrar: se oculta en
                      vez de dejarlo deshabilitado, y así los dos campos de hora
                      caben en una línea en móvil. */}
                  {selected.intervals.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => updateDay((day) => ({ ...day, intervals: day.intervals.filter((_, itemIndex) => itemIndex !== index) }))}
                      className="ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#c53030] transition duration-200 hover:bg-[#fff1f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
                      aria-label="Eliminar tramo"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              ))}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={selected.intervals.length >= 3}
                  onClick={() => updateDay((day) => ({ ...day, intervals: [...day.intervals, { start: "16:00", end: "20:00" }] }))}
                  className="btn-secondary px-4 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" /> Añadir tramo
                </button>
                <button type="button" onClick={copyToWeekdays} className="btn-secondary px-4">
                  <Copy className="h-4 w-4" /> Copiar a L–V
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-[#e5e5e5] bg-white px-4 py-8 text-center text-sm text-muted">
              Este día figura como cerrado.
            </div>
          )}
        </div>
      </div>

      {/* Días sueltos que no siguen el horario semanal. Sin esto, el agente
          daba por abierto un festivo por ser "jueves" y confirmaba citas para
          un día con la persiana bajada. */}
      <div className="border-t border-[#e5e5e5] p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
            <CalendarX2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-[#0a0a0a]">Festivos y días cerrados</p>
            <p className="text-sm leading-6 text-muted">
              Marca los días que cierras aunque toquen en un día que normalmente abres.
              El agente no ofrecerá ni confirmará citas en esas fechas.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-sm font-medium text-[#27272a]">
            Fecha
            <input
              type="date"
              value={nuevaFecha}
              min={localDateString(new Date())}
              onChange={(event) => setNuevaFecha(event.target.value)}
              className="field px-3"
            />
          </label>
          <label className="flex min-w-[12rem] flex-[2] flex-col gap-1 text-sm font-medium text-[#27272a]">
            Motivo (opcional)
            <input
              type="text"
              value={nuevoMotivo}
              maxLength={60}
              placeholder="Vacaciones, festivo local..."
              onChange={(event) => setNuevoMotivo(event.target.value)}
              className="field px-3"
            />
          </label>
          <button type="button" onClick={añadirDiaCerrado} className="btn-secondary px-4">
            <Plus className="h-4 w-4" /> Añadir día cerrado
          </button>
        </div>

        <p className="min-h-5 pt-1 text-sm text-[#c53030]" role="alert">
          {errorExcepcion}
        </p>

        {excepciones.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {excepciones.map((exception) => (
              <li
                key={exception.date}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e5e5e5] bg-white p-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#27272a]">
                    {formatExceptionDate(exception.date)}
                  </span>
                  <span className="block text-xs text-muted">
                    {exception.closed
                      ? exception.label || "Cerrado todo el día"
                      : exception.intervals
                          .map((interval) => `${interval.start}–${interval.end}`)
                          .join(" · ")}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => quitarExcepcion(exception.date)}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#c53030] transition duration-200 hover:bg-[#fff1f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
                  aria-label={`Quitar el día cerrado del ${formatExceptionDate(exception.date)}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] px-4 py-6 text-center text-sm text-muted">
            No hay ningún día especial guardado. El agente seguirá el horario semanal.
          </p>
        )}
      </div>

      {/* Un único Guardar para toda la sección: la semana y los días especiales
          viajan en el mismo objeto y se guardan de una vez. Con un botón por
          bloque salían dos primarios idénticos en el mismo panel. */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#e5e5e5] p-4 sm:p-6">
        <p className="mr-auto text-sm text-muted">
          Se guardan a la vez el horario semanal y los días especiales.
        </p>
        <button
          type="button"
          onClick={() => onSave(schedule)}
          disabled={isSaving}
          className="btn-primary shrink-0 whitespace-nowrap px-5"
        >
          <Save className="h-4 w-4" /> {isSaving ? "Guardando..." : "Guardar horario"}
        </button>
      </div>
    </SettingsSection>
  );
}

function cloneScheduleDay(day: ScheduleDay): ScheduleDay {
  return { enabled: day.enabled, intervals: day.intervals.map((interval) => ({ ...interval })) };
}
