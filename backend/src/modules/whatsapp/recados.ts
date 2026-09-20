import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { CallEscalationReason, CallOutcome } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import { enqueueEmailJob } from "../../lib/cloudTasks.js";
import { messageLeadEmail } from "../../lib/emailTemplates.js";
import { isValidE164Phone } from "../../lib/phone.js";
import { avisarRecado } from "./avisosNegocio.js";
import * as mensajes from "./mensajes.js";

/**
 * Informe final de la llamada (PLAN-CANAL-DUENO.md § 10): la tool
 * `informar_al_negocio` que la recepcionista llama en la post-conversación
 * de Telnyx. Hace tres cosas, en este orden:
 *
 * 1. Guarda el PRIMER informe en `Call.postCallReport` (reclamo atómico por
 *    `call_control_id`: Telnyx lo manda dos veces, a veces con contenido
 *    distinto — fase 0.5). Si el segundo trae recado y el primero no, el
 *    recado se añade; nada más se sobrescribe.
 * 2. Doble escritura con los insights: rellena `Call.outcome`,
 *    `escalationReason`, `toolFailureDetected` y `requestedService` SOLO si
 *    siguen a null (los insights nativos mandan mientras convivan) y deja en
 *    el log cualquier discrepancia, que es lo que hay que medir antes de
 *    retirar los insights.
 * 3. Un recado se convierte en un `Lead` tipo `message` y en el aviso #2 al
 *    dueño (WhatsApp con botones; email si no es posible).
 *
 * La tool responde siempre 200 con `{ success: true }`: un fallo aquí no
 * puede hacer que el assistant reintente y duplique nada.
 */

const RecadoSchema = z
  .object({
    nombre: z.string().trim().max(120).optional().nullable(),
    telefono: z.string().trim().max(40).optional().nullable(),
    motivo: z.string().trim().min(1).max(1000),
    quiere_que_le_llamen: z.boolean().optional().nullable(),
  })
  .passthrough();

export const InformeFinalSchema = z
  .object({
    resultado: z
      .enum([
        "RESOLVED",
        "FRUSTRATED",
        "NO_ANSWER",
        "ESCALATED",
        "LEAD_CAPTURED",
      ])
      .optional()
      .nullable(),
    motivo_escalada: z
      .enum([
        "CLIENTE_LO_PIDIO",
        "FALLO_TECNICO",
        "FUERA_DE_HORARIO",
        "CONSULTA_COMPLEJA",
        "NO_APLICA",
      ])
      .optional()
      .nullable(),
    fallo_de_tool: z.boolean().optional().nullable(),
    servicio_pedido: z.string().trim().max(200).optional().nullable(),
    // El LLM manda a veces `null`, `{}` o un recado sin motivo: todo eso es
    // «sin recado», no un informe inválido.
    recado: z
      .union([RecadoSchema, z.object({}).strict(), z.null()])
      .optional()
      .transform((value) =>
        value && "motivo" in value && value.motivo ? value : null
      ),
  })
  .passthrough();

export type InformeFinal = z.infer<typeof InformeFinalSchema>;

export interface RecadoNormalizado {
  nombre: string | null;
  telefono: string | null;
  motivo: string;
  quiereQueLeLlamen: boolean;
}

function limpiarTexto(
  value: string | null | undefined,
  max: number
): string | null {
  const limpio = (value ?? "").replace(/\s+/g, " ").trim();
  return limpio ? limpio.slice(0, max) : null;
}

/** Teléfono del recado en E.164 o null si no es utilizable. */
export function normalizarTelefonoDeRecado(
  value: string | null | undefined
): string | null {
  const bruto = (value ?? "").replace(/[\s().-]/g, "");
  if (!bruto) return null;
  const candidato = bruto.startsWith("+")
    ? bruto
    : bruto.startsWith("00")
      ? `+${bruto.slice(2)}`
      : /^[6789]\d{8}$/.test(bruto)
        ? `+34${bruto}`
        : bruto;
  return isValidE164Phone(candidato) ? candidato : null;
}

export function normalizarRecado(
  recado: NonNullable<InformeFinal["recado"]>
): RecadoNormalizado {
  return {
    nombre: limpiarTexto(recado.nombre, 80),
    telefono: normalizarTelefonoDeRecado(recado.telefono),
    motivo: limpiarTexto(recado.motivo, 600) ?? "",
    quiereQueLeLlamen: recado.quiere_que_le_llamen === true,
  };
}

interface NegocioDelInforme {
  id: string;
  name: string;
  timezone: string;
}

export interface ResultadoInforme {
  /** Qué pasó con el informe: guardado, ya había uno (con o sin recado nuevo). */
  outcome: "guardado" | "duplicado" | "duplicado-con-recado";
  leadId: string | null;
}

/**
 * Procesa el informe de la tool `informar_al_negocio`. Nunca lanza.
 */
export async function procesarInformeFinal(input: {
  business: NegocioDelInforme;
  callControlId: string;
  params: unknown;
}): Promise<ResultadoInforme> {
  const etiqueta = `informe de la llamada ${input.callControlId} (negocio ${input.business.id})`;
  try {
    return await procesarInformeFinalOLanzar(input, etiqueta);
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo procesar el ${etiqueta}: ${errorMessage(error)}`
    );
    return { outcome: "duplicado", leadId: null };
  }
}

async function procesarInformeFinalOLanzar(
  input: {
    business: NegocioDelInforme;
    callControlId: string;
    params: unknown;
  },
  etiqueta: string
): Promise<ResultadoInforme> {
  const { business, callControlId } = input;

  const parsed = InformeFinalSchema.safeParse(input.params ?? {});
  if (!parsed.success) {
    console.error(
      `[WhatsApp] ${etiqueta} con forma inesperada, se ignora: ${parsed.error.message}`
    );
    return { outcome: "duplicado", leadId: null };
  }
  const informe = parsed.data;
  const recado = informe.recado ? normalizarRecado(informe.recado) : null;
  const informeJson = {
    resultado: informe.resultado ?? null,
    motivo_escalada: informe.motivo_escalada ?? null,
    fallo_de_tool: informe.fallo_de_tool ?? null,
    servicio_pedido: limpiarTexto(informe.servicio_pedido, 200),
    recado: recado
      ? {
          nombre: recado.nombre,
          telefono: recado.telefono,
          motivo: recado.motivo,
          quiere_que_le_llamen: recado.quiereQueLeLlamen,
        }
      : null,
  } satisfies Prisma.InputJsonObject;

  // 1) Primer informe gana (reclamo atómico).
  const reclamado = await prisma.call.updateMany({
    where: {
      callId: callControlId,
      businessId: business.id,
      // `equals: DbNull` es el filtro de Prisma para «columna a NULL» en un
      // campo Json (un `null` a secas no compila).
      postCallReport: { equals: Prisma.DbNull },
    },
    data: { postCallReport: informeJson, postCallReportAt: new Date() },
  });

  if (reclamado.count === 0) {
    const existente = await prisma.call.findUnique({
      where: { callId: callControlId },
      select: { id: true, businessId: true, postCallReport: true },
    });
    if (!existente || existente.businessId !== business.id) {
      console.warn(
        `[WhatsApp] ${etiqueta}: la llamada no es de este negocio; se ignora`
      );
      return { outcome: "duplicado", leadId: null };
    }
    const previo = existente.postCallReport as { recado?: unknown } | null;
    if (!recado || (previo && previo.recado)) {
      console.log(
        `[WhatsApp] ${etiqueta}: segundo informe sin novedades, se ignora`
      );
      return { outcome: "duplicado", leadId: null };
    }
    // Segundo informe con recado que el primero no traía: se añade.
    await prisma.call.update({
      where: { id: existente.id },
      data: {
        postCallReport: {
          ...(previo ?? {}),
          recado: informeJson.recado,
        } as Prisma.InputJsonObject,
      },
    });
    const leadId = await crearLeadYAvisar({
      business,
      callRowId: existente.id,
      callControlId,
      recado,
    });
    return { outcome: "duplicado-con-recado", leadId };
  }

  const call = await prisma.call.findUnique({
    where: { callId: callControlId },
    select: {
      id: true,
      outcome: true,
      escalationReason: true,
      toolFailureDetected: true,
      requestedService: true,
    },
  });
  if (!call) {
    return { outcome: "guardado", leadId: null };
  }

  // 2) Doble escritura: solo los huecos; las discrepancias, al log.
  await dobleEscritura(call, informe, etiqueta);

  // 3) Recado ⇒ Lead + aviso #2.
  const leadId = recado
    ? await crearLeadYAvisar({
        business,
        callRowId: call.id,
        callControlId,
        recado,
      })
    : null;
  console.log(
    `[WhatsApp] ${etiqueta}: guardado (resultado ${informe.resultado ?? "—"}${recado ? ", con recado" : ""})`
  );
  return { outcome: "guardado", leadId };
}

async function dobleEscritura(
  call: {
    id: string;
    outcome: CallOutcome | null;
    escalationReason: CallEscalationReason | null;
    toolFailureDetected: boolean | null;
    requestedService: string | null;
  },
  informe: InformeFinal,
  etiqueta: string
): Promise<void> {
  const data: Prisma.CallUpdateInput = {};
  const discrepancias: string[] = [];

  if (informe.resultado) {
    if (call.outcome === null) data.outcome = informe.resultado;
    else if (call.outcome !== informe.resultado)
      discrepancias.push(
        `outcome insights=${call.outcome} informe=${informe.resultado}`
      );
  }
  if (informe.motivo_escalada) {
    if (call.escalationReason === null)
      data.escalationReason = informe.motivo_escalada;
    else if (call.escalationReason !== informe.motivo_escalada)
      discrepancias.push(
        `escalationReason insights=${call.escalationReason} informe=${informe.motivo_escalada}`
      );
  }
  if (typeof informe.fallo_de_tool === "boolean") {
    if (call.toolFailureDetected === null)
      data.toolFailureDetected = informe.fallo_de_tool;
    else if (call.toolFailureDetected !== informe.fallo_de_tool)
      discrepancias.push(
        `toolFailureDetected insights=${call.toolFailureDetected} informe=${informe.fallo_de_tool}`
      );
  }
  const servicio = limpiarTexto(informe.servicio_pedido, 200);
  if (servicio && call.requestedService === null)
    data.requestedService = servicio;

  if (discrepancias.length > 0) {
    // Es la medida de concordancia que decide cuándo retirar los insights.
    console.warn(
      `[WhatsApp] ${etiqueta}: discrepancia insights/informe — ${discrepancias.join("; ")}`
    );
  }
  if (Object.keys(data).length === 0) return;
  try {
    await prisma.call.update({ where: { id: call.id }, data });
  } catch (error) {
    console.error(
      `[WhatsApp] ${etiqueta}: no se pudo aplicar la doble escritura: ${errorMessage(error)}`
    );
  }
}

async function crearLeadYAvisar(input: {
  business: NegocioDelInforme;
  callRowId: string;
  callControlId: string;
  recado: RecadoNormalizado;
}): Promise<string | null> {
  const { business, recado } = input;
  let leadId: string;
  try {
    const lead = await prisma.lead.create({
      data: {
        callId: input.callRowId,
        type: "message",
        isLead: true,
        data: {
          clientName: recado.nombre,
          clientPhone: recado.telefono,
          motivo: recado.motivo,
          quiereQueLeLlamen: recado.quiereQueLeLlamen,
          callControlId: input.callControlId,
        },
      },
      select: { id: true },
    });
    leadId = lead.id;
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo guardar el recado de la llamada ${input.callControlId} (negocio ${business.id}): ${errorMessage(error)}`
    );
    return null;
  }

  await avisarRecado({
    businessId: business.id,
    businessName: business.name,
    leadId,
    clientName: recado.nombre,
    clientPhone: recado.telefono,
    motivo: recado.motivo,
    quiereQueLeLlamen: recado.quiereQueLeLlamen,
    email: () => emailDeRecado({ business, leadId, recado }),
  });
  return leadId;
}

/** Respaldo por email del aviso #2 (§ 12): al correo del negocio. */
async function emailDeRecado(input: {
  business: NegocioDelInforme;
  leadId: string;
  recado: RecadoNormalizado;
}): Promise<void> {
  const usuario = await prisma.user.findFirst({
    where: { businessId: input.business.id },
    select: { email: true },
    orderBy: { createdAt: "asc" },
  });
  if (!usuario?.email) {
    throw new Error("el negocio no tiene ningún correo");
  }
  const { subject, html } = messageLeadEmail({
    businessName: input.business.name,
    clientName: input.recado.nombre,
    clientPhone: input.recado.telefono,
    motivo: input.recado.motivo,
    quiereQueLeLlamen: input.recado.quiereQueLeLlamen,
    panelUrl: mensajes.panelUrl("/llamadas"),
  });
  await enqueueEmailJob(
    { fromAlias: "support", toAddress: usuario.email, subject, html },
    `recado-${input.leadId}`
  );
}
