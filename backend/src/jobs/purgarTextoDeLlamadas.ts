import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/**
 * Días que se conserva el texto de una llamada: la transcripción, el resumen,
 * el informe de fin de llamada, el teléfono de quien llamó y los WhatsApp
 * recibidos. Es más largo que el del audio (RECORDING_RETENTION_DAYS, 30)
 * porque el negocio relee conversaciones durante más tiempo del que escucha
 * grabaciones, y es el plazo que publica la política de privacidad.
 *
 * RGPD: purgeOldRecordings solo borraba el fichero de audio. El texto íntegro
 * de la conversación y el número de quien llamó se quedaban en Postgres para
 * siempre.
 */
const DIAS_POR_DEFECTO = 90;
/** Por debajo de esto, el plazo es un error de configuración y no una política. */
const MINIMO_DE_DIAS = 1;

/**
 * Se lee en cada ejecución. Un 0, un negativo o un valor que no es un número
 * borraría de golpe el texto de todas las llamadas: mejor que el job falle y
 * se vea.
 */
function diasDeRetencion(): number {
  const configurado = process.env.CALL_TEXT_RETENTION_DAYS;
  const dias = Number(configurado || DIAS_POR_DEFECTO);
  if (!(dias >= MINIMO_DE_DIAS)) {
    throw new Error(
      `CALL_TEXT_RETENTION_DAYS no es un plazo válido: ${configurado}`
    );
  }
  return dias;
}

export type ResultadoDeLaPurgaDeTexto = {
  transcripciones: number;
  resumenes: number;
  telefonos: number;
  mensajes: number;
};

/**
 * Borra el texto de las llamadas que ya pasaron el plazo. La fila de la
 * llamada se conserva con lo que no identifica a nadie (fecha, duración,
 * coste, resultado, sentimiento y servicio pedido): el historial, la
 * analítica y la facturación siguen cuadrando.
 *
 * Cada paso filtra por lo que aún queda por borrar, así que repetir el job
 * no toca dos veces la misma fila y un paso que falle se reintenta en la
 * siguiente ejecución sin deshacer los anteriores.
 */
export async function purgarTextoDeLlamadasJob(): Promise<ResultadoDeLaPurgaDeTexto> {
  const dias = diasDeRetencion();
  const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const caducada = { startedAt: { lt: limite } };

  const transcripciones = await prisma.transcript.deleteMany({
    where: { call: { is: caducada } },
  });

  const resumenes = await prisma.call.updateMany({
    where: {
      ...caducada,
      OR: [
        { summary: { not: null } },
        { postCallReport: { not: Prisma.DbNull } },
      ],
    },
    data: { summary: null, postCallReport: Prisma.DbNull },
  });

  // El teléfono solo se borra de las llamadas que no dejaron cita ni recado.
  // Donde los hay, es el contacto de esa cita o de ese recado cuando no se
  // dictó otro (`booking.clientPhone ?? call.fromNumber`): borrarlo dejaría
  // al negocio sin forma de avisar a su cliente, y al cliente sin poder
  // cancelar por WhatsApp. Esos datos son la agenda del negocio y se
  // conservan lo que dure la cuenta, no lo que dure el registro de llamadas.
  const telefonos = await prisma.call.updateMany({
    where: {
      ...caducada,
      fromNumber: { not: null },
      booking: { is: null },
      leads: { none: {} },
    },
    data: { fromNumber: null },
  });

  // Entrantes de WhatsApp, de clientes y de dueños: la fila entera, porque
  // además del texto guarda el número y el payload íntegro del proveedor.
  // Las bajas viven aparte (WhatsappOptOut) y no se tocan.
  const mensajes = await prisma.inboundMessage.deleteMany({
    where: { receivedAt: { lt: limite } },
  });

  const resultado = {
    transcripciones: transcripciones.count,
    resumenes: resumenes.count,
    telefonos: telefonos.count,
    mensajes: mensajes.count,
  };
  console.log(
    `[Job] Purga de texto de llamadas: ${resultado.transcripciones} transcripciones, ${resultado.resumenes} resúmenes, ${resultado.telefonos} teléfonos y ${resultado.mensajes} WhatsApp recibidos (retención ${dias} días)`
  );
  return resultado;
}
