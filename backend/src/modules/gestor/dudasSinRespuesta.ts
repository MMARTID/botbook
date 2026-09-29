import type { CallEscalationReason, CallOutcome } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { formatearCita } from "../whatsapp/avisosNegocio.js";
import { normalizarDudas } from "../whatsapp/recados.js";
import { normalizar } from "./normalizar.js";

/**
 * Tool `dudas_sin_respuesta` del Gestor: «¿qué te han preguntado que no
 * supiste?». Es la mitad de lectura de «enseñar a la recepcionista»; la otra
 * es la acción `actualizar_informacion`. Dos fuentes:
 * - las dudas que la propia recepcionista apunta al colgar
 *   (`postCallReport.dudas_sin_respuesta`, informe de `informar_al_negocio`),
 *   agrupadas cuando se repiten, las más preguntadas primero;
 * - las llamadas que acabaron sin resolver (FRUSTRATED o ESCALATED), con el
 *   motivo, el servicio pedido, el recado y el resumen si lo hay (solo lo
 *   deja Retell: Telnyx no manda resumen de la llamada).
 */

const RESULTADO_SIN_RESOLVER: Partial<Record<CallOutcome, string>> = {
  FRUSTRATED: "sin resolver",
  ESCALATED: "derivada al negocio",
};

const MOTIVO: Record<CallEscalationReason, string | null> = {
  CLIENTE_LO_PIDIO: "el cliente pidió hablar con alguien del negocio",
  FALLO_TECNICO: "un fallo técnico de Alhabla",
  FUERA_DE_HORARIO: "fuera de horario",
  CONSULTA_COMPLEJA: "una consulta que la recepcionista no supo resolver",
  NO_APLICA: null,
};

const MAX_DUDAS = 15;
const MAX_LLAMADAS = 10;
const MAX_LLAMADAS_LEIDAS = 300;
const MAX_LARGO_DE_RESUMEN = 300;

/** «¿Aceptáis Bizum?» y «aceptais bizum» son la misma duda. */
function claveDeDuda(duda: string): string {
  return normalizar(duda.replace(/[¿?¡!.,;:«»"'()]/g, " "));
}

function objeto(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function recortar(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > MAX_LARGO_DE_RESUMEN
    ? `${limpio.slice(0, MAX_LARGO_DE_RESUMEN - 1)}…`
    : limpio;
}

export async function dudasSinRespuesta(
  businessId: string,
  params: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, timezone: true },
  });
  if (!business) {
    return { status: 404, body: { error: "Negocio no encontrado" } };
  }
  const diasPedidos = Number(params.dias);
  const dias = Number.isFinite(diasPedidos)
    ? Math.min(31, Math.max(1, Math.round(diasPedidos)))
    : 14;
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const llamadas = await prisma.call.findMany({
    where: {
      businessId: business.id,
      startedAt: { gte: desde },
      OR: [
        { postCallReportAt: { not: null } },
        { outcome: { in: ["FRUSTRATED", "ESCALATED"] } },
      ],
    },
    orderBy: { startedAt: "desc" },
    take: MAX_LLAMADAS_LEIDAS,
    select: {
      startedAt: true,
      voiceProvider: true,
      outcome: true,
      escalationReason: true,
      requestedService: true,
      summary: true,
      postCallReport: true,
    },
  });

  // Las llamadas vienen de la más reciente a la más antigua: la primera vez
  // que sale una duda es la última vez que se preguntó.
  const porClave = new Map<
    string,
    { pregunta: string; veces: number; ultimaVez: string }
  >();
  for (const llamada of llamadas) {
    const dudas = normalizarDudas(
      objeto(llamada.postCallReport).dudas_sin_respuesta
    );
    for (const duda of dudas) {
      const clave = claveDeDuda(duda);
      if (!clave) continue;
      const vista = porClave.get(clave);
      if (vista) {
        vista.veces += 1;
      } else {
        porClave.set(clave, {
          pregunta: duda,
          veces: 1,
          ultimaVez: formatearCita(llamada.startedAt, business.timezone),
        });
      }
    }
  }
  // sort es estable: a igualdad de veces se queda la más reciente delante.
  const dudas = [...porClave.values()]
    .sort((a, b) => b.veces - a.veces)
    .slice(0, MAX_DUDAS);

  const sinResolver = llamadas.filter(
    (l) => l.outcome !== null && RESULTADO_SIN_RESOLVER[l.outcome]
  );
  return {
    status: 200,
    body: {
      dias,
      dudas,
      llamadasSinResolver: {
        total: sinResolver.length,
        ultimas: sinResolver.slice(0, MAX_LLAMADAS).map((l) => {
          const informe = objeto(l.postCallReport);
          const recado = objeto(informe.recado);
          return {
            cuando: formatearCita(l.startedAt, business.timezone),
            canal: l.voiceProvider === "whatsapp" ? "WhatsApp" : "llamada",
            resultado: l.outcome ? RESULTADO_SIN_RESOLVER[l.outcome] : null,
            motivo: l.escalationReason ? MOTIVO[l.escalationReason] : null,
            servicioPedido: l.requestedService,
            recado: typeof recado.motivo === "string" ? recado.motivo : null,
            dudas: normalizarDudas(informe.dudas_sin_respuesta),
            resumen: l.summary ? recortar(l.summary) : null,
          };
        }),
      },
    },
  };
}
