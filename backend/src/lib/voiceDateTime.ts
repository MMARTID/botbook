/**
 * Normalización defensiva de los `startDateTime` que envía el LLM de voz a
 * las tools (check_availability, book_appointment, notify_when_available...).
 *
 * Hallazgo real (llamada de producción del 2026-09-14, conversación Telnyx
 * 48a320ef): el cliente pidió "el viernes a las cuatro" y el modelo llamó a
 * check_availability con `2026-09-18T16:00:00+00:00` — la hora hablada con
 * offset UTC. 16:00 UTC son las 18:00 en Madrid (justo el cierre), así que el
 * backend respondió OUTSIDE_BUSINESS_HOURS tres veces seguidas para horas que
 * en realidad estaban libres, y el cliente colgó sin reservar ("ya volveré a
 * llamar"). El prompt ahora exige el offset local, pero este módulo es la red
 * de seguridad en servidor: un LLM que escribe la hora hablada con `+00:00`
 * (o sin offset) casi nunca está haciendo la conversión a UTC de verdad —
 * está copiando la hora local y marcándola mal.
 *
 * Regla: si la fecha llega sin offset, o con offset cero (Z/+00:00) cuando la
 * zona del negocio NO está en offset cero en esa fecha, se reinterpreta la
 * hora de pared en la zona horaria del negocio. Un offset explícito distinto
 * de cero se respeta tal cual (el modelo hizo la conversión a conciencia).
 */

const ISO_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|z|[+-]\d{2}:?\d{2})?$/;

/** Offset de `timeZone` respecto a UTC, en minutos, en el instante `date`. */
export function timezoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;

  const match = formatted?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0; // "GMT" a secas = offset cero
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function parseExplicitOffsetMinutes(offset: string): number {
  if (offset === "Z" || offset === "z") return 0;
  const match = offset.match(/([+-])(\d{2}):?(\d{2})/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const remainder = String(absolute % 60).padStart(2, "0");
  return `${sign}${hours}:${remainder}`;
}

/** Instante real correspondiente a una hora de pared en `timeZone` — doble
 * pasada estándar para acertar el offset también en los cambios de hora. */
function wallTimeToInstant(
  parts: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZone: string
): number {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  const firstOffset = timezoneOffsetMinutes(new Date(utcGuess), timeZone);
  const firstInstant = utcGuess - firstOffset * 60_000;
  const secondOffset = timezoneOffsetMinutes(new Date(firstInstant), timeZone);
  return secondOffset === firstOffset
    ? firstInstant
    : utcGuess - secondOffset * 60_000;
}

/**
 * Devuelve el `startDateTime` con la hora de pared reinterpretada en la zona
 * del negocio cuando llega sin offset o con offset cero sospechoso (ver
 * cabecera del módulo). Cualquier entrada que no encaje en el patrón ISO
 * esperado se devuelve intacta: la validación de fechas inválidas ya la hacen
 * los propios checks de horario (INVALID_DATE_TIME).
 */
export function normalizeVoiceToolDateTime(
  startDateTime: string,
  timeZone: string
): string {
  const match = startDateTime.match(ISO_LOCAL_PATTERN);
  if (!match) return startDateTime;

  const [, year, month, day, hour, minute, second, offset] = match;
  const parts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second ?? "0"),
  };

  try {
    if (offset && parseExplicitOffsetMinutes(offset) !== 0) {
      // Offset explícito distinto de cero: el modelo hizo su conversión.
      return startDateTime;
    }

    const instant = wallTimeToInstant(parts, timeZone);
    const businessOffset = timezoneOffsetMinutes(new Date(instant), timeZone);
    if (offset && businessOffset === 0) {
      // Offset cero legítimo (la zona del negocio también está en UTC en esa
      // fecha): no hay nada que corregir.
      return startDateTime;
    }

    const time = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")}`;
    return `${year}-${month}-${day}T${time}${formatOffset(businessOffset)}`;
  } catch {
    // Zona horaria desconocida u otro fallo de Intl: mejor la entrada
    // original que romper la tool entera.
    return startDateTime;
  }
}
