import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { CallEscalationReason, CallOutcome } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import {
  enqueueEmailJob,
  enqueueRevisarEscaladaJob,
} from "../../lib/cloudTasks.js";
import { leerIntentoDeReservaFallido } from "../../lib/intentoDeReserva.js";
import { messageLeadEmail } from "../../lib/emailTemplates.js";
import { isValidE164Phone } from "../../lib/phone.js";
import { avisarRecado } from "./avisosNegocio.js";
import * as mensajes from "./mensajes.js";

/**
 * Informe final de la llamada (PLAN-CANAL-DUENO.md § 10): la tool
 * `informar_al_negocio` que la recepcionista llama en la post-conversación
 * de Telnyx. Hace tres cosas, en este orden:
 *
 * 1. Guarda el primer informe en `Call.postCallReport` (reclamo atómico por
 *    `call_control_id`) y cada informe siguiente lo completa
 *    (combinarInformes): el más reciente manda en resultado, motivo y
 *    servicio, las dudas se suman y el recado es el primero que llegó. Hay
 *    varios por llamada: Telnyx manda dos en la post-conversación (a veces
 *    con contenido distinto, fase 0.5) y la recepcionista llama a la tool a
 *    mitad de llamada pese al prompt (65 de 80 llamadas de prueba en dev, del
 *    03 al 07-10, sobre todo al dejar un recado). Antes ganaba el primero y
 *    el de la post-conversación, el que ha oído la llamada entera, se perdía.
 * 2. Doble escritura con los insights: rellena `Call.outcome`,
 *    `escalationReason`, `toolFailureDetected` y `requestedService` solo si
 *    siguen a null o tienen lo que puso un informe anterior (los insights
 *    nativos mandan mientras convivan) y deja en el log cualquier
 *    discrepancia, que es lo que hay que medir antes de retirar los insights.
 * 3. Un recado se convierte en un `Lead` tipo `message` y en el aviso #2 al
 *    dueño (WhatsApp con botones; email si no es posible), una sola vez por
 *    llamada.
 * 4. Una escalada por fallo técnico sin recado programa una revisión
 *    diferida (revisarEscaladaSinRecado): la recepcionista le dice al
 *    cliente que el negocio se pondrá en contacto, pero el recado solo se
 *    pide cuando el cliente lo deja explícitamente, así que el dueño no se
 *    enteraba (llamada de prueba del 2026-10-09, conversación d49f3400).
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
    // Preguntas que la recepcionista no supo responder por no tener esa
    // información: el Gestor se las enseña al dueño (`dudas_sin_respuesta`)
    // para que se la cuente. A veces llega una sola cadena en vez de lista.
    dudas_sin_respuesta: z
      .union([z.array(z.unknown()), z.string(), z.null()])
      .optional()
      .transform((value) => normalizarDudas(value)),
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

const MAX_DUDAS_POR_LLAMADA = 5;
const MAX_LARGO_DE_DUDA = 200;

/** Dudas del informe: una por línea si llega como cadena, sin vacías ni
 * repetidas, hasta 5 de 200 caracteres. */
export function normalizarDudas(value: unknown): string[] {
  const brutas = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split("\n")
      : [];
  const dudas: string[] = [];
  for (const bruta of brutas) {
    const duda =
      typeof bruta === "string" ? limpiarTexto(bruta, MAX_LARGO_DE_DUDA) : null;
    if (duda && !dudas.includes(duda)) dudas.push(duda);
    if (dudas.length === MAX_DUDAS_POR_LLAMADA) break;
  }
  return dudas;
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
  /** Qué pasó con el informe: el primero (guardado), uno que completa al
   * anterior (actualizado, o duplicado-con-recado si trae el primer recado)
   * o uno que no añade nada (duplicado). */
  outcome: "guardado" | "actualizado" | "duplicado" | "duplicado-con-recado";
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
    dudas_sin_respuesta: informe.dudas_sin_respuesta,
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
    return completarInforme({
      business,
      callControlId,
      informe,
      informeJson,
      recado,
      etiqueta,
    });
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
  if (informe.motivo_escalada === "FALLO_TECNICO" && !recado) {
    await programarRevisionDeEscalada(call.id, etiqueta);
  }
  console.log(
    `[WhatsApp] ${etiqueta}: guardado (resultado ${informe.resultado ?? "—"}${recado ? ", con recado" : ""})`
  );
  return { outcome: "guardado", leadId };
}

/** Lo que guarda `Call.postCallReport` (la forma de `informeJson`). */
type InformeGuardado = {
  resultado: InformeFinal["resultado"] | null;
  motivo_escalada: InformeFinal["motivo_escalada"] | null;
  fallo_de_tool: boolean | null;
  servicio_pedido: string | null;
  recado: {
    nombre: string | null;
    telefono: string | null;
    motivo: string;
    quiere_que_le_llamen: boolean;
  } | null;
  dudas_sin_respuesta: string[];
};

/** Lee un `postCallReport` guardado; lo que no tenga forma conocida, vacío. */
function leerInformeGuardado(valor: unknown): InformeGuardado {
  const bruto =
    valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  const parsed = InformeFinalSchema.safeParse({
    resultado: bruto.resultado ?? null,
    motivo_escalada: bruto.motivo_escalada ?? null,
    fallo_de_tool: bruto.fallo_de_tool ?? null,
    servicio_pedido: bruto.servicio_pedido ?? null,
    dudas_sin_respuesta: bruto.dudas_sin_respuesta ?? null,
  });
  const recado = bruto.recado as InformeGuardado["recado"] | undefined;
  return {
    resultado: parsed.success ? (parsed.data.resultado ?? null) : null,
    motivo_escalada: parsed.success
      ? (parsed.data.motivo_escalada ?? null)
      : null,
    fallo_de_tool: parsed.success ? (parsed.data.fallo_de_tool ?? null) : null,
    servicio_pedido: parsed.success
      ? limpiarTexto(parsed.data.servicio_pedido, 200)
      : null,
    recado: recado && typeof recado === "object" && recado.motivo ? recado : null,
    dudas_sin_respuesta: normalizarDudas(bruto.dudas_sin_respuesta),
  };
}

/**
 * Un informe posterior completa al anterior: ha oído más llamada. Manda en
 * resultado, motivo de escalada y servicio (si los trae); un fallo de tool
 * que avisó cualquiera de los dos se queda; las dudas se suman (hasta 5) y
 * el recado es el primero que llegó, porque con él ya se creó el lead y se
 * avisó al dueño, con lo que le faltaba relleno por el posterior. En las
 * llamadas de prueba del 07-10 la recepcionista mandaba el recado en cuanto
 * tenía nombre y motivo y, tras confirmar el teléfono, otro informe con él:
 * el teléfono se perdía.
 */
export function combinarInformes(
  previo: InformeGuardado,
  nuevo: InformeGuardado
): InformeGuardado {
  return {
    resultado: nuevo.resultado ?? previo.resultado,
    motivo_escalada: nuevo.motivo_escalada ?? previo.motivo_escalada,
    fallo_de_tool:
      previo.fallo_de_tool === true || nuevo.fallo_de_tool === true
        ? true
        : (nuevo.fallo_de_tool ?? previo.fallo_de_tool),
    servicio_pedido: nuevo.servicio_pedido ?? previo.servicio_pedido,
    recado:
      previo.recado && nuevo.recado
        ? {
            nombre: previo.recado.nombre ?? nuevo.recado.nombre,
            telefono: previo.recado.telefono ?? nuevo.recado.telefono,
            motivo: previo.recado.motivo,
            quiere_que_le_llamen:
              previo.recado.quiere_que_le_llamen ||
              nuevo.recado.quiere_que_le_llamen,
          }
        : (previo.recado ?? nuevo.recado),
    dudas_sin_respuesta: normalizarDudas([
      ...previo.dudas_sin_respuesta,
      ...nuevo.dudas_sin_respuesta,
    ]),
  };
}

const INTENTOS_DE_COMBINAR = 3;

/**
 * Informe de una llamada que ya tenía uno: lo combina con el guardado. La
 * escritura solo vale si nadie escribió entre medias (misma
 * `postCallReportAt`): los dos de la post-conversación llegan casi a la
 * vez, y así cada uno combina sobre el otro y el recado crea un solo lead.
 */
async function completarInforme(input: {
  business: NegocioDelInforme;
  callControlId: string;
  informe: InformeFinal;
  informeJson: InformeGuardado;
  recado: RecadoNormalizado | null;
  etiqueta: string;
}): Promise<ResultadoInforme> {
  const { business, callControlId, etiqueta } = input;
  for (let intento = 1; intento <= INTENTOS_DE_COMBINAR; intento++) {
    const existente = await prisma.call.findUnique({
      where: { callId: callControlId },
      select: {
        id: true,
        businessId: true,
        postCallReport: true,
        postCallReportAt: true,
        outcome: true,
        escalationReason: true,
        toolFailureDetected: true,
        requestedService: true,
      },
    });
    if (!existente || existente.businessId !== business.id) {
      console.warn(
        `[WhatsApp] ${etiqueta}: la llamada no es de este negocio; se ignora`
      );
      return { outcome: "duplicado", leadId: null };
    }
    const previo = leerInformeGuardado(existente.postCallReport);
    const combinado = combinarInformes(previo, input.informeJson);
    if (JSON.stringify(combinado) === JSON.stringify(previo)) {
      console.log(`[WhatsApp] ${etiqueta}: informe sin novedades, se ignora`);
      return { outcome: "duplicado", leadId: null };
    }
    const escrito = await prisma.call.updateMany({
      where: { id: existente.id, postCallReportAt: existente.postCallReportAt },
      data: {
        postCallReport: combinado as Prisma.InputJsonObject,
        postCallReportAt: new Date(),
      },
    });
    if (escrito.count === 0) continue;

    await dobleEscritura(existente, input.informe, etiqueta, previo);
    if (
      previo.recado &&
      combinado.recado &&
      JSON.stringify(combinado.recado) !== JSON.stringify(previo.recado)
    ) {
      await completarLeadDelRecado({
        callRowId: existente.id,
        recado: combinado.recado,
        etiqueta,
      });
    }
    if (combinado.motivo_escalada === "FALLO_TECNICO" && !combinado.recado) {
      await programarRevisionDeEscalada(existente.id, etiqueta);
    }
    const recadoNuevo = previo.recado ? null : input.recado;
    if (!recadoNuevo) {
      console.log(
        `[WhatsApp] ${etiqueta}: completa el informe anterior (resultado ${combinado.resultado ?? "—"}, ${combinado.dudas_sin_respuesta.length} dudas)`
      );
      return { outcome: "actualizado", leadId: null };
    }
    const leadId = await crearLeadYAvisar({
      business,
      callRowId: existente.id,
      callControlId,
      recado: recadoNuevo,
    });
    return { outcome: "duplicado-con-recado", leadId };
  }
  console.error(
    `[WhatsApp] ${etiqueta}: no se pudo combinar con el informe anterior tras ${INTENTOS_DE_COMBINAR} intentos (otros informes escribiendo a la vez); se pierde este`
  );
  return { outcome: "duplicado", leadId: null };
}

/**
 * `previo`: el informe que había antes de este. Lo que puso él en la
 * llamada lo puede corregir este (ha oído más); lo que no coincide con él lo
 * escribieron los insights y no se toca.
 */
async function dobleEscritura(
  call: {
    id: string;
    outcome: CallOutcome | null;
    escalationReason: CallEscalationReason | null;
    toolFailureDetected: boolean | null;
    requestedService: string | null;
  },
  informe: InformeFinal,
  etiqueta: string,
  previo?: InformeGuardado
): Promise<void> {
  const data: Prisma.CallUpdateInput = {};
  const discrepancias: string[] = [];
  // ¿Lo puede escribir este informe? Si está vacío o lo puso el anterior.
  const libre = <T>(actual: T | null, delInformeAnterior: T | null | undefined) =>
    actual === null || (previo !== undefined && actual === delInformeAnterior);

  if (informe.resultado) {
    if (libre(call.outcome, previo?.resultado)) {
      if (call.outcome !== informe.resultado) data.outcome = informe.resultado;
    } else if (call.outcome !== informe.resultado)
      discrepancias.push(
        `outcome insights=${call.outcome} informe=${informe.resultado}`
      );
  }
  if (informe.motivo_escalada) {
    if (libre(call.escalationReason, previo?.motivo_escalada)) {
      if (call.escalationReason !== informe.motivo_escalada)
        data.escalationReason = informe.motivo_escalada;
    } else if (call.escalationReason !== informe.motivo_escalada)
      discrepancias.push(
        `escalationReason insights=${call.escalationReason} informe=${informe.motivo_escalada}`
      );
  }
  if (typeof informe.fallo_de_tool === "boolean") {
    // Un fallo que avisó un informe anterior no lo borra uno posterior.
    const fallo = informe.fallo_de_tool || previo?.fallo_de_tool === true;
    if (libre(call.toolFailureDetected, previo?.fallo_de_tool)) {
      if (call.toolFailureDetected !== fallo) data.toolFailureDetected = fallo;
    } else if (call.toolFailureDetected !== fallo)
      discrepancias.push(
        `toolFailureDetected insights=${call.toolFailureDetected} informe=${fallo}`
      );
  }
  const servicio = limpiarTexto(informe.servicio_pedido, 200);
  if (
    servicio &&
    libre(call.requestedService, previo?.servicio_pedido) &&
    call.requestedService !== servicio
  )
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

/**
 * El recado ganó datos en un informe posterior (el teléfono confirmado, el
 * nombre): se pasan al lead que se creó con el primero, para que el panel y
 * el Gestor los tengan. El aviso al dueño ya salió y no se repite.
 * Best-effort: si falla, el informe ya está guardado y el log lo dice.
 */
async function completarLeadDelRecado(input: {
  callRowId: string;
  recado: NonNullable<InformeGuardado["recado"]>;
  etiqueta: string;
}): Promise<void> {
  try {
    const lead = await prisma.lead.findFirst({
      where: { callId: input.callRowId, type: "message" },
      select: { id: true, data: true },
      orderBy: { createdAt: "asc" },
    });
    if (!lead) return;
    const previo =
      lead.data && typeof lead.data === "object"
        ? (lead.data as Record<string, unknown>)
        : {};
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        data: {
          ...previo,
          clientName: input.recado.nombre,
          clientPhone: input.recado.telefono,
          quiereQueLeLlamen: input.recado.quiere_que_le_llamen,
        } as Prisma.InputJsonObject,
      },
    });
    console.log(
      `[WhatsApp] ${input.etiqueta}: el recado gana datos de un informe posterior (lead ${lead.id})`
    );
  } catch (error) {
    console.error(
      `[WhatsApp] ${input.etiqueta}: no se pudo completar el lead del recado (llamada ${input.callRowId}): ${errorMessage(error)}`
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

/** Espera antes de revisar una escalada: el informe de la post-conversación
 * llega segundos después de colgar, y es el que dice cómo acabó. */
export const ESPERA_REVISION_ESCALADA_MS = 2 * 60_000;
/** Revisiones como mucho mientras la llamada siga en curso (~16 min; la
 * recepcionista cuelga a los 10). Después se revisa igualmente. */
export const MAX_REVISIONES_ESCALADA = 8;

async function programarRevisionDeEscalada(
  callRowId: string,
  etiqueta: string,
  intento = 1
): Promise<void> {
  try {
    await enqueueRevisarEscaladaJob(
      { callId: callRowId, intento },
      new Date(Date.now() + ESPERA_REVISION_ESCALADA_MS)
    );
  } catch (error) {
    console.error(
      `[WhatsApp] ${etiqueta}: escalada por fallo técnico sin recado y NO se pudo programar su revisión (llamada ${callRowId}, revisión ${intento}): el dueño no recibirá aviso. ${errorMessage(error)}`
    );
  }
}

/** «el jueves 15 de octubre a las 09:00» en la zona del negocio. */
function describirCita(instante: string, timeZone: string): string | null {
  const fecha = new Date(instante);
  if (Number.isNaN(fecha.getTime())) return null;
  try {
    const dia = new Intl.DateTimeFormat("es-ES", {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(fecha);
    const hora = new Intl.DateTimeFormat("es-ES", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(fecha);
    return `el ${dia.replace(",", "")} a las ${hora}`;
  } catch {
    return null;
  }
}

/** Motivo del recado que se crea por una escalada técnica sin recado. */
export function motivoDeEscaladaTecnica(input: {
  servicio: string | null;
  cita: string | null;
}): string {
  const que = input.servicio ? `reservar ${input.servicio}` : "reservar una cita";
  return input.cita
    ? `Quería ${que} ${input.cita} y la reserva no se pudo completar por un fallo técnico. La recepcionista escaló la llamada al negocio: hay que llamarle para cerrarla.`
    : `La recepcionista no pudo completar su gestión${input.servicio ? ` (${input.servicio})` : ""} por un fallo técnico y escaló la llamada al negocio: hay que llamarle.`;
}

/**
 * Revisión diferida de una escalada por fallo técnico. Con la llamada ya
 * terminada, si el informe final sigue siendo FALLO_TECNICO, no trae recado
 * y la llamada no acabó con cita, crea el recado que la recepcionista no
 * dejó (nombre y hora del último book_appointment fallido, teléfono de la
 * llamada) y avisa al dueño. El recado se guarda primero en el informe, con
 * la misma marca de tiempo que leyó (como completarInforme): una revisión
 * repetida (Cloud Tasks entrega al menos una vez) lo encuentra y no avisa
 * dos veces. Lanza si falla antes de avisar, para que Cloud Tasks la
 * reintente: repetirla es seguro por lo mismo.
 */
export async function revisarEscaladaSinRecado(
  callRowId: string,
  intento = 1
): Promise<void> {
  const etiqueta = `revisión de la escalada de la llamada ${callRowId}`;
  try {
    const call = await prisma.call.findUnique({
      where: { id: callRowId },
      select: {
        id: true,
        callId: true,
        status: true,
        fromNumber: true,
        postCallReport: true,
        postCallReportAt: true,
        business: { select: { id: true, name: true, timezone: true } },
      },
    });
    if (!call) {
      console.warn(`[WhatsApp] ${etiqueta}: la llamada no existe; se ignora`);
      return;
    }
    const enCurso = call.status === "INITIATED" || call.status === "IN_PROGRESS";
    if (enCurso && intento < MAX_REVISIONES_ESCALADA) {
      await programarRevisionDeEscalada(call.id, etiqueta, intento + 1);
      return;
    }
    const informe = leerInformeGuardado(call.postCallReport);
    if (informe.motivo_escalada !== "FALLO_TECNICO" || informe.recado) {
      console.log(
        `[WhatsApp] ${etiqueta}: nada que hacer (motivo ${informe.motivo_escalada ?? "—"}${informe.recado ? ", ya con recado" : ""})`
      );
      return;
    }
    const [cita, recadoPrevio] = await Promise.all([
      prisma.booking.findFirst({
        where: { callId: call.id, isCancelled: false },
        select: { id: true },
      }),
      prisma.lead.findFirst({
        where: { callId: call.id, type: "message" },
        select: { id: true },
      }),
    ]);
    if (cita || recadoPrevio) {
      console.log(
        `[WhatsApp] ${etiqueta}: la llamada acabó con ${cita ? "cita" : "recado"}; no hace falta avisar`
      );
      return;
    }

    const timezone = call.business.timezone || "Europe/Madrid";
    const fallido = await leerIntentoDeReservaFallido(call.callId);
    const recado: RecadoNormalizado = {
      nombre: limpiarTexto(fallido?.clientName, 80),
      telefono: normalizarTelefonoDeRecado(call.fromNumber),
      motivo: motivoDeEscaladaTecnica({
        servicio: informe.servicio_pedido,
        cita: fallido?.startDateTime
          ? describirCita(fallido.startDateTime, timezone)
          : null,
      }),
      quiereQueLeLlamen: true,
    };
    const escrito = await prisma.call.updateMany({
      where: { id: call.id, postCallReportAt: call.postCallReportAt },
      data: {
        postCallReport: {
          ...informe,
          recado: {
            nombre: recado.nombre,
            telefono: recado.telefono,
            motivo: recado.motivo,
            quiere_que_le_llamen: true,
          },
        } as Prisma.InputJsonObject,
        postCallReportAt: new Date(),
      },
    });
    if (escrito.count === 0) {
      // Otro informe (o esta misma revisión, repetida) escribió entre medias:
      // se vuelve a revisar con lo que haya ahora.
      await programarRevisionDeEscalada(call.id, etiqueta, intento + 1);
      return;
    }
    console.warn(
      `[WhatsApp] ${etiqueta} (negocio ${call.business.id}): escaló por fallo técnico sin recado; se crea uno para el dueño (intento de reserva ${fallido ? `con code ${fallido.code ?? "—"}` : "no registrado"}, teléfono ${recado.telefono ? "sí" : "no"})`
    );
    await crearLeadYAvisar({
      business: { id: call.business.id, name: call.business.name, timezone },
      callRowId: call.id,
      callControlId: call.callId,
      recado,
    });
  } catch (error) {
    console.error(
      `[WhatsApp] ${etiqueta}: falló (se reintentará); el dueño aún no tiene aviso de esta escalada. ${errorMessage(error)}`
    );
    throw error;
  }
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

/**
 * Tipos de lead que el dueño atiende con los botones de un recado
 * («Atendido» · «Recuérdamelo mañana»). El rechazo de un cambio de cita
 * («No me va bien») se avisa con los mismos botones: si el router y el job
 * solo aceptaban `message`, esos botones no hacían nada.
 */
export const TIPOS_DE_LEAD_DE_RECADO = ["message", "client_change_rejected"];
