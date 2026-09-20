import { prisma } from "../../../src/lib/prisma.js";
import { invalidarCacheRemitentes } from "../../../src/modules/whatsapp/service.js";

export const CLIENTES = "+34930454394";
export const NEGOCIOS = "+34930453218";

let contadorDeEventos = 0;

/** Evento `whatsapp.messages` tal como lo entrega el webhook del WABA. */
export function eventoMensajes(input: {
  to: string;
  messages?: unknown[];
  statuses?: unknown[];
  id?: string;
  contactName?: string;
  waId?: string;
}) {
  contadorDeEventos += 1;
  return {
    data: {
      event_type: "whatsapp.messages",
      id: input.id ?? `evt-${contadorDeEventos}`,
      occurred_at: new Date().toISOString(),
      payload: {
        contacts: input.waId
          ? [
              {
                profile: { name: input.contactName ?? "Miki" },
                wa_id: input.waId,
              },
            ]
          : [],
        messages: input.messages ?? [],
        statuses: input.statuses ?? [],
        metadata: {
          display_phone_number: input.to.slice(1),
          phone_number_id: "1305416552659363",
        },
      },
    },
  };
}

let contadorDeMensajes = 0;

/** Un `messages[]` de texto de Meta, con id único. */
export function mensajeDeTexto(from: string, body: string, id?: string) {
  contadorDeMensajes += 1;
  return {
    id: id ?? `in-${contadorDeMensajes}`,
    from,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "text",
    text: { body },
  };
}

/** Respuesta a un botón de plantilla (formato `button` de Meta). */
export function mensajeDeBoton(
  from: string,
  input: { contextId?: string; text?: string; payload?: string; id?: string }
) {
  contadorDeMensajes += 1;
  return {
    id: input.id ?? `in-${contadorDeMensajes}`,
    from,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "button",
    button: {
      payload: input.payload ?? input.text ?? "Activar avisos",
      text: input.text ?? "Activar avisos",
    },
    ...(input.contextId
      ? { context: { from: NEGOCIOS.slice(1), id: input.contextId } }
      : {}),
  };
}

/** Los dos remitentes de Alhabla, como los deja el script de sincronización. */
export async function sembrarRemitentes(): Promise<void> {
  invalidarCacheRemitentes();
  await prisma.whatsappSender.createMany({
    data: [
      { audience: "client", phoneNumber: CLIENTES, status: "CONNECTED" },
      { audience: "owner", phoneNumber: NEGOCIOS, status: "CONNECTED" },
    ],
  });
}

export async function sembrarPlantillaBienvenida(
  status = "APPROVED"
): Promise<void> {
  await prisma.whatsappTemplate.create({
    data: {
      key: "bienvenida_negocio",
      name: "bienvenida_negocio",
      language: "es",
      telnyxTemplateId: "tpl-bienvenida",
      category: "UTILITY",
      status,
      lastSyncedAt: new Date(),
    },
  });
}

export async function entrantePorId(providerMessageId: string) {
  return prisma.inboundMessage.findUniqueOrThrow({
    where: { providerMessageId },
  });
}

export async function negocioPorId(id: string) {
  return prisma.business.findUniqueOrThrow({ where: { id } });
}
