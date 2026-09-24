import { prisma } from "../../lib/prisma.js";
import { getRedis } from "../../lib/redis.js";
import { errorMessage } from "../../lib/logUtils.js";

/**
 * A qué negocio le escribe un cliente por el número «Alhabla Reservas»
 * (auditoría del 24-09).
 *
 * El número de clientes es UNO para toda la plataforma, así que el mismo
 * móvil puede tener citas en dos negocios de Alhabla a la vez. Antes se
 * cogía la reserva más reciente de ese teléfono, sin filtrar por negocio: un
 * "¿puedo cambiar la cita del jueves?" podía acabar en la recepcionista del
 * negocio equivocado, que le enseñaría la agenda de otro. Los botones nunca
 * tuvieron este problema porque validan `context.id` contra `SentMessage`.
 *
 * Orden de preferencia, de más fiable a menos:
 *   1. El mensaje al que responde (`context.id`) — prueba exacta.
 *   2. Lo que el propio cliente eligió hace poco, si le preguntamos.
 *   3. La conversación en curso, si la hay y sigue siendo un negocio suyo.
 *   4. Sus reservas, solo si todas son del mismo negocio.
 * Y si después de eso siguen quedando varios, no se adivina: se pregunta.
 */

/** Cuánto dura la elección del cliente y la continuidad de la conversación. */
const VENTANA_DE_CONVERSACION_MS = 6 * 60 * 60 * 1000;
const TTL_ELECCION_SEGUNDOS = 6 * 60 * 60;

export type NegocioCandidato = { id: string; name: string };

export type ResolucionDeTenant =
  | { tipo: "unico"; businessId: string; via: "contexto" | "eleccion" | "conversacion" | "reservas" }
  | { tipo: "ambiguo"; candidatos: NegocioCandidato[] }
  | { tipo: "ninguno" };

function claveDeEleccion(fromNumber: string): string {
  return `wa:cliente:negocio:${fromNumber}`;
}

/** Negocios en los que ESE móvil tiene reservas. Es la lista con la que se
 * valida todo lo demás: nada que no salga de aquí se acepta. */
export async function negociosDelCliente(
  fromNumber: string
): Promise<NegocioCandidato[]> {
  const reservas = await prisma.booking.findMany({
    where: { OR: [{ clientPhone: fromNumber }, { call: { fromNumber } }] },
    select: {
      programedAt: true,
      call: { select: { business: { select: { id: true, name: true } } } },
    },
    orderBy: { programedAt: "desc" },
    take: 50,
  });
  const vistos = new Map<string, NegocioCandidato>();
  for (const reserva of reservas) {
    const negocio = reserva.call.business;
    if (negocio && !vistos.has(negocio.id)) vistos.set(negocio.id, negocio);
  }
  return [...vistos.values()];
}

async function leerEleccion(fromNumber: string): Promise<string | null> {
  try {
    return await getRedis().get(claveDeEleccion(fromNumber));
  } catch (error) {
    // Sin Redis se sigue: solo se pierde la continuidad, no la corrección.
    console.error(
      `[WhatsApp] No se pudo leer el negocio elegido por ${fromNumber}: ${errorMessage(error)}`
    );
    return null;
  }
}

export async function guardarEleccion(
  fromNumber: string,
  businessId: string
): Promise<void> {
  try {
    await getRedis().set(
      claveDeEleccion(fromNumber),
      businessId,
      "EX",
      TTL_ELECCION_SEGUNDOS
    );
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo guardar el negocio elegido por ${fromNumber}: ${errorMessage(error)}`
    );
  }
}

export async function resolverNegocioDelCliente(
  fromNumber: string,
  contextMessageId: string | null
): Promise<ResolucionDeTenant> {
  // 1. El envío al que responde. No hace falta cotejarlo con sus reservas:
  //    la fila dice a qué negocio pertenece el mensaje original y a qué móvil
  //    se mandó.
  if (contextMessageId) {
    const enviado = await prisma.sentMessage.findUnique({
      where: { providerMessageId: contextMessageId },
      select: { businessId: true, toNumber: true },
    });
    if (enviado?.businessId && enviado.toNumber === fromNumber) {
      return { tipo: "unico", businessId: enviado.businessId, via: "contexto" };
    }
  }

  const candidatos = await negociosDelCliente(fromNumber);
  if (candidatos.length === 0) return { tipo: "ninguno" };
  const esSuyo = (id: string) => candidatos.some((c) => c.id === id);

  // 2. Lo que eligió cuando se lo preguntamos. Se vuelve a validar contra sus
  //    reservas: una clave vieja no puede colarle un negocio que ya no es suyo.
  const elegido = await leerEleccion(fromNumber);
  if (elegido && esSuyo(elegido)) {
    return { tipo: "unico", businessId: elegido, via: "eleccion" };
  }

  // 3. Conversación en curso: se mantiene el mismo negocio mientras dure.
  if (candidatos.length > 1) {
    const ultimo = await prisma.inboundMessage.findFirst({
      where: {
        fromNumber,
        role: "client",
        businessId: { not: null },
        receivedAt: { gte: new Date(Date.now() - VENTANA_DE_CONVERSACION_MS) },
      },
      select: { businessId: true },
      orderBy: { receivedAt: "desc" },
    });
    if (ultimo?.businessId && esSuyo(ultimo.businessId)) {
      return { tipo: "unico", businessId: ultimo.businessId, via: "conversacion" };
    }
  }

  // 4. Sus reservas, solo si no hay duda posible.
  if (candidatos.length === 1) {
    return { tipo: "unico", businessId: candidatos[0]!.id, via: "reservas" };
  }
  return { tipo: "ambiguo", candidatos };
}
