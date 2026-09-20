import type { WhatsappAudience } from "../../adapters/whatsapp/WhatsAppAdapter.js";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";

/**
 * Bajas de WhatsApp por número y audiencia (PLAN-CANAL-DUENO.md § 6.1). Un
 * STOP al número de clientes es global para ese móvil; un STOP al de
 * negocios deja además `ownerWhatsappOptOutAt` en cada negocio con ese
 * móvil (eso lo hace `altaDueno.ts`). La tabla la consultan TODOS los envíos
 * del servicio antes de salir: es la última capa antes del adaptador.
 */

/** Un envío se ha suprimido porque el destinatario pidió no recibir más. */
export class WhatsappOptOutError extends Error {
  readonly code = "WHATSAPP_OPT_OUT";

  constructor(audience: WhatsappAudience, phoneNumber: string) {
    super(
      `El número ${phoneNumber} pidió no recibir WhatsApp de Alhabla (número de ${audience})`
    );
    this.name = "WhatsappOptOutError";
  }
}

export interface BajaVigente {
  optedOutAt: Date;
  keyword: string;
}

/**
 * Baja vigente de un número en una audiencia (`revokedAt IS NULL`), o null.
 * Un fallo de la base de datos devuelve null con log: se prefiere arriesgar
 * un mensaje de más a dejar a un cliente sin su confirmación (misma regla
 * que `reclamarEnvio`).
 */
export async function bajaVigente(
  audience: WhatsappAudience,
  phoneNumber: string
): Promise<BajaVigente | null> {
  try {
    const row = await prisma.whatsappOptOut.findUnique({
      where: { phoneNumber_audience: { phoneNumber, audience } },
      select: { optedOutAt: true, keyword: true, revokedAt: true },
    });
    if (!row || row.revokedAt !== null) {
      return null;
    }
    return { optedOutAt: row.optedOutAt, keyword: row.keyword };
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo comprobar la baja de ${phoneNumber} en el número de ${audience}; se asume sin baja: ${errorMessage(error)}`
    );
    return null;
  }
}

export async function estaDadoDeBaja(
  audience: WhatsappAudience,
  phoneNumber: string
): Promise<boolean> {
  return (await bajaVigente(audience, phoneNumber)) !== null;
}

/**
 * Registra (o reactiva) la baja de un número. Una fila por (número,
 * audiencia): un STOP tras una revocación vuelve a poner `optedOutAt` a
 * ahora y borra `revokedAt`. Nunca se borra una fila.
 */
export async function registrarBaja(input: {
  phoneNumber: string;
  audience: WhatsappAudience;
  keyword: string;
  inboundMessageId: string;
  businessId?: string | null;
}): Promise<void> {
  const now = new Date();
  await prisma.whatsappOptOut.upsert({
    where: {
      phoneNumber_audience: {
        phoneNumber: input.phoneNumber,
        audience: input.audience,
      },
    },
    create: {
      phoneNumber: input.phoneNumber,
      audience: input.audience,
      optedOutAt: now,
      keyword: input.keyword,
      inboundMessageId: input.inboundMessageId,
      businessId: input.businessId ?? null,
    },
    update: {
      optedOutAt: now,
      keyword: input.keyword,
      inboundMessageId: input.inboundMessageId,
      businessId: input.businessId ?? null,
      revokedAt: null,
      revokedByMessageId: null,
    },
  });
}

/**
 * Revoca la baja vigente de un número (ALTA). Devuelve cuántas filas se
 * revocaron: 0 significa que no había baja.
 */
export async function revocarBaja(input: {
  phoneNumber: string;
  audience: WhatsappAudience;
  inboundMessageId: string;
}): Promise<number> {
  const result = await prisma.whatsappOptOut.updateMany({
    where: {
      phoneNumber: input.phoneNumber,
      audience: input.audience,
      revokedAt: null,
    },
    data: { revokedAt: new Date(), revokedByMessageId: input.inboundMessageId },
  });
  return result.count;
}
