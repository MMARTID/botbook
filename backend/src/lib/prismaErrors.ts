/** P2002 es la violación de una restricción @unique de Prisma. Se usa para
 * convertir una carrera (dos registros con el mismo correo, dos filas de
 * onboarding del mismo negocio) en una respuesta útil en vez de un 500. */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** P2025: un `update`/`delete` de un solo registro no encontró ninguna fila
 * que cumpla el `where` (no existe o no cumple un filtro extra, como
 * `isCancelled: false`). */
export function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2025"
  );
}
