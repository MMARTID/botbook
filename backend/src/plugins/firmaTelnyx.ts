import type { FastifyReply, FastifyRequest } from "fastify";
import { telnyxAiAdapter } from "../adapters/telnyx/TelnyxAiAdapter.js";

/**
 * Verificación de la firma Ed25519 de Telnyx: cabeceras
 * `telnyx-signature-ed25519` y `telnyx-timestamp` sobre el cuerpo EXACTO
 * recibido (la ruta necesita `config: { rawBody: true }`). La comprobación
 * criptográfica y la del timestamp las hace `TelnyxAiAdapter`; aquí solo se
 * decide la respuesta.
 *
 * Es la única copia: antes estaba repetida, idéntica, en las tres rutas que
 * reciben peticiones de Telnyx. Se registra como `preHandler` del plugin
 * `modules/webhooksTelnyx/routes.ts`, así que ningún handler de esas rutas se
 * ejecuta sin firma válida:
 *
 * - 400 si falta la firma, el timestamp o el cuerpo crudo.
 * - 500 si la verificación no está configurada (sin `TELNYX_PUBLIC_KEY`): se
 *   rechaza la petición en vez de aceptarla sin comprobar.
 * - 401 si la firma no es válida o el timestamp está fuera de plazo.
 */
export async function verificarFirmaDeTelnyx(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const ruta = request.routeOptions.url;
  const firma = request.headers["telnyx-signature-ed25519"];
  const marcaDeTiempo = request.headers["telnyx-timestamp"];
  if (
    typeof firma !== "string" ||
    typeof marcaDeTiempo !== "string" ||
    !request.rawBody
  ) {
    request.log.warn(
      { ruta },
      "[Telnyx] Missing signature, timestamp or raw body"
    );
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
    valida = await telnyxAiAdapter.verifyWebhookSignature(
      cuerpo,
      firma,
      marcaDeTiempo
    );
  } catch (error) {
    request.log.error(
      { err: error, ruta },
      "[Telnyx] No se pudo verificar la firma"
    );
    return reply
      .status(500)
      .send({ error: "Signature verification not configured" });
  }
  if (!valida) {
    request.log.warn({ ruta }, "[Telnyx] Invalid signature");
    return reply.status(401).send({ error: "Invalid webhook signature" });
  }
}
