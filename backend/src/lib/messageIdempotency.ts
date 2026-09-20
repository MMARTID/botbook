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
export interface OpcionesDeReclamo {
  /**
   * Si la clave ya existe pero su fila quedó `failed` SIN `providerMessageId`
   * (Telnyx nunca aceptó el mensaje), se vuelve a reclamar: se limpia el
   * fallo y se devuelve `true`. Solo para envíos que un reintento debe
   * repetir de verdad (mensajes al cliente, vCard); los avisos al negocio y
   * las respuestas del enrutador conservan la semántica de siempre.
   */
  reintentarFallidos?: boolean;
}

export async function reclamarEnvio(
  channel: "email" | "sms" | "whatsapp",
  idempotencyKey: string | undefined,
  extra?: DatosDelEnvio,
  opciones?: OpcionesDeReclamo
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
      if (opciones?.reintentarFallidos) {
        const reabierta = await reclamarFilaFallida(channel, idempotencyKey);
        if (reabierta) {
          console.log(
            `[Job] ${channel} ${idempotencyKey} había fallado; se vuelve a intentar`
          );
          return true;
        }
      }
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

/**
 * Reabre una fila `failed` que Telnyx nunca aceptó (`providerMessageId`
 * null). Una fila `queued/sent/delivered/read/suppressed/skipped`, o
 * `failed` con `providerMessageId` (el fallo fue posterior a la
 * aceptación), nunca se re-reclama. Devuelve si se reabrió.
 */
async function reclamarFilaFallida(
  channel: "email" | "sms" | "whatsapp",
  idempotencyKey: string
): Promise<boolean> {
  try {
    const result = await prisma.sentMessage.updateMany({
      where: {
        channel,
        idempotencyKey,
        deliveryStatus: "failed",
        providerMessageId: null,
      },
      data: {
        deliveryStatus: null,
        errorCode: null,
        errorDetail: null,
        failedAt: null,
        sentAt: new Date(),
      },
    });
    return result.count === 1;
  } catch (error) {
    console.error(
      `[Job] No se pudo reabrir la fila fallida de ${channel} ${idempotencyKey}:`,
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}
