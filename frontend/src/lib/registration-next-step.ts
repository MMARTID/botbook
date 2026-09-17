const NEXT_STEP_KEY = "registration_next_step";
const NEXT_STEP_AT_KEY = "registration_next_step_at";

/**
 * Un alta a medias no puede seguir viva indefinidamente: sin caducidad, quien
 * falló al conectar Outlook durante el registro y semanas después conecta la
 * agenda desde Ajustes acababa devuelto al paso de registro y de ahí a
 * /planes, con una cuenta ya en marcha.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Guarda el paso al que volver tras el OAuth, con la hora en que se guardó. */
export function saveRegistrationNextStep(path: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NEXT_STEP_KEY, path);
  window.localStorage.setItem(NEXT_STEP_AT_KEY, String(Date.now()));
}

/** Descarta el paso pendiente: el alta terminó, se abandonó o falló. */
export function clearRegistrationNextStep() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(NEXT_STEP_KEY);
  window.localStorage.removeItem(NEXT_STEP_AT_KEY);
}

/**
 * Devuelve el paso pendiente y lo borra siempre, haya sido válido o no: si se
 * dejara puesto volvería a dispararse en la siguiente conexión de agenda.
 */
export function consumeRegistrationNextStep(): string | null {
  if (typeof window === "undefined") return null;

  const path = window.localStorage.getItem(NEXT_STEP_KEY);
  const savedAt = Number(window.localStorage.getItem(NEXT_STEP_AT_KEY));
  clearRegistrationNextStep();

  if (!path) return null;
  // Sin marca de tiempo viene de una versión anterior a este control: no hay
  // forma de saber si sigue vigente, así que se trata como caducado.
  if (!Number.isFinite(savedAt) || savedAt <= 0) return null;
  if (Date.now() - savedAt > MAX_AGE_MS) return null;

  return path;
}
