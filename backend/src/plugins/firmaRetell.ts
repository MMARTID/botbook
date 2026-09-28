import type { FastifyReply, FastifyRequest } from "fastify";
import { retellAdapter } from "../adapters/retell/RetellAdapter.js";

/**
 * Verificación de la firma de Retell: cabecera `x-retell-signature` sobre el
 * cuerpo EXACTO recibido (la ruta necesita `config: { rawBody: true }`). La
 * comprobación criptográfica la hace `RetellAdapter`; aquí solo se decide la
 * respuesta.
 *
 * Es la única copia: antes estaba repetida, idéntica, en las tres rutas que
 * reciben peticiones de Retell. Se registra como `preHandler` del plugin
 * `modules/webhooksRetell/routes.ts`, así que ningún handler de esas rutas se
 * ejecuta sin firma válida:
 *
 * - 400 si falta la firma o el cuerpo crudo.
 * - 500 si la verificación no está configurada (sin `RETELL_API_KEY`): se
 *   rechaza la petición en vez de aceptarla sin comprobar.
 * - 401 si la firma no es válida.
 */
export async function verificarFirmaDeRetell(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const ruta = request.routeOptions.url;
  const firma = request.headers["x-retell-signature"];
  if (typeof firma !== "string" || !request.rawBody) {
    request.log.warn({ ruta }, "[Retell] Missing signature or raw body");
    return reply
      .status(400)
      .send({ error: "Missing webhook signature or body" });
  }

  const cuerpo =
    typeof request.rawBody === "string"
      ? request.rawBody
      : request.rawBody.toString("utf8");
  let valida: boolean;
  try {
    valida = await retellAdapter.validateWebhookSignature(cuerpo, firma);
  } catch (error) {
    request.log.error(
      { err: error, ruta },
      "[Retell] No se pudo verificar la firma"
    );
    return reply
      .status(500)
      .send({ error: "Signature verification not configured" });
  }
  if (!valida) {
    request.log.warn({ ruta }, "[Retell] Invalid signature");
    return reply.status(401).send({ error: "Invalid webhook signature" });
  }
}
