import type { InboundMessage } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { nombreParaElCliente } from "../../lib/nombreProfesional.js";
import { errorMessage } from "../../lib/logUtils.js";
import { reclamarEnvio } from "../../lib/messageIdempotency.js";
import { enviarContacto } from "./service.js";
import { avisarRecado, formatearCita } from "./avisosNegocio.js";
import {
  esErrorDeBaja,
  normalizarTitulo,
  responder,
  resultado,
  type ResultadoEnrutado,
} from "./respuestas.js";
import {
  nombreParaCliente,
  numeroDeClientes,
  programarMensajesAlCliente,
  sanearNombre,
  TARJETA_ALHABLA_RESERVAS,
  telefonoDeContacto,
} from "./mensajesCliente.js";
import {
  avisarAQuienEsperaba,
  cerrarAviso,
  reservaDelLeadCancelada,
  reservarDesdeListaDeEspera,
} from "./listaDeEspera.js";
import { cancelarReserva } from "../bookings/cancelacion.js";
import * as mensajes from "./mensajes.js";
import { conversarConRecepcionista } from "./chatCliente.js";

/**
 * Botones que pulsa el CLIENTE en el número «Alhabla Reservas» (PLAN-CANAL-
 * DUENO.md § 5, PR 4): «Guardar contacto» (confirmación), «Confirmo» ·
 * «Cancelar» · «Cambiar» (recordatorio), «Sí, resérvala» · «Ya no» (hueco
 * libre) y, reservados para la fase 2, «Vale» · «No me va bien».
 *
 * Reglas: nada se adivina sin `context.id`; el negocio sale SIEMPRE de la
 * fila `SentMessage` del envío original, nunca del payload; doble prueba de
 * identidad (el envío fue a ese móvil Y la reserva/lead es de ese teléfono);
 * la acción se valida contra el tipo del envío; cada efecto es un
 * `updateMany` condicional o un envío reclamado por clave (idempotente ante
 * toques repetidos y reintentos). Las acciones de BD se ejecutan antes de
 * responder y aunque la respuesta se silencie o suprima.
 */

type TipoDeEnvio =
  "confirmacion" | "recordatorio" | "hueco" | "cambio" | "cancelacion";

export type AccionDeCliente =
  | "guardar_contacto"
  | "confirmo"
  | "cancelar"
  | "cambiar"
  | "reservar"
  | "ya_no"
  | "vale"
  | "no_me_va_bien";

export interface BotonDeCliente {
  tipo: TipoDeEnvio;
  recursoId: string;
  accion: AccionDeCliente;
  businessId: string;
  enviadoId: string;
}

const TIPOS_DE_ENVIO: readonly string[] = [
  "confirmacion",
  "recordatorio",
  "hueco",
  "cambio",
  "cancelacion",
];

const ACCIONES_POR_TIPO: Record<TipoDeEnvio, readonly AccionDeCliente[]> = {
  confirmacion: ["guardar_contacto"],
  recordatorio: ["confirmo", "cancelar", "cambiar"],
  hueco: ["reservar", "ya_no"],
  cambio: ["vale", "no_me_va_bien"],
  cancelacion: ["vale"],
};

/** Acción por el título del botón de plantilla (lista cerrada). */
export function accionPorTituloCliente(titulo: string): AccionDeCliente | null {
  switch (
    normalizarTitulo(titulo)
      .replace(/[,.!¡¿?]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  ) {
    case "GUARDAR CONTACTO":
      return "guardar_contacto";
    case "CONFIRMO":
      return "confirmo";
    case "CANCELAR":
      return "cancelar";
    case "CAMBIAR":
      return "cambiar";
    case "SI RESERVALA":
      return "reservar";
    case "YA NO":
      return "ya_no";
    case "VALE":
      return "vale";
    case "NO ME VA BIEN":
      return "no_me_va_bien";
    default:
      return null;
  }
}

const ACCIONES: readonly string[] = [
  "guardar_contacto",
  "confirmo",
  "cancelar",
  "cambiar",
  "reservar",
  "ya_no",
  "vale",
  "no_me_va_bien",
];

/**
 * Correlaciona el botón con el envío original y valida acción y tipo.
 * Devuelve el botón resuelto o el motivo del rechazo (que va al handler).
 */
export async function resolverBotonDeCliente(
  message: InboundMessage
): Promise<BotonDeCliente | { rechazo: string }> {
  const from = message.fromNumber;
  if (!message.contextMessageId) {
    return { rechazo: "sin-contexto" };
  }
  const enviado = await prisma.sentMessage.findUnique({
    where: { providerMessageId: message.contextMessageId },
    select: {
      id: true,
      businessId: true,
      audience: true,
      toNumber: true,
      callbackData: true,
    },
  });
  if (!enviado) {
    console.warn(
      `[WhatsApp] Botón de cliente desde ${from} responde al mensaje ${message.contextMessageId}, que no tiene fila en sent_messages; se ignora`
    );
    return { rechazo: "sin-fila" };
  }
  if (enviado.audience !== "client" || enviado.toNumber !== from) {
    console.warn(
      // Sin `enviado.toNumber`: no se juntan en una línea el móvil del
      // tercero y el del destinatario legítimo; el id de la fila basta.
      `[WhatsApp] Botón de cliente desde ${from} para el envío ${enviado.id} (${enviado.audience ?? "?"}, negocio ${enviado.businessId ?? "—"}) que no fue a ese número; se ignora`
    );
    return { rechazo: "remitente-distinto" };
  }
  const partes = (enviado.callbackData ?? "").split(":");
  if (
    partes[0] !== "cliente" ||
    !TIPOS_DE_ENVIO.includes(partes[1]) ||
    partes.length < 3
  ) {
    return { rechazo: "sin-callback" };
  }
  const tipo = partes[1] as TipoDeEnvio;
  const recursoId = partes.slice(2).join(":");
  if (!recursoId) {
    return { rechazo: "sin-callback" };
  }
  if (!enviado.businessId) {
    return { rechazo: "sin-negocio" };
  }

  let accion: AccionDeCliente | null;
  const partesId = (message.buttonId ?? "").split(":");
  if (partesId[0] === "cliente" && partesId.length >= 4) {
    const accionId = partesId[partesId.length - 1];
    const recursoDelId = partesId.slice(2, -1).join(":");
    if (partesId[1] !== tipo || recursoDelId !== recursoId) {
      return { rechazo: "recurso-distinto" };
    }
    accion = ACCIONES.includes(accionId) ? (accionId as AccionDeCliente) : null;
    if (!accion) {
      return { rechazo: "titulo-desconocido" };
    }
  } else {
    accion = accionPorTituloCliente(
      message.buttonTitle ?? message.buttonId ?? ""
    );
    if (!accion) {
      return { rechazo: "titulo-desconocido" };
    }
  }
  if (!ACCIONES_POR_TIPO[tipo].includes(accion)) {
    return { rechazo: "accion-no-permitida" };
  }
  return {
    tipo,
    recursoId,
    accion,
    businessId: enviado.businessId,
    enviadoId: enviado.id,
  };
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

interface NegocioDelBoton {
  id: string;
  name: string;
  timezone: string;
  telnyxPhoneNumber: string | null;
  phone: string;
  placeId: string | null;
}

interface ReservaDelBoton {
  id: string;
  callId: string;
  programedAt: Date;
  isCancelled: boolean;
  clientName: string | null;
  clientPhone: string | null;
  serviceIds: string[];
  call: { fromNumber: string | null; businessId: string };
  professional: { name: string } | null;
}

export async function botonEnClientes(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  const boton = await resolverBotonDeCliente(message);
  if ("rechazo" in boton) {
    const base = `cliente:boton:${boton.rechazo}`;
    if (
      boton.rechazo === "sin-contexto" ||
      boton.rechazo === "titulo-desconocido"
    ) {
      return resultado(
        base,
        await responder(
          message,
          "boton-sin-contexto",
          mensajes.botonSinContexto(),
          {
            unaVezAlDia: true,
          }
        )
      );
    }
    return { handler: base };
  }

  const business = await prisma.business.findFirst({
    where: { id: boton.businessId, active: true },
    select: {
      id: true,
      name: true,
      timezone: true,
      telnyxPhoneNumber: true,
      phone: true,
      placeId: true,
    },
  });
  if (!business) {
    return { handler: "cliente:boton:negocio-inactivo" };
  }

  if (boton.tipo === "hueco") {
    return botonDeHueco(message, boton, business);
  }
  return botonDeReserva(message, boton, business);
}

// ---------------------------------------------------------------------------
// Botones sobre una reserva
// ---------------------------------------------------------------------------

/** Otra cita activa y futura del mismo teléfono en ese negocio (G13). */
async function otraCitaActiva(
  businessId: string,
  from: string,
  excluirBookingId: string,
  timezone: string
): Promise<string | null> {
  const otra = await prisma.booking.findFirst({
    where: {
      id: { not: excluirBookingId },
      isCancelled: false,
      programedAt: { gt: new Date() },
      call: { businessId },
      OR: [
        { clientPhone: from },
        { clientPhone: null, call: { fromNumber: from } },
      ],
    },
    orderBy: { programedAt: "asc" },
    select: { programedAt: true },
  });
  return otra ? formatearCita(otra.programedAt, timezone) : null;
}

async function botonDeReserva(
  message: InboundMessage,
  boton: BotonDeCliente,
  business: NegocioDelBoton
): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;
  const base = `cliente:${boton.accion}`;
  const booking = (await prisma.booking.findFirst({
    where: { id: boton.recursoId, call: { businessId: business.id } },
    include: {
      call: { select: { fromNumber: true, businessId: true } },
      professional: { select: { name: true } },
    },
  })) as ReservaDelBoton | null;
  if (!booking) {
    console.warn(
      `[WhatsApp] Botón ${boton.accion} de ${from} para la reserva ${boton.recursoId}, que no es del negocio ${business.id}; se ignora`
    );
    return { handler: "cliente:boton:recurso-ajeno" };
  }
  if ((booking.clientPhone ?? booking.call.fromNumber) !== from) {
    console.warn(
      `[WhatsApp] Botón ${boton.accion} de ${from} para la reserva ${booking.id} del negocio ${business.id}, cuyo titular es otro número; se ignora`
    );
    return { handler: "cliente:boton:no-titular" };
  }

  const negocio = nombreParaCliente(business);
  const telefono = telefonoDeContacto(business);
  const cita = formatearCita(booking.programedAt, business.timezone);
  const opciones = { businessId: business.id };
  const otraCita = () =>
    otraCitaActiva(business.id, from, booking.id, business.timezone);
  const pasada = booking.programedAt.getTime() < Date.now();

  switch (boton.accion) {
    case "guardar_contacto":
      return guardarContacto(message, booking, business);

    case "confirmo": {
      if (booking.isCancelled) {
        return resultado(
          `${base}:cancelada`,
          await responder(
            message,
            "cita-ya-cancelada",
            mensajes.citaYaCancelada({
              negocio,
              telefono,
              otraCita: await otraCita(),
            }),
            opciones
          )
        );
      }
      if (pasada) {
        return resultado(
          `${base}:pasada`,
          await responder(
            message,
            "cita-ya-pasada",
            mensajes.citaYaPasada({
              negocio,
              telefono,
              otraCita: await otraCita(),
            }),
            opciones
          )
        );
      }
      const confirmada = await prisma.booking.updateMany({
        where: {
          id: booking.id,
          isCancelled: false,
          confirmedByClientAt: null,
        },
        data: { confirmedByClientAt: new Date() },
      });
      if (confirmada.count === 1) {
        console.log(
          `[WhatsApp] Cita ${booking.id} del negocio ${business.id} confirmada por el cliente`
        );
        return resultado(
          base,
          await responder(
            message,
            "cita-confirmada",
            mensajes.citaConfirmadaPorCliente({ negocio, cita }),
            opciones
          )
        );
      }
      return resultado(
        `${base}:repetido`,
        await responder(
          message,
          "cita-ya-confirmada",
          mensajes.citaYaConfirmada({ negocio, cita }),
          { ...opciones, unaVezAlDia: true }
        )
      );
    }

    case "cancelar": {
      if (pasada) {
        return resultado(
          `${base}:pasada`,
          await responder(
            message,
            "cita-ya-pasada",
            mensajes.citaYaPasada({
              negocio,
              telefono,
              otraCita: await otraCita(),
            }),
            opciones
          )
        );
      }
      const r = await cancelarReserva({
        bookingId: booking.id,
        businessId: business.id,
        cancelledBy: "client_button",
        etiqueta: `boton cliente ${message.id}`,
        inboundMessageId: message.id,
      });
      if (r.resultado !== "cancelada") {
        return resultado(
          `${base}:ya-cancelada`,
          await responder(
            message,
            "cita-ya-cancelada",
            mensajes.citaYaCancelada({
              negocio,
              telefono,
              otraCita: await otraCita(),
            }),
            opciones
          )
        );
      }
      return resultado(
        base,
        await responder(
          message,
          "cita-cancelada",
          mensajes.citaCanceladaPorCliente({ negocio, cita, telefono }),
          opciones
        )
      );
    }

    case "cambiar": {
      if (booking.isCancelled) {
        return resultado(
          `${base}:cancelada`,
          await responder(
            message,
            "cita-ya-cancelada",
            mensajes.citaYaCancelada({
              negocio,
              telefono,
              otraCita: await otraCita(),
            }),
            opciones
          )
        );
      }
      if (pasada) {
        return resultado(
          `${base}:pasada`,
          await responder(
            message,
            "cita-ya-pasada",
            mensajes.citaYaPasada({
              negocio,
              telefono,
              otraCita: await otraCita(),
            }),
            opciones
          )
        );
      }
      // Fase 2: «Cambiar» abre el chat con la recepcionista con la cita ya
      // identificada; ella pide la nueva hora y la cambia (cancelar +
      // reservar) con confirmación, como por teléfono. Sin chat, el texto
      // de siempre (llamar al negocio).
      const chat = await conversarConRecepcionista({
        message,
        businessId: business.id,
        texto: `He pulsado «Cambiar» en el recordatorio de mi cita del ${cita}${nombreParaElCliente(booking.professional?.name) ? ` con ${booking.professional!.name}` : ""}. Quiero cambiarla de día u hora.`,
        etiqueta: `${base}:chat`,
      });
      if (chat.atendido) {
        return chat.resultado;
      }
      return resultado(
        base,
        await responder(
          message,
          "como-cambiar",
          mensajes.comoCambiarCita({ negocio, cita, telefono }),
          opciones
        )
      );
    }

    case "vale":
      // Solo cierra el aviso; el toque ya abrió la ventana de 24 h.
      return { handler: base };

    case "no_me_va_bien": {
      const existente = await prisma.lead.findFirst({
        where: {
          type: "client_change_rejected",
          resolvedAt: null,
          call: { businessId: business.id },
          data: { path: ["bookingId"], equals: booking.id },
        },
        select: { id: true },
      });
      if (!existente) {
        const lead = await prisma.lead.create({
          data: {
            callId: booking.callId,
            type: "client_change_rejected",
            isLead: false,
            data: {
              bookingId: booking.id,
              clientPhone: from,
              inboundMessageId: message.id,
            },
          },
          select: { id: true },
        });
        console.warn(
          `[WhatsApp] Cliente ${from} rechazó el cambio de la cita ${booking.id} del negocio ${business.id}; se avisa al dueño`
        );
        // Aviso al dueño con el teléfono del cliente (fase 2 / PR 4), por la
        // misma vía que un recado: botones «Atendido» · «Recuérdamelo
        // mañana» y plantilla `recado_negocio` fuera de la ventana.
        try {
          await avisarRecado({
            businessId: business.id,
            businessName: business.name,
            leadId: lead.id,
            clientName: booking.clientName,
            clientPhone: from,
            motivo: `La nueva hora de su cita (${cita}) no le va bien; quiere buscar otra.`,
            quiereQueLeLlamen: true,
          });
        } catch (error) {
          console.error(
            `[WhatsApp] No se pudo avisar al negocio ${business.id} de que ${from} rechazó el cambio de la cita ${booking.id}: ${errorMessage(error)}`
          );
        }
      }
      return resultado(
        base,
        await responder(
          message,
          "cambio-no-me-va-bien",
          mensajes.cambioNoMeVaBien({ negocio, telefono }),
          opciones
        )
      );
    }

    default:
      return { handler: "cliente:boton:accion-no-permitida" };
  }
}

async function guardarContacto(
  message: InboundMessage,
  booking: ReservaDelBoton,
  business: NegocioDelBoton
): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;
  const base = "cliente:guardar_contacto";
  const idempotencyKey = `contacto-${booking.id}`;
  const callbackData = `cliente:contacto:${booking.id}`;
  const reclamado = await reclamarEnvio(
    "whatsapp",
    idempotencyKey,
    {
      businessId: business.id,
      audience: "client",
      toNumber: from,
      callbackData,
      kind: "contacts",
    },
    { reintentarFallidos: true }
  );
  if (!reclamado) {
    return { handler: `${base}:repetido` };
  }
  let numero: string;
  try {
    numero = await numeroDeClientes();
  } catch (error) {
    console.error(
      `[WhatsApp] No hay remitente de clientes para la vCard de la reserva ${booking.id}: ${errorMessage(error)}`
    );
    numero = "";
  }
  try {
    await enviarContacto({
      audience: "client",
      to: from,
      businessId: business.id,
      contact: TARJETA_ALHABLA_RESERVAS(numero),
      idempotencyKey,
      callbackData,
    });
    console.log(
      `[WhatsApp] vCard de Alhabla Reservas enviada a ${from} (reserva ${booking.id}, negocio ${business.id})`
    );
    return { handler: base };
  } catch (error) {
    if (esErrorDeBaja(error)) {
      return { handler: `${base}:baja` };
    }
    const motivo = errorMessage(error);
    console.error(
      `[WhatsApp] No se pudo enviar la vCard a ${from} (reserva ${booking.id}, negocio ${business.id}): ${motivo}`
    );
    await prisma.sentMessage
      .updateMany({
        where: { channel: "whatsapp", idempotencyKey, providerMessageId: null },
        data: {
          deliveryStatus: "failed",
          errorCode: "SEND_ERROR",
          errorDetail: motivo,
        },
      })
      .catch(() => undefined);
    return resultado(
      `${base}:fallido`,
      await responder(
        message,
        "contacto-texto",
        mensajes.contactoComoTexto({ numero }),
        {
          businessId: business.id,
        }
      )
    );
  }
}

// ---------------------------------------------------------------------------
// Botones sobre un hueco de la lista de espera
// ---------------------------------------------------------------------------

async function botonDeHueco(
  message: InboundMessage,
  boton: BotonDeCliente,
  business: NegocioDelBoton
): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;
  const base = `cliente:${boton.accion}`;
  const lead = await prisma.lead.findFirst({
    where: {
      id: boton.recursoId,
      type: "availability_watch",
      call: { businessId: business.id },
    },
    select: { id: true, data: true, resolvedAt: true },
  });
  if (!lead) {
    console.warn(
      `[WhatsApp] Botón ${boton.accion} de ${from} para el aviso ${boton.recursoId}, que no es del negocio ${business.id}; se ignora`
    );
    return { handler: "cliente:boton:recurso-ajeno" };
  }
  const data = (lead.data as Record<string, unknown> | null) ?? {};
  if (data.clientPhone !== from) {
    console.warn(
      `[WhatsApp] Botón ${boton.accion} de ${from} para el aviso ${lead.id} del negocio ${business.id}, cuyo titular es otro número; se ignora`
    );
    return { handler: "cliente:boton:no-titular" };
  }
  const negocio = nombreParaCliente(business);
  const telefono = telefonoDeContacto(business);
  const startDateTime = new Date(String(data.startDateTime));
  const cita = Number.isNaN(startDateTime.getTime())
    ? "la hora pedida"
    : formatearCita(startDateTime, business.timezone);
  const opciones = { businessId: business.id };

  if (boton.accion === "ya_no") {
    if (data.resolvedBy === "reservado") {
      // La reserva que salió de este aviso puede haberse cancelado después
      // (recordatorio → «Cancelar»): entonces la hora ya NO está a su
      // nombre y decir «pulsa Cancelar en el recordatorio» sería falso.
      if (await reservaDelLeadCancelada(data, business.id)) {
        return resultado(
          `${base}:reserva-cancelada`,
          await responder(
            message,
            "hueco-rechazado",
            mensajes.huecoRechazado({ negocio }),
            { ...opciones, unaVezAlDia: true }
          )
        );
      }
      return resultado(
        `${base}:ya-reservada`,
        await responder(
          message,
          "hueco-ya-reservado",
          mensajes.huecoYaReservadoNoSeAnula({ negocio, cita }),
          opciones
        )
      );
    }
    const cerrado = await cerrarAviso({
      leadId: lead.id,
      resolvedBy: "ya_no",
      inboundMessageId: message.id,
    });
    if (cerrado.count === 0) {
      return { handler: `${base}:repetido` };
    }
    const respuesta = await responder(
      message,
      "hueco-rechazado",
      mensajes.huecoRechazado({ negocio }),
      opciones
    );
    if (cerrado.hueco) {
      await avisarAQuienEsperaba({
        businessId: business.id,
        hueco: cerrado.hueco,
        origen: "renuncia",
        etiqueta: `renuncia ${message.id}`,
      });
    }
    return resultado(base, respuesta);
  }

  // reservar
  const etiqueta = `boton cliente ${message.id}`;
  const r = await reservarDesdeListaDeEspera({
    leadId: lead.id,
    businessId: business.id,
    from,
    inboundMessageId: message.id,
    contactName: sanearNombre(message.contactName),
  });
  switch (r.estado) {
    case "reservada": {
      const respuesta = await responder(
        message,
        "hueco-reservado",
        mensajes.huecoReservado({
          negocio,
          servicio: r.servicio ?? "lo que pediste",
          cita: r.startDateTime
            ? formatearCita(r.startDateTime, business.timezone)
            : cita,
          telefono,
        }),
        { ...opciones, saltarTecho: true }
      );
      if (r.bookingId && respuesta.sufijo === "" && !respuesta.error) {
        await prisma.booking
          .update({
            where: { id: r.bookingId },
            data: { clientNotifiedAt: new Date() },
          })
          .catch((error: unknown) => {
            console.error(
              `[WhatsApp] No se pudo anotar clientNotifiedAt en la reserva ${r.bookingId}: ${errorMessage(error)}`
            );
          });
      } else if (r.bookingId && respuesta.error) {
        // Telnyx falló (no es baja): la confirmación sale por plantilla.
        console.log(
          `[WhatsApp] La respuesta de «Sí, resérvala» a ${from} falló; se encola la confirmación por plantilla para la reserva ${r.bookingId}`
        );
        await programarMensajesAlCliente({
          bookingId: r.bookingId,
          etiqueta,
          confirmacion: true,
        });
      }
      return resultado(base, respuesta);
    }
    case "ya_reservada":
      return resultado(
        `${base}:ya-reservada`,
        await responder(
          message,
          "hueco-ya-reservado",
          mensajes.huecoYaReservado({ negocio, cita }),
          opciones
        )
      );
    case "ocupado":
      return resultado(
        `${base}:ocupado`,
        await responder(
          message,
          "hueco-ocupado",
          mensajes.huecoYaOcupado({ negocio, telefono }),
          opciones
        )
      );
    case "fuera_de_plazo":
      return resultado(
        `${base}:fuera-de-plazo`,
        await responder(
          message,
          "hueco-fuera-de-plazo",
          mensajes.huecoFueraDePlazo({ negocio, telefono }),
          opciones
        )
      );
    case "pasada":
      return resultado(
        `${base}:pasada`,
        await responder(
          message,
          "hueco-pasado",
          mensajes.huecoYaPasado({ negocio, telefono }),
          opciones
        )
      );
    case "cerrado":
      return resultado(
        `${base}:cerrado`,
        await responder(
          message,
          "hueco-cerrado",
          mensajes.huecoCerrado({ negocio, telefono }),
          opciones
        )
      );
    default:
      return resultado(
        `${base}:${r.estado}`,
        await responder(
          message,
          "hueco-no-reservado",
          mensajes.noPudeReservarAhora({ negocio, telefono }),
          opciones
        )
      );
  }
}
