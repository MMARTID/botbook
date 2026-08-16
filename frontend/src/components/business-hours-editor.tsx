"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Copy, Plus, Save, Trash2 } from "lucide-react";
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

export function BusinessHoursEditor({
  value,
  timeZone,
  isSaving,
  onSave,
}: {
  value: Record<string, unknown>;
  timeZone: string;
  isSaving: boolean;
  onSave: (schedule: BusinessSchedule) => void;
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
    <article id="business-hours" className="panel scroll-mt-32 overflow-hidden p-0">
      <div className="border-b border-[#dce6d4] bg-[linear-gradient(90deg,#eef6dc,#f8faf5)] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#405115]">
              <CalendarClock className="h-5 w-5" />
              <h2 className="text-xl font-semibold text-[#1e2b22]">Horario del negocio</h2>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687267]">
              El agente recibe siempre este horario estructurado y lo comprueba antes de ofrecer o confirmar una cita.
            </p>
          </div>
          <span className="self-start rounded-full border border-[#d7e9c5] bg-white px-3 py-1 text-xs font-semibold text-[#405115]">
            Zona: {timeZone}
          </span>
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="space-y-2">
          {DAYS.map((day) => (
            <button
              key={day.key}
              type="button"
              onClick={() => setSelectedDay(day.key)}
              className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${selectedDay === day.key ? "border-[#b9d489] bg-[#f3f9e7]" : "border-[#e1e8da] bg-white hover:bg-[#fbfcf8]"}`}
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${schedule.week[day.key].enabled ? "bg-[#b8d96e] text-[#30430f]" : "bg-[#eef0ec] text-[#788076]"}`}>
                {day.shortLabel}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#344038]">{day.label}</span>
                <span className="block truncate text-xs text-[#687267]">{scheduleSummary(schedule.week[day.key])}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-3xl border border-[#dce7d2] bg-[#fbfcf8] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-[#1e2b22]">{DAYS.find((day) => day.key === selectedDay)?.label}</p>
              <p className="text-sm text-[#687267]">Activa el día y añade hasta tres tramos.</p>
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
                <div key={`${selectedDay}-${index}`} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 rounded-2xl border border-[#e1e8da] bg-white p-3">
                  <input
                    type="time"
                    value={interval.start}
                    onChange={(event) => updateDay((day) => ({ ...day, intervals: day.intervals.map((item, itemIndex) => itemIndex === index ? { ...item, start: event.target.value } : item) }))}
                    className="field min-w-0"
                    aria-label="Hora de apertura"
                  />
                  <span className="text-sm text-[#687267]">a</span>
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
            <div className="mt-5 rounded-2xl border border-dashed border-[#d8e3cf] bg-white px-4 py-8 text-center text-sm text-[#687267]">
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
    </article>
  );
}

function cloneScheduleDay(day: ScheduleDay): ScheduleDay {
  return { enabled: day.enabled, intervals: day.intervals.map((interval) => ({ ...interval })) };
}
