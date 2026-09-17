import { createHash } from "node:crypto";

// Reglas de contenido del evento compartidas por todos los proveedores de
// calendario. Aquí no hay nada de Google ni de Outlook: solo lo que cualquier
// adaptador necesita para traducir una reserva a su API.

/** Recordatorio nativo de la app de calendario (Google Calendar / Outlook en
 * el móvil) que dispara la notificación push al propietario 2h antes de la
 * cita — no requiere ningún job ni canal de notificación propio, ambas
 * plataformas lo gestionan solas a partir de este campo del evento. */
export const REMINDER_MINUTES_BEFORE_START = 120;

/** Límite documentado de Google Calendar para reminders.overrides[].minutes
 * (4 semanas) — Microsoft Graph no impone uno menor para
 * reminderMinutesBeforeStart, así que reutilizarlo para ambos providers es
 * seguro. */
export const MAX_REMINDER_MINUTES = 40_320;

// Límite propio bajo el timeout de 20s que Retell aplica a cada tool call:
// así el backend corta la petición él mismo en vez de dejarla colgada
// respondiendo a nadie cuando Retell ya se rindió.
export const CALENDAR_REQUEST_TIMEOUT_MS = 8000;

/** Google Calendar no avisa al propietario de que se creó un evento nuevo
 * por el simple hecho de insertarlo en su propio calendario (confirmado con
 * la documentación oficial — solo notifica a invitados vía sendUpdates, o
 * mediante un reminder configurado). Para lograr el aviso inmediato que
 * REMINDER_MINUTES_BEFORE_START no cubre si la cita es para dentro de más de
 * 2h, se calcula un segundo reminder cuyo "minutos antes del evento" resulta
 * en que dispare casi en el instante de la creación — un reminder normal,
 * no una notificación push especial, así que ambas apps lo soportan igual.
 * Un evento cuya cita ya está a <1 minuto (o en el pasado, si el reloj del
 * cliente y el servidor difieren un poco) usa 0 en vez de un valor negativo,
 * que Google/Outlook rechazarían. Si la cita está a más de
 * MAX_REMINDER_MINUTES vista (nada en el código impone un máximo de
 * antelación de reserva — checkBookingRestrictions solo valida un mínimo),
 * ese "minutos antes" ya no cabe en el límite de la API y devolvemos null:
 * mejor omitir el aviso inmediato que hacer fallar la reserva entera
 * intentando mandar un valor que Google/Outlook van a rechazar. */
export function buildImmediateReminderMinutes(startTime: Date): number | null {
  // Math.floor ya trunca hacia abajo (hasta ~1 minuto de margen natural: si
  // faltan 60.9 minutos da 60, no 61), así que no hace falta restar un
  // minuto extra encima — eso solo añadía otro minuto de espera innecesario.
  // Confirmado en una llamada real de prueba (2026-09-07): la notificación
  // tardó "casi un minuto" en llegar con el margen doble.
  const minutes = Math.max(
    0,
    Math.floor((startTime.getTime() - Date.now()) / 60_000)
  );
  return minutes <= MAX_REMINDER_MINUTES ? minutes : null;
}

/** Título y descripción del evento con todo lo que se conoce de la reserva.
 * Antes el evento solo llevaba "Reserva de <nombre>" y una frase genérica;
 * sin servicio, profesional ni teléfono, el propietario tenía que volver a
 * la app de Alhabla para saber de qué iba la cita. */
export function buildEventContent(input: {
  clientName: string;
  clientPhone?: string | null;
  serviceNames?: string[] | null;
  professionalName?: string | null;
}) {
  const services = input.serviceNames?.filter(Boolean) ?? [];
  const summary =
    services.length > 0
      ? `${services.join(" + ")} — ${input.clientName}`
      : `Reserva de ${input.clientName}`;

  const descriptionLines = [
    `Cliente: ${input.clientName}`,
    input.clientPhone ? `Teléfono: ${input.clientPhone}` : null,
    services.length > 0
      ? `Servicio${services.length > 1 ? "s" : ""}: ${services.join(", ")}`
      : null,
    input.professionalName ? `Profesional: ${input.professionalName}` : null,
    "",
    "Cita generada por el asistente virtual de Alhabla.",
  ].filter((line) => line !== null);

  return { summary, description: descriptionLines.join("\n") };
}

/** Base común de los ids deterministas de evento: sha256 hex de la clave de
 * idempotencia. Cada proveedor le aplica su formato (Google: "alhabla"+hex;
 * Outlook: UUID determinista). Misma fórmula ⇒ mismos ids que hasta ahora. */
export function hashDeIdempotencia(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
