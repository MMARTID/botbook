/**
 * Estado de GET /health. Solo las dependencias críticas (Postgres y Redis)
 * deciden el código: son lo que la revisión necesita para servir, y el
 * workflow de deploy revierte la revisión si /health no da "ok". Las
 * informativas (los proveedores de voz, Telnyx y Retell) salen en el JSON
 * pero nunca lo cambian: un fallo pasajero de su API durante un deploy
 * revertía una revisión sana (con las migraciones ya aplicadas).
 */
export async function comprobarSalud(comprobaciones: {
  criticas: Record<string, () => Promise<unknown>>;
  informativas: Record<string, () => Promise<unknown>>;
}): Promise<{ healthy: boolean; dependencies: Record<string, string> }> {
  const criticas = Object.entries(comprobaciones.criticas);
  const informativas = Object.entries(comprobaciones.informativas);
  const resultados = await Promise.allSettled(
    [...criticas, ...informativas].map(([, comprobar]) => comprobar())
  );

  const dependencies: Record<string, string> = {};
  [...criticas, ...informativas].forEach(([nombre], indice) => {
    dependencies[nombre] =
      resultados[indice].status === "fulfilled" ? "ok" : "unhealthy";
  });
  const healthy = criticas.every(([nombre]) => dependencies[nombre] === "ok");
  return { healthy, dependencies };
}
