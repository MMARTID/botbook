import { prisma } from "./prisma.js";

function esErrorDeUnicidad(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Datos con los que puede nacer la fila de `SentMessage` al reclamarla. Los
 * envíos de WhatsApp los rellenan para que un webhook de estado que llegue
 * antes que `registrarEnvio` (carrera envío ↔ `statuses[]`) ya encuentre a
 * qué negocio, audiencia y destino pertenece el mensaje. Los jobs de voz
 * siguen llamando sin ellos.
 */
export interface DatosDelEnvio {
  businessId?: string | null;
  audience?: string;
  toNumber?: string;
  callbackData?: string;
  kind?: string;
}

/**
 * Reclama un envío para que salga exactamente una vez. Cloud Tasks entrega al
 * menos una vez: un correo que tarda más que el plazo de la tarea se
 * reintenta aunque el proveedor ya lo haya aceptado, y el cliente recibe dos
 * veces la misma confirmación.
 *
 * Devuelve `true` si este proceso es el que debe enviar. Sin clave devuelve
 * `true` (no hay nada que deduplicar) y mantiene el comportamiento anterior.
 * Si la base de datos falla, también devuelve `true`: preferimos arriesgarnos
 * a un duplicado antes que dejar a un cliente sin su confirmación.
 */
export async function reclamarEnvio(
  channel: "email" | "sms" | "whatsapp",
  idempotencyKey: string | undefined,
  extra?: DatosDelEnvio
): Promise<boolean> {
  if (!idempotencyKey) {
    return true;
  }
  try {
    await prisma.sentMessage.create({
      data: { channel, idempotencyKey, ...(extra ?? {}) },
    });
    return true;
  } catch (error) {
    if (esErrorDeUnicidad(error)) {
      console.log(
        `[Job] ${channel} ${idempotencyKey} ya se había enviado; se descarta la entrega repetida`
      );
      return false;
    }
    console.error(
      `[Job] No se pudo comprobar si ${channel} ${idempotencyKey} ya se había enviado:`,
      error instanceof Error ? error.message : String(error)
    );
    return true;
  }
}
