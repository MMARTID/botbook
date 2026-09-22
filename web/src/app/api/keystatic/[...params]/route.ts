import { makeRouteHandler } from "@keystatic/next/route-handler";
import config from "../../../../../keystatic.config";

/**
 * Rutas internas de Keystatic: el intercambio OAuth con la GitHub App y la
 * lectura/escritura del repo. Nada que ver con api.alhabla.ai (el backend).
 *
 * En modo GitHub, Keystatic exige sus variables al cargar el módulo; en CI
 * (build sin secretos) y en cualquier entorno sin ellas, el editor queda
 * fuera de servicio con un 503 en vez de tumbar el build de toda la web.
 */
const configurado =
  config.storage.kind !== "github" ||
  Boolean(
    process.env.KEYSTATIC_GITHUB_CLIENT_ID &&
    process.env.KEYSTATIC_GITHUB_CLIENT_SECRET &&
    process.env.KEYSTATIC_SECRET
  );

const handler = configurado ? makeRouteHandler({ config }) : null;

function noConfigurado() {
  return new Response(
    "Editor del blog sin configurar: faltan KEYSTATIC_GITHUB_CLIENT_ID, KEYSTATIC_GITHUB_CLIENT_SECRET o KEYSTATIC_SECRET.",
    { status: 503 }
  );
}

export const GET = handler?.GET ?? noConfigurado;
export const POST = handler?.POST ?? noConfigurado;
