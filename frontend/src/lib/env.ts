/**
 * Aislado en su propio módulo para poder mockearlo en tests — Vite sustituye
 * `process.env.NODE_ENV` por un literal en tiempo de build, así que
 * `vi.stubEnv` en el cuerpo de un test nunca llega a tiempo (el módulo ya se
 * evaluó al importarlo). Mockear este módulo entero sí funciona.
 */
export function isProductionBuild(): boolean {
  return process.env.NODE_ENV === "production";
}
