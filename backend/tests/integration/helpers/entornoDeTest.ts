/**
 * Barrera antes de vaciar nada. Los tests de integración borran todas las
 * tablas y hacen FLUSHDB en cada beforeEach contra lo que digan DATABASE_URL
 * y REDIS_URL. `.env.test` se carga sin override (para que CI mande), así que
 * desde un contenedor de dev o una shell con la URL de producción exportada
 * se vaciaban esas bases. Solo se sigue si la base se llama `*_test` y Redis
 * usa un índice distinto del 0.
 */
export function comprobarEntornoDeTest(env: NodeJS.ProcessEnv = process.env): void {
  const problemas: string[] = [];

  try {
    const base = new URL(env.DATABASE_URL ?? "").pathname.replace(/^\//, "");
    if (!base.endsWith("_test")) {
      problemas.push(`la base de datos «${base || "(vacía)"}» no termina en _test`);
    }
  } catch {
    problemas.push("DATABASE_URL no es una URL válida");
  }

  try {
    const indice = new URL(env.REDIS_URL ?? "").pathname.replace(/^\//, "");
    if (indice === "" || indice === "0") {
      problemas.push("REDIS_URL usa el índice 0 (el de desarrollo); usa /1");
    }
  } catch {
    problemas.push("REDIS_URL no es una URL válida");
  }

  if (problemas.length > 0) {
    throw new Error(
      `Los tests de integración vacían la base de datos y Redis, y este entorno no parece de test: ${problemas.join("; ")}. Revisa backend/.env.test o las variables exportadas.`
    );
  }
}
