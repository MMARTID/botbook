import { z } from "zod";

export const WEEK_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type WeekDay = (typeof WEEK_DAYS)[number];

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "La hora debe usar el formato HH:mm");

const ScheduleIntervalSchema = z.object({
  start: TimeSchema,
  end: TimeSchema,
}).refine((interval) => interval.start < interval.end, {
  message: "La hora de cierre debe ser posterior a la de apertura",
});

const ScheduleDaySchema = z.object({
  enabled: z.boolean(),
  intervals: z.array(ScheduleIntervalSchema).max(3),
}).superRefine((day, context) => {
  if (day.enabled && day.intervals.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Un día abierto necesita al menos un tramo" });
  }

  const sorted = [...day.intervals].sort((left, right) => left.start.localeCompare(right.start));
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].start < sorted[index - 1].end) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Los tramos horarios no pueden solaparse" });
      break;
    }
  }
});

const weekShape = Object.fromEntries(
  WEEK_DAYS.map((day) => [day, ScheduleDaySchema]),
) as Record<WeekDay, typeof ScheduleDaySchema>;

export const BusinessScheduleSchema = z.object({
  version: z.literal(1),
  week: z.object(weekShape),
});

export type BusinessSchedule = z.infer<typeof BusinessScheduleSchema>;

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

const ENGLISH_WEEKDAY_TO_KEY: Record<string, WeekDay> = {
  Monday: "monday",
  Tuesday: "tuesday",
  Wednesday: "wednesday",
  Thursday: "thursday",
  Friday: "friday",
  Saturday: "saturday",
  Sunday: "sunday",
};

function localDateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    day: ENGLISH_WEEKDAY_TO_KEY[value("weekday")],
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

export function checkBusinessHours(
  scheduleInput: unknown,
  timeZone: string,
  startDateTime: string,
  durationMinutes = 0,
) {
  const parsedSchedule = BusinessScheduleSchema.safeParse(scheduleInput);
  if (!parsedSchedule.success) {
    return {
      success: false,
      code: "BUSINESS_HOURS_NOT_CONFIGURED",
      message: "El negocio todavía no ha configurado un horario estructurado.",
    } as const;
  }

  const start = new Date(startDateTime);
  if (Number.isNaN(start.getTime())) {
    return { success: false, code: "INVALID_DATE_TIME", message: "La fecha y hora no son válidas." } as const;
  }

  const end = new Date(start.getTime() + Math.max(0, durationMinutes) * 60_000);
  const localStart = localDateTimeParts(start, timeZone);
  const localEnd = localDateTimeParts(end, timeZone);
  const daySchedule = parsedSchedule.data.week[localStart.day];
  const matchingInterval = localStart.date === localEnd.date && daySchedule.enabled
    ? daySchedule.intervals.find((interval) => localStart.time >= interval.start && localEnd.time <= interval.end)
    : undefined;

  return {
    success: true,
    isOpen: Boolean(matchingInterval),
    code: matchingInterval ? "WITHIN_BUSINESS_HOURS" : "OUTSIDE_BUSINESS_HOURS",
    timeZone,
    localStart: `${localStart.date}T${localStart.time}`,
    localEnd: `${localEnd.date}T${localEnd.time}`,
    day: localStart.day,
    intervals: daySchedule.enabled ? daySchedule.intervals : [],
    schedule: parsedSchedule.data,
    message: matchingInterval
      ? "La cita está completamente dentro del horario del negocio."
      : "La cita queda fuera del horario configurado del negocio.",
  } as const;
}

function formatMinutesForHumans(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hora" : "horas"}`;
  }
  return `${minutes} minutos`;
}

/**
 * Restricciones de reserva del negocio (antelación mínima, duración máxima),
 * independientes del horario de apertura. Se comprueban tanto al ofrecer un
 * hueco (check_business_hours) como al confirmar la reserva (book_appointment),
 * sin fiarse de una comprobación anterior en la misma llamada.
 */
export function checkBookingRestrictions(
  business: { minAdvanceBookingMinutes?: number | null; maxAppointmentDurationMinutes?: number | null },
  startDateTime: string,
  durationMinutes: number,
):
  | { success: true }
  | { success: false; code: "INVALID_DATE_TIME" | "MIN_ADVANCE_NOT_MET" | "MAX_DURATION_EXCEEDED"; message: string } {
  const start = new Date(startDateTime);
  if (Number.isNaN(start.getTime())) {
    return { success: false, code: "INVALID_DATE_TIME", message: "La fecha y hora no son válidas." };
  }

  if (business.minAdvanceBookingMinutes) {
    const minutesUntilStart = (start.getTime() - Date.now()) / 60_000;
    if (minutesUntilStart < business.minAdvanceBookingMinutes) {
      return {
        success: false,
        code: "MIN_ADVANCE_NOT_MET",
        message: `Este negocio necesita al menos ${formatMinutesForHumans(business.minAdvanceBookingMinutes)} de antelación para reservar una cita.`,
      };
    }
  }

  if (business.maxAppointmentDurationMinutes && durationMinutes > business.maxAppointmentDurationMinutes) {
    return {
      success: false,
      code: "MAX_DURATION_EXCEEDED",
      message: `La duración máxima permitida por cita en este negocio es de ${business.maxAppointmentDurationMinutes} minutos.`,
    };
  }

  return { success: true };
}
