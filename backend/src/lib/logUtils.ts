/**
 * Utilidades compartidas para logs y mensajes de error.
 */

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function callLabel(callId?: string): string {
  return callId ? `llamada ${callId}` : "llamada sin identificador";
}
