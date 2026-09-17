import type {
  CalendarProvider,
  CalendarProviderId,
} from "./CalendarProvider.js";
import { GoogleCalendarProvider } from "./google/GoogleCalendarProvider.js";
import { OutlookCalendarProvider } from "./outlook/OutlookCalendarProvider.js";

// Singletons sin estado (como retellAdapter): el estado por operación
// (cliente OAuth de Google, access token de Outlook) vive dentro de cada
// llamada. Este fichero importa SOLO los adaptadores; la persistencia de
// credenciales rotadas se inyecta por conexión, no por constructor.
const registro: { [P in CalendarProviderId]: CalendarProvider<P> } = {
  google: new GoogleCalendarProvider(),
  outlook: new OutlookCalendarProvider(),
};

/** Sin fallback: el id ya viene normalizado por
 * normalizarProveedorDeCalendario. */
export function obtenerProveedorDeCalendario<P extends CalendarProviderId>(
  id: P
): CalendarProvider<P> {
  return registro[id] as CalendarProvider<P>;
}
