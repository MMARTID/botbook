import type { InboundMessage } from "@prisma/client";
import { palabraClaveDe } from "./webhooks.js";

/**
 * Enrutador de mensajes entrantes (PLAN-CANAL-DUENO.md § 6), en este orden:
 * palabras clave (STOP/BAJA/ALTA…) → botones y comandos → texto libre del
 * dueño (Gestor) o del cliente (recepcionista por chat).
 *
 * Fase 1 / cimientos: todavía no responde a nadie. Cada entrante queda
 * guardado y clasificado en `InboundMessage` con el handler que le tocaría,
 * para que los siguientes PRs (alta y STOP, botones de los avisos, chat en
 * Beta) solo tengan que rellenar cada rama. Mientras tanto un cliente o un
 * dueño que escriba recibe lo mismo que hoy: nada.
 */

export interface ResultadoEnrutado {
  /** Nombre del handler que atendió (o atenderá) el mensaje. */
  handler: string;
}

export async function enrutarEntrante(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  if (message.kind === "keyword" && message.text) {
    const keyword = palabraClaveDe(message.text);
    return { handler: `pendiente:palabra-clave:${keyword ?? "?"}` };
  }
  if (message.kind === "button") {
    // Un botón se correlaciona por `context.id` → SentMessage.providerMessageId
    // y por el prefijo de `buttonId` (`booking:`, `lead:`, `watch:`…).
    const prefix = message.buttonId?.split(":")[0] ?? "?";
    return { handler: `pendiente:boton:${prefix}` };
  }
  if (message.kind === "text") {
    return { handler: `pendiente:texto:${message.role}` };
  }
  return { handler: `pendiente:${message.kind}` };
}
