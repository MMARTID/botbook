import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import { acquireLock, releaseLock } from "../../lib/bookingLock.js";
import {
  formatearCita,
  nombreDeServicios,
  describirServicio,
} from "../whatsapp/avisosNegocio.js";
import { ACCIONES_DE_CATALOGO } from "./accionesCatalogo.js";

/**
 * Acciones que el Gestor puede PROPONER y que solo el botón «Confirmar» del
 * dueño ejecuta (PLAN-CANAL-DUENO.md § 8, regla de oro). Cada tipo declara
 * su esquema de parámetros, cómo se comprueba contra el negocio al proponer
 * (que el recurso exista y sea suyo) y cómo se ejecuta al confirmar.
 * Este PR trae una sola: `resolver_pendiente`. Catálogo, citas, ausencias y
 * bloqueos llegan en los PRs 3 y 4 por este mismo registro.
 */

export const ACCION_CADUCA_MS = 24 * 60 * 60 * 1000;
const LOCK_ACCION_TTL_MS = 120_000;
const LOCK_ACCION_ESPERA_MS = 20_000;

export interface ContextoDeAccion {
  businessId: string;
  timezone: string;
}

export interface AccionDelGestor<P> {
  /** Entrada `unknown`: el esquema puede tener valores por defecto. */
  schema: z.ZodType<P, z.ZodTypeDef, unknown>;
  /** Comprueba el recurso y devuelve un texto corto para el log/la respuesta,
   * o un motivo de rechazo. */
  comprobar(
    ctx: ContextoDeAccion,
    params: P
  ): Promise<ResultadoDeComprobacion<P>>;
  ejecutar(
    ctx: ContextoDeAccion,
    params: P,
    meta: { inboundMessageId: string; accionId: string }
  ): Promise<ResultadoDeEjecucion>;
}

/** `parametros`, si vienen, son los normalizados (nombres resueltos a ids):
 * se guardan y son los que recibe `ejecutar`, para que el botón actúe sobre
 * el recurso descrito y no sobre otro con el mismo nombre 24 h después. */
export type ResultadoDeComprobacion<P> =
  | { ok: true; descripcion: string; parametros?: P }
  | { ok: false; motivo: string };

/** `mensaje` se lo lee el dueño por WhatsApp; `nota`, si viene, es lo que se
 * anota en la conversación de Telnyx para el Gestor (puede llevar ids). */
export type ResultadoDeEjecucion =
  | { ok: true; mensaje: string; nota?: string }
  | { ok: false; mensaje: string; nota?: string };

const ResolverPendienteParams = z
  .object({ pendienteId: z.string().min(1).max(64) })
  .strict();

async function citaPendiente(businessId: string, pendienteId: string) {
  return prisma.lead.findFirst({
    where: {
      id: pendienteId,
      type: "pending_booking",
      call: { businessId },
    },
    select: { id: true, resolvedAt: true, data: true },
  });
}

async function describirPendiente(
  data: Prisma.JsonValue,
  timezone: string
): Promise<string> {
  const d = (
    data && typeof data === "object" && !Array.isArray(data) ? data : {}
  ) as Record<string, unknown>;
  const cliente =
    typeof d.clientName === "string" && d.clientName.trim()
      ? d.clientName.trim()
      : "un cliente";
  const inicio =
    typeof d.startDateTime === "string" ? new Date(d.startDateTime) : null;
  const cuando =
    inicio && !Number.isNaN(inicio.getTime())
      ? ` del ${formatearCita(inicio, timezone)}`
      : "";
  const serviceIds = Array.isArray(d.serviceIds)
    ? d.serviceIds.filter((x): x is string => typeof x === "string")
    : [];
  const servicio = describirServicio(await nombreDeServicios(serviceIds), null);
  return `la cita pendiente de ${cliente}${cuando}${servicio !== "cita" ? ` (${servicio})` : ""}`;
}

const resolverPendiente: AccionDelGestor<
  z.infer<typeof ResolverPendienteParams>
> = {
  schema: ResolverPendienteParams,
  async comprobar(ctx, params) {
    const lead = await citaPendiente(ctx.businessId, params.pendienteId);
    if (!lead) {
      return {
        ok: false,
        motivo: "No existe esa cita pendiente en este negocio.",
      };
    }
    if (lead.resolvedAt) {
      return { ok: false, motivo: "Esa cita pendiente ya está resuelta." };
    }
    return {
      ok: true,
      descripcion: await describirPendiente(lead.data, ctx.timezone),
    };
  },
  async ejecutar(ctx, params, meta) {
    const lead = await citaPendiente(ctx.businessId, params.pendienteId);
    if (!lead) {
      return { ok: false, mensaje: "Esa cita pendiente ya no existe." };
    }
    if (lead.resolvedAt) {
      return { ok: false, mensaje: "Esa cita pendiente ya estaba resuelta." };
    }
    const descripcion = await describirPendiente(lead.data, ctx.timezone);
    // Mismo cierre que «La apunté yo» del aviso #3 (router.ts), con otra
    // firma para distinguirlo en el panel y en las métricas.
    const cerrada = await prisma.lead.updateMany({
      where: { id: lead.id, resolvedAt: null },
      data: {
        resolvedAt: new Date(),
        data: {
          ...((lead.data as Record<string, unknown> | null) ?? {}),
          resolvedBy: "owner_chat",
          resolvedFromInboundMessageId: meta.inboundMessageId,
          resolvedFromActionId: meta.accionId,
        },
      },
    });
    if (cerrada.count === 0) {
      return { ok: false, mensaje: "Esa cita pendiente ya estaba resuelta." };
    }
    console.log(
      `[Gestor] Acción ${meta.accionId}: ${descripcion} del negocio ${ctx.businessId} resuelta por el dueño (entrante ${meta.inboundMessageId})`
    );
    return { ok: true, mensaje: `Hecho: doy por resuelta ${descripcion}.` };
  },
};

export const ACCIONES_DEL_GESTOR: Record<string, AccionDelGestor<unknown>> = {
  resolver_pendiente: resolverPendiente as AccionDelGestor<unknown>,
  ...ACCIONES_DE_CATALOGO,
};

export function accionConocida(tipo: string): boolean {
  return Object.prototype.hasOwnProperty.call(ACCIONES_DEL_GESTOR, tipo);
}

export interface PropuestaRegistrada {
  ok: true;
  accionId: string;
  descripcion: string;
  expiresAt: Date;
}

export type ResultadoDePropuesta =
  PropuestaRegistrada | { ok: false; motivo: string };

/**
 * `proponer_accion`: valida tipo y parámetros, comprueba el recurso y guarda
 * la propuesta con 24 h de vida. Devuelve el motivo si no se puede proponer;
 * nunca lanza.
 */
export async function registrarPropuesta(input: {
  businessId: string;
  timezone: string;
  conversationId: string | null;
  inboundMessageId: string | null;
  tipo: unknown;
  parametros: unknown;
  resumen: unknown;
}): Promise<ResultadoDePropuesta> {
  const tipo = typeof input.tipo === "string" ? input.tipo.trim() : "";
  if (!accionConocida(tipo)) {
    return {
      ok: false,
      motivo: `No puedo proponer acciones de tipo "${tipo || "?"}". Solo: ${Object.keys(ACCIONES_DEL_GESTOR).join(", ")}.`,
    };
  }
  const accion = ACCIONES_DEL_GESTOR[tipo];
  const parsed = accion.schema.safeParse(input.parametros);
  if (!parsed.success) {
    return {
      ok: false,
      motivo: `Parámetros no válidos para ${tipo}: ${parsed.error.issues
        .map((i) =>
          i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
        )
        .join("; ")}.`,
    };
  }
  const resumen =
    typeof input.resumen === "string" ? input.resumen.trim().slice(0, 500) : "";
  if (!resumen) {
    return { ok: false, motivo: "Falta el resumen de lo que va a pasar." };
  }
  const ctx = { businessId: input.businessId, timezone: input.timezone };
  try {
    const comprobacion = await accion.comprobar(ctx, parsed.data);
    if (!comprobacion.ok) {
      return { ok: false, motivo: comprobacion.motivo };
    }
    const expiresAt = new Date(Date.now() + ACCION_CADUCA_MS);
    // «Una sola propuesta a la vez»: las anteriores sin decidir se cierran
    // como sustituidas, para que un botón viejo (p. ej. el horario que el
    // dueño corrigió en el mensaje siguiente) no ejecute una intención ya
    // corregida.
    const sustituidas = await prisma.ownerPendingAction.updateMany({
      where: {
        businessId: input.businessId,
        confirmedAt: null,
        rejectedAt: null,
      },
      data: { rejectedAt: new Date(), error: "sustituida por otra propuesta" },
    });
    if (sustituidas.count > 0) {
      console.log(
        `[Gestor] ${sustituidas.count} propuesta(s) anteriores del negocio ${input.businessId} cerradas al proponer ${tipo}`
      );
    }
    const fila = await prisma.ownerPendingAction.create({
      data: {
        businessId: input.businessId,
        conversationId: input.conversationId,
        inboundMessageId: input.inboundMessageId,
        tipo,
        parametros: (comprobacion.parametros ??
          parsed.data) as Prisma.InputJsonValue,
        resumen,
        expiresAt,
      },
      select: { id: true },
    });
    console.log(
      `[Gestor] Propuesta ${fila.id} (${tipo}) del negocio ${input.businessId}: ${comprobacion.descripcion}`
    );
    return {
      ok: true,
      accionId: fila.id,
      descripcion: comprobacion.descripcion,
      expiresAt,
    };
  } catch (error) {
    console.error(
      `[Gestor] No se pudo registrar la propuesta ${tipo} del negocio ${input.businessId}: ${errorMessage(error)}`
    );
    return {
      ok: false,
      motivo: "No he podido registrar la propuesta ahora mismo.",
    };
  }
}

export type ResultadoDeBoton =
  | { estado: "ejecutada"; mensaje: string; nota?: string }
  | { estado: "rechazada" }
  | { estado: "fallida"; mensaje: string; nota?: string }
  | { estado: "caducada" }
  | { estado: "ya_decidida" }
  | { estado: "no_encontrada" };

/**
 * Botón «Confirmar» / «Cancelar» sobre una propuesta. La propuesta tiene que
 * ser del negocio cuyo móvil pulsa (lo comprueba el enrutador con
 * `businessId`). El reclamo es atómico (`confirmedAt/rejectedAt` null en el
 * where): dos toques no ejecutan dos veces.
 */
export async function decidirPropuesta(input: {
  accionId: string;
  businessId: string;
  timezone: string;
  decision: "confirmar" | "cancelar";
  inboundMessageId: string;
}): Promise<ResultadoDeBoton> {
  const fila = await prisma.ownerPendingAction.findFirst({
    where: { id: input.accionId, businessId: input.businessId },
  });
  if (!fila) {
    return { estado: "no_encontrada" };
  }
  if (fila.confirmedAt || fila.rejectedAt) {
    return { estado: "ya_decidida" };
  }
  if (fila.expiresAt.getTime() < Date.now()) {
    return { estado: "caducada" };
  }
  const now = new Date();
  const reclamada = await prisma.ownerPendingAction.updateMany({
    where: { id: fila.id, confirmedAt: null, rejectedAt: null },
    data:
      input.decision === "confirmar"
        ? { confirmedAt: now }
        : { rejectedAt: now },
  });
  if (reclamada.count === 0) {
    return { estado: "ya_decidida" };
  }
  if (input.decision === "cancelar") {
    console.log(
      `[Gestor] Propuesta ${fila.id} (${fila.tipo}) del negocio ${input.businessId} rechazada por el dueño`
    );
    return { estado: "rechazada" };
  }

  const accion = ACCIONES_DEL_GESTOR[fila.tipo];
  const ctx = { businessId: input.businessId, timezone: input.timezone };
  // Una acción a la vez por negocio: dos «Confirmar» casi seguidos (dos
  // propuestas distintas) llegan en webhooks paralelos y las acciones de
  // horario son leer-modificar-escribir sobre el mismo JSON.
  const lockKey = `lock:gestor:accion:${input.businessId}`;
  const lockToken = await acquireLock(
    lockKey,
    LOCK_ACCION_TTL_MS,
    LOCK_ACCION_ESPERA_MS
  );
  if (!lockToken) {
    console.error(
      `[Gestor] La acción ${fila.id} (${fila.tipo}) del negocio ${input.businessId} no consiguió el lock en ${LOCK_ACCION_ESPERA_MS} ms`
    );
    await prisma.ownerPendingAction
      .update({ where: { id: fila.id }, data: { error: "sin lock" } })
      .catch(() => undefined);
    return {
      estado: "fallida",
      mensaje:
        "Estoy terminando otra acción tuya. Espera un momento y vuelve a pedírmelo.",
    };
  }
  try {
    if (!accion) {
      throw new Error(`tipo de acción desconocido: ${fila.tipo}`);
    }
    const parsed = accion.schema.safeParse(fila.parametros);
    if (!parsed.success) {
      throw new Error(
        `parámetros guardados no válidos: ${parsed.error.message}`
      );
    }
    const resultado = await accion.ejecutar(ctx, parsed.data, {
      inboundMessageId: input.inboundMessageId,
      accionId: fila.id,
    });
    // La acción ya está hecha: anotar el resultado es best-effort, un fallo
    // aquí no puede convertir un «hecho» en un «no he podido».
    await prisma.ownerPendingAction
      .update({
        where: { id: fila.id },
        data: {
          executedAt: new Date(),
          resultado: resultado as unknown as Prisma.InputJsonValue,
          error: resultado.ok ? null : resultado.mensaje,
        },
      })
      .catch((error: unknown) => {
        console.error(
          `[Gestor] La acción ${fila.id} (${fila.tipo}) del negocio ${input.businessId} se ejecutó pero no se pudo anotar el resultado: ${errorMessage(error)}`
        );
      });
    return resultado.ok
      ? {
          estado: "ejecutada",
          mensaje: resultado.mensaje,
          nota: resultado.nota,
        }
      : { estado: "fallida", mensaje: resultado.mensaje, nota: resultado.nota };
  } catch (error) {
    const motivo = errorMessage(error);
    console.error(
      `[Gestor] La acción ${fila.id} (${fila.tipo}) del negocio ${input.businessId} falló al ejecutarse: ${motivo}`
    );
    await prisma.ownerPendingAction
      .update({ where: { id: fila.id }, data: { error: motivo } })
      .catch(() => undefined);
    return {
      estado: "fallida",
      mensaje:
        "No he podido hacerlo ahora mismo. Inténtalo desde el panel o vuelve a pedírmelo en un rato.",
    };
  } finally {
    await releaseLock(lockKey, lockToken);
  }
}
