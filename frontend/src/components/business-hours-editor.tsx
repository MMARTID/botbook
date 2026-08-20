"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Copy, Plus, Save, Trash2 } from "lucide-react";
import { SettingsSection } from "@/components/settings-section";
import type { BusinessSchedule, ScheduleDay, WeekDay } from "@/lib/types";

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

  if (openDays.length === 7 && uniform) return `Todos los días · ${firstText}`;
  if (uniform) return `${openDays.length} días · ${firstText}`;
  return `${openDays.length} ${openDays.length === 1 ? "día abierto" : "días abiertos"} con horario propio`;
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

  useEffect(() => setSchedule(initialSchedule), [initialSchedule]);

  const selected = schedule.week[selectedDay];
  const updateDay = (updater: (day: ScheduleDay) => ScheduleDay) => {
    setSchedule((current) => ({
      ...current,
      week: { ...current.week, [selectedDay]: updater(current.week[selectedDay]) },
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
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${selectedDay === day.key ? "border-[#b9d489] bg-[#f3f9e7]" : "border-[#e1e8da] bg-white hover:bg-[#fbfcf8]"}`}
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${schedule.week[day.key].enabled ? "bg-[#b8d96e] text-[#30430f]" : "bg-[#eef0ec] text-[#788076]"}`}>
                {day.shortLabel}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#344038]">{day.label}</span>
                <span className="block truncate text-xs text-muted">{scheduleSummary(schedule.week[day.key])}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-[#dce7d2] bg-[#fbfcf8] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-[#1e2b22]">{DAYS.find((day) => day.key === selectedDay)?.label}</p>
              <p className="text-sm text-muted">Activa el día y añade hasta tres tramos.</p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-[#dce7d2] bg-white px-3 py-2 text-sm font-semibold text-[#344038]">
              <input
                type="checkbox"
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
              {selected.intervals.map((interval, index) => (
                <div key={`${selectedDay}-${index}`} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 rounded-xl border border-[#e1e8da] bg-white p-3">
                  <input
                    type="time"
                    value={interval.start}
                    onChange={(event) => updateDay((day) => ({ ...day, intervals: day.intervals.map((item, itemIndex) => itemIndex === index ? { ...item, start: event.target.value } : item) }))}
                    className="field min-w-0"
                    aria-label="Hora de apertura"
                  />
                  <span className="text-sm text-muted">a</span>
                  <input
                    type="time"
                    value={interval.end}
                    onChange={(event) => updateDay((day) => ({ ...day, intervals: day.intervals.map((item, itemIndex) => itemIndex === index ? { ...item, end: event.target.value } : item) }))}
                    className="field min-w-0"
                    aria-label="Hora de cierre"
                  />
                  <button
                    type="button"
                    onClick={() => updateDay((day) => ({ ...day, intervals: day.intervals.filter((_, itemIndex) => itemIndex !== index) }))}
                    disabled={selected.intervals.length === 1}
                    className="rounded-xl p-2 text-[#9f2a2a] transition hover:bg-[#fff1f1] disabled:opacity-30"
                    aria-label="Eliminar tramo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
            <div className="mt-5 rounded-xl border border-dashed border-[#d8e3cf] bg-white px-4 py-8 text-center text-sm text-muted">
              Este día figura como cerrado.
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button type="button" onClick={() => onSave(schedule)} disabled={isSaving} className="btn-primary px-5">
              <Save className="h-4 w-4" /> {isSaving ? "Guardando..." : "Guardar horario"}
            </button>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}

function cloneScheduleDay(day: ScheduleDay): ScheduleDay {
  return { enabled: day.enabled, intervals: day.intervals.map((interval) => ({ ...interval })) };
}
