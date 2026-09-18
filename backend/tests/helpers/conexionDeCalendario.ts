import type {
  FilaDeConexion,
  FilaDeConexionDeCalendario,
} from "../../src/modules/calendar/conexion.js";
import { cifrarJson } from "../../src/lib/cifradoDeCredenciales.js";

/** Fila de calendar_connections tal como la devuelve
 * SELECT_CONEXION_DE_CALENDARIO, con defaults razonables para los tests:
 * conectada y con credenciales salvo que se diga lo contrario.
 * `refreshToken: null` = fila sin credenciales (revocada). */
export function filaDeConexion(
  provider: "google" | "outlook",
  opciones: {
    refreshToken?: string | null;
    calendarId?: string | null;
    connected?: boolean;
    disconnectedAt?: Date | null;
    lastError?: string | null;
    accountEmail?: string | null;
    /** Credenciales sin cifrar (solo para probar el camino transitorio). */
    enClaro?: boolean;
  } = {}
): FilaDeConexion {
  const refreshToken =
    opciones.refreshToken === undefined
      ? `${provider}_refresh_token`
      : opciones.refreshToken;
  return {
    provider,
    calendarId:
      opciones.calendarId === undefined
        ? provider === "google"
          ? "primary"
          : "calendar_1"
        : opciones.calendarId,
    // Como en la BD real: un sobre cifrado, salvo que el test pida claro.
    credentials:
      refreshToken === null
        ? null
        : opciones.enClaro
          ? { provider, refreshToken }
          : cifrarJson({ provider, refreshToken }),
    connected: opciones.connected ?? true,
    disconnectedAt: opciones.disconnectedAt ?? null,
    lastError: opciones.lastError ?? null,
    accountEmail: opciones.accountEmail ?? null,
  };
}

/** Negocio mínimo para resolverConexionDeCalendario: proveedor activo +
 * filas. Sin filas = negocio sin ningún calendario. */
export function negocioConConexiones(
  calendarProvider: string | null,
  conexiones: FilaDeConexion[] = [],
  id = "biz_1"
): FilaDeConexionDeCalendario & { id: string } {
  return { id, calendarProvider, calendarConnections: conexiones };
}
