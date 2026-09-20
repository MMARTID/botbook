/**
 * Crea o pone al día el Gestor (PLAN-CANAL-DUENO.md § 8): el assistant ÚNICO
 * de plataforma de Telnyx con el que chatea el dueño por WhatsApp. Uno por
 * entorno; su id vive en TELNYX_GESTOR_ASSISTANT_ID.
 *
 *   npx tsx scripts/manual/sincronizarGestor.mts --crear   # primera vez: imprime el id
 *   npx tsx scripts/manual/sincronizarGestor.mts           # compara y actualiza si hace falta
 *
 * Necesita TELNYX_API_KEY y BASE_URL (la URL pública del backend: las tools
 * apuntan a <BASE_URL>/webhooks/telnyx/gestor/<tool>). El reconciliador diario
 * hace lo mismo que la ejecución sin argumentos, así que este script solo hace
 * falta para crear el assistant o para forzar la puesta al día sin esperar.
 * No toca la base de datos.
 */
import { sincronizarGestor } from "../../src/lib/gestorSync.js";

const crear = process.argv.includes("--crear");
const resultado = await sincronizarGestor({ crear });

switch (resultado.estado) {
  case "sin_base_url":
    console.error(
      "Falta BASE_URL: las tools del Gestor necesitan la URL pública del backend."
    );
    process.exit(1);
  // eslint-disable-next-line no-fallthrough
  case "sin_id":
    console.error(
      "Falta TELNYX_GESTOR_ASSISTANT_ID. Ejecuta con --crear para crear el assistant y guarda el id en el entorno."
    );
    process.exit(1);
  // eslint-disable-next-line no-fallthrough
  case "creado":
    console.log(`Gestor creado: ${resultado.id}`);
    console.log(
      `Guarda TELNYX_GESTOR_ASSISTANT_ID=${resultado.id} en el entorno (dev: .env; producción: Secret Manager / Cloud Run).`
    );
    break;
  case "al_dia":
    console.log(`Gestor ${resultado.id} al día.`);
    break;
  case "actualizado":
    console.log(`Gestor ${resultado.id} actualizado.`);
    break;
  case "error":
    console.error(`No se pudo sincronizar el Gestor: ${resultado.motivo}`);
    process.exit(1);
}
process.exit(0);
