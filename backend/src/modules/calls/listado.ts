import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { SIN_CALLS_DEL_GESTOR } from "../../lib/citasDelDueno.js";
import { inicioDelDiaEnZona } from "../../lib/voiceDateTime.js";

/** Un recado es el `Lead` tipo `message` que deja la recepcionista cuando
 * no puede resolver algo (modules/whatsapp/recados.ts). */
export const TIPO_RECADO = "message";

// `voiceProvider` de las filas Call sintéticas del chat de WhatsApp.
const CANAL_WHATSAPP = "whatsapp";

export const FILTROS_DE_LLAMADAS = [
  "todas",
  "con_cita",
  "por_devolver",
  "sin_cita",
] as const;
export type FiltroDeLlamadas = (typeof FILTROS_DE_LLAMADAS)[number];

const ORDENES = ["reciente", "antigua", "mas_larga", "mas_corta"] as const;

/**
 * Los filtros del historial. `filtro` es el resultado (los tres primeros
 * son las pestañas del móvil); el resto se combinan con él en el escritorio
 * y en la exportación a CSV, que filtra exactamente igual que la tabla.
 */
export const FiltrosDeLlamadasSchema = z.object({
  filtro: z.enum(FILTROS_DE_LLAMADAS).default("todas"),
  canal: z.enum(["voz", "whatsapp"]).optional(),
  sentimiento: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]).optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  q: z.string().trim().max(80).optional(),
  orden: z.enum(ORDENES).default("reciente"),
});

export type FiltrosDeLlamadas = z.infer<typeof FiltrosDeLlamadasSchema>;

/** Condición por resultado, sin el resto de filtros: es la que cuentan los
 * recuentos de las pestañas, que no cambian al buscar. */
export function condicionDeResultado(
  filtro: FiltroDeLlamadas
): Prisma.CallWhereInput | null {
  if (filtro === "con_cita") {
    // «Reserva creada» en el panel: la cita sigue viva. Una cambiada por el
    // cliente cuelga de la conversación en la que la cambió.
    return { booking: { is: { isCancelled: false } } };
  }
  if (filtro === "por_devolver") {
    return { leads: { some: { type: TIPO_RECADO, resolvedAt: null } } };
  }
  if (filtro === "sin_cita") {
    return {
      OR: [
        { booking: { is: null } },
        { booking: { is: { isCancelled: true } } },
      ],
    };
  }
  return null;
}

/** El historial de un negocio por resultado, sin las filas del Gestor. */
export function filtroDeLlamadas(
  businessId: string,
  filtro: FiltroDeLlamadas
): Prisma.CallWhereInput {
  const resultado = condicionDeResultado(filtro);
  return {
    businessId,
    AND: resultado ? [SIN_CALLS_DEL_GESTOR, resultado] : [SIN_CALLS_DEL_GESTOR],
  };
}

/**
 * La búsqueda de texto del historial: número (por dígitos, da igual cómo se
 * escriba), resumen, servicio pedido, nombre del cliente de la cita o
 * nombre de los servicios reservados. Devuelve null si no hay nada que
 * buscar (menos de 2 caracteres).
 */
export async function condicionDeBusqueda(
  businessId: string,
  q: string | undefined
): Promise<Prisma.CallWhereInput | null> {
  const texto = q?.trim() ?? "";
  if (texto.length < 2) return null;
  const digitos = texto.replace(/\D/g, "");
  const servicios = await prisma.service.findMany({
    where: { businessId, name: { contains: texto, mode: "insensitive" } },
    select: { id: true },
    take: 50,
  });
  const o: Prisma.CallWhereInput[] = [
    { summary: { contains: texto, mode: "insensitive" } },
    { requestedService: { contains: texto, mode: "insensitive" } },
    {
      booking: { is: { clientName: { contains: texto, mode: "insensitive" } } },
    },
  ];
  if (digitos.length >= 3) {
    o.push(
      { fromNumber: { contains: digitos } },
      { booking: { is: { clientPhone: { contains: digitos } } } }
    );
  }
  if (servicios.length > 0) {
    o.push({
      booking: {
        is: {
          serviceIds: { hasSome: servicios.map((servicio) => servicio.id) },
        },
      },
    });
  }
  return { OR: o };
}

export async function condicionesDelListado(
  businessId: string,
  filtros: FiltrosDeLlamadas
): Promise<Prisma.CallWhereInput> {
  const y: Prisma.CallWhereInput[] = [SIN_CALLS_DEL_GESTOR];
  const resultado = condicionDeResultado(filtros.filtro);
  if (resultado) y.push(resultado);
  if (filtros.canal === "whatsapp") y.push({ voiceProvider: CANAL_WHATSAPP });
  if (filtros.canal === "voz") {
    y.push({ voiceProvider: { not: CANAL_WHATSAPP } });
  }
  if (filtros.sentimiento) y.push({ sentiment: filtros.sentimiento });
  if (filtros.desde || filtros.hasta) {
    y.push({
      startedAt: {
        ...(filtros.desde ? { gte: filtros.desde } : {}),
        ...(filtros.hasta ? { lt: filtros.hasta } : {}),
      },
    });
  }
  const busqueda = await condicionDeBusqueda(businessId, filtros.q);
  if (busqueda) y.push(busqueda);
  return { businessId, AND: y };
}

export function ordenDelListado(
  orden: FiltrosDeLlamadas["orden"]
): Prisma.CallOrderByWithRelationInput[] {
  // El id desempata: con la misma fecha, sin él una fila podía salir en dos
  // páginas seguidas o en ninguna.
  if (orden === "antigua") return [{ createdAt: "asc" }, { id: "asc" }];
  if (orden === "mas_larga") {
    return [
      { durationSecs: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
      { id: "desc" },
    ];
  }
  if (orden === "mas_corta") {
    return [
      { durationSecs: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
      { id: "desc" },
    ];
  }
  return [{ createdAt: "desc" }, { id: "desc" }];
}

/**
 * «Hoy» en la cabecera del historial: conversaciones del día (en la zona del
 * negocio), cuántas acabaron con cita viva y la duración media de las
 * llamadas de voz (los chats no tienen duración).
 */
export async function resumenDeHoy(businessId: string) {
  const negocio = await prisma.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  });
  const timezone = negocio?.timezone || "Europe/Madrid";
  const desde = inicioDelDiaEnZona(timezone);
  const hoy: Prisma.CallWhereInput = {
    businessId,
    startedAt: { gte: desde },
    AND: [SIN_CALLS_DEL_GESTOR],
  };
  const [llamadas, conCita, voz] = await Promise.all([
    prisma.call.count({ where: hoy }),
    prisma.call.count({
      where: { ...hoy, booking: { is: { isCancelled: false } } },
    }),
    prisma.call.aggregate({
      where: {
        ...hoy,
        voiceProvider: { not: CANAL_WHATSAPP },
        durationSecs: { gt: 0 },
      },
      _avg: { durationSecs: true },
    }),
  ]);
  return {
    desde: desde.toISOString(),
    llamadas,
    conCita,
    duracionMediaSecs:
      voz._avg.durationSecs == null ? null : Math.round(voz._avg.durationSecs),
  };
}
