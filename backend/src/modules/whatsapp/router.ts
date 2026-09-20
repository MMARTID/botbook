import type { Business, InboundMessage } from "@prisma/client";
import type { WhatsappAudience } from "../../adapters/whatsapp/WhatsAppAdapter.js";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import { telnyxAiAdapter } from "../../adapters/telnyx/TelnyxAiAdapter.js";
import { enqueueRetryBookingJob } from "../../lib/cloudTasks.js";
import { interpretarComando, type PalabraClave } from "./webhooks.js";
import {
  limitesDelDia,
  textoAgendaDelDia,
  type TipoAviso,
} from "./avisosNegocio.js";
import { enqueueRecordarRecadoJob } from "../../lib/cloudTasks.js";
import { resolverRemitente } from "./service.js";
import { registrarBaja, revocarBaja } from "./bajas.js";
import {
  HORA_MS,
  DIA_MS,
  normalizarTitulo,
  responder,
  resultado,
  type Respuesta,
} from "./respuestas.js";
export type { ResultadoEnrutado } from "./respuestas.js";
import type { ResultadoEnrutado } from "./respuestas.js";
import {
  activarAvisosDelDueno,
  activo,
  consintio,
  construirEnlaceAlta,
  darDeBajaDueno,
  nombreParaWhatsapp,
  reactivarDueno,
} from "./altaDueno.js";
import { botonEnClientes } from "./botonesCliente.js";
import { conversarConRecepcionista } from "./chatCliente.js";
import {
  anotarEnConversacionDelDueno,
  cerrarConversacionDelDueno,
  chatDelDuenoActivo,
  conversarConGestor,
  gestorAssistantId,
} from "./chatDueno.js";
import { decidirPropuesta } from "../gestor/acciones.js";
import { avisarAQuienEsperaba } from "./listaDeEspera.js";
import { nombreParaCliente, telefonoDeContacto } from "./mensajesCliente.js";
import * as mensajes from "./mensajes.js";

/**
 * Enrutador de mensajes entrantes (PLAN-CANAL-DUENO.md § 6), fase 1:
 * alta del dueño (`ALTA <código>`, botón «Activar avisos»), STOP/BAJA en
 * los dos números, `ALTA` a secas (reactivación), AYUDA, los botones de los
 * avisos al negocio (PR 3: `aviso:<tipo>:<recurso>:<accion>`), la agenda
 * del día (AGENDA/HOY/MAÑANA), los botones del cliente (PR 4, en
 * `botonesCliente.ts`) y respuestas fijas a todo lo demás. Fase 2: el texto
 * libre de un cliente conocido va a la recepcionista de su negocio por chat
 * (`chatCliente.ts`) cuando el interruptor está encendido, y el del dueño al
 * Gestor (`chatDueno.ts`, PR 2) con sus botones `accion:<id>:confirmar|cancelar`.
 *
 * Reglas:
 * - Primero la base de datos, después la respuesta. Nunca lanza por un
 *   fallo al responder: el motivo vuelve en `error` y queda en el log.
 * - Como mucho UNA respuesta por entrante, siempre como texto desde el
 *   mismo número al que escribió la persona (ventana abierta, 0,004 $), y
 *   reclamada con `reclamarEnvio` (`entrante:<id>:<tipo>`): un reintento
 *   no responde dos veces.
 * - Techo de 20 respuestas por número y hora, y para las ramas
 *   informativas una vez al día por tipo. Los contadores leen columnas que
 *   se escriben después del envío: bajo una ráfaga concurrente son
 *   aproximados (pueden dejar pasar unas pocas respuestas de más). Asumido.
 * - Toda escritura de estado lleva el número del remitente en el `where`.
 */

const RESPALDO_BOTON_MS = 72 * HORA_MS;
const MAX_FALLOS_CODIGO_POR_HORA = 5;

type SubtipoIgnorado = "reaction" | "system" | "unsupported";
const SUBTIPOS_IGNORADOS: readonly string[] = [
  "reaction",
  "system",
  "unsupported",
];

function nombres(negocios: Array<{ name: string }>): string[] {
  return negocios.map((b) => nombreParaWhatsapp(b));
}

/** Negocios activos cuyo móvil del dueño es el remitente. */
async function negociosDelMovil(from: string): Promise<Business[]> {
  return prisma.business.findMany({
    where: { ownerWhatsappNumber: from, active: true },
    orderBy: { name: "asc" },
  });
}

function subtipoDelPayload(message: InboundMessage): string | null {
  const payload = message.payload as { type?: unknown } | null;
  return payload && typeof payload.type === "string" ? payload.type : null;
}

async function numeroDeNegocios(): Promise<string> {
  return (await resolverRemitente("owner")).phoneNumber;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export async function enrutarEntrante(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  if (message.audience !== "owner" && message.audience !== "client") {
    console.warn(
      `[WhatsApp] Entrante ${message.providerMessageId} de ${message.fromNumber} a ${message.toNumber || "?"} sin audiencia; se ignora`
    );
    return { handler: "ignorado:sin-audiencia" };
  }
  const audience: WhatsappAudience = message.audience;

  if (message.kind === "other") {
    const subtipo = subtipoDelPayload(message);
    if (subtipo && SUBTIPOS_IGNORADOS.includes(subtipo)) {
      // Meta no cuenta una reacción ni un mensaje de sistema como mensaje
      // del usuario: ni respuesta ni ventana.
      return { handler: `ignorado:${subtipo as SubtipoIgnorado}` };
    }
    if (subtipo === "request_welcome") {
      const respuesta =
        audience === "owner"
          ? await responder(
              message,
              "desconocido-negocios",
              mensajes.desconocidoEnNegocios(),
              { unaVezAlDia: true }
            )
          : await responder(
              message,
              "desconocido-clientes",
              mensajes.desconocidoEnClientes(),
              { unaVezAlDia: true }
            );
      return resultado(`bienvenida-chat:${audience}`, respuesta);
    }
  }

  if (audience === "owner" && message.role === "owner") {
    await abrirVentanaDelDueno(message);
  }

  return audience === "owner"
    ? enrutarEnNegocios(message)
    : enrutarEnClientes(message);
}

/**
 * Un entrante real del dueño abre la ventana de 24 h y prueba que llega.
 * La ventana solo avanza: el barrido puede enrutar una fila antigua después
 * de un mensaje más reciente, y `receivedAt + 24 h` de la vieja no debe
 * retroceder la ventana vigente.
 */
async function abrirVentanaDelDueno(message: InboundMessage): Promise<void> {
  const from = message.fromNumber;
  const nuevaVentana = new Date(message.receivedAt.getTime() + DIA_MS);
  try {
    const limpiados = await prisma.business.updateMany({
      where: {
        ownerWhatsappNumber: from,
        active: true,
        ownerWhatsappUnreachableAt: { not: null },
      },
      data: { ownerWhatsappUnreachableAt: null },
    });
    await prisma.business.updateMany({
      where: {
        ownerWhatsappNumber: from,
        active: true,
        OR: [
          { ownerWindowOpenUntil: null },
          { ownerWindowOpenUntil: { lt: nuevaVentana } },
        ],
      },
      data: { ownerWindowOpenUntil: nuevaVentana },
    });
    if (limpiados.count > 0) {
      console.log(
        `[WhatsApp] ${from} vuelve a ser alcanzable (había un 131026)`
      );
    }
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo abrir la ventana de 24 h de ${from} (entrante ${message.providerMessageId}): ${errorMessage(error)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Número de NEGOCIOS
// ---------------------------------------------------------------------------

async function enrutarEnNegocios(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  const comando =
    message.kind === "keyword" && message.text
      ? interpretarComando(message.text)
      : null;

  if (comando) {
    switch (comando.keyword) {
      case "STOP":
      case "BAJA":
        return stopEnNegocios(message, comando.keyword);
      case "ALTA":
        return comando.code
          ? altaConCodigo(message, comando.code)
          : altaASecas(message);
      case "AYUDA":
        return ayudaEnNegocios(message);
      default:
        return palabraClavePendiente(message, comando.keyword);
    }
  }

  if (message.kind === "button") {
    return botonEnNegocios(message);
  }

  if (message.kind === "text") {
    if (message.role === "owner") {
      // Fase 2: el Gestor. Si no puede atender (interruptor, negocio o
      // dueño no activo) se cae a la respuesta fija de siempre.
      if (message.businessId && message.text) {
        const chat = await conversarConGestor({
          message,
          businessId: message.businessId,
          texto: message.text,
        });
        if (chat.atendido) {
          return chat.resultado;
        }
      }
      return resultado("texto:dueno", await todaviaNoChateo(message));
    }
    return textoDesconocidoEnNegocios(message);
  }

  // audio / media / other sin subtipo ignorado
  if (message.role === "owner") {
    return resultado(
      `pendiente:${message.kind}`,
      await todaviaNoChateo(message)
    );
  }
  return { handler: `ignorado:${message.kind}` };
}

async function todaviaNoChateo(message: InboundMessage): Promise<Respuesta> {
  return responder(
    message,
    "dueno-texto",
    mensajes.todaviaNoChateo({ panelUrl: mensajes.panelUrl() }),
    { unaVezAlDia: true }
  );
}

async function textoDesconocidoEnNegocios(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  return resultado(
    "texto:desconocido",
    await responder(
      message,
      "desconocido-negocios",
      mensajes.desconocidoEnNegocios(),
      { unaVezAlDia: true }
    )
  );
}

async function palabraClavePendiente(
  message: InboundMessage,
  keyword: PalabraClave
): Promise<ResultadoEnrutado> {
  if (message.role === "owner") {
    if (keyword === "AGENDA" || keyword === "HOY" || keyword === "MANANA") {
      return agendaEnNegocios(message, keyword === "MANANA" ? 1 : 0);
    }
    if (keyword === "MAL") {
      return malEnNegocios(message);
    }
    // PAUSA (fase 3): la respuesta fija.
    return resultado(
      `pendiente:palabra-clave:${keyword}`,
      await todaviaNoChateo(message)
    );
  }
  return textoDesconocidoEnNegocios(message);
}

/** AGENDA / HOY / MAÑANA: las citas del día de los negocios del móvil. */
async function agendaEnNegocios(
  message: InboundMessage,
  dia: 0 | 1
): Promise<ResultadoEnrutado> {
  const negocios = (await negociosDelMovil(message.fromNumber)).filter((b) =>
    consintio(b)
  );
  if (negocios.length === 0) {
    return resultado("agenda:sin-negocio", await todaviaNoChateo(message));
  }
  const textos: string[] = [];
  for (const business of negocios) {
    try {
      textos.push(await textoAgendaDelDia(business, dia));
    } catch (error) {
      console.error(
        `[WhatsApp] No se pudo montar la agenda de ${dia === 0 ? "hoy" : "mañana"} del negocio ${business.id}: ${errorMessage(error)}`
      );
      textos.push(
        `${nombreParaWhatsapp(business)}: no he podido leer la agenda ahora mismo.`
      );
    }
  }
  return resultado(
    `agenda:${dia === 0 ? "hoy" : "manana"}`,
    await responder(message, `agenda-${dia}`, textos.join("\n\n"), {
      businessId: negocios[0].id,
    })
  );
}

async function stopEnNegocios(
  message: InboundMessage,
  keyword: "STOP" | "BAJA"
): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;
  const negocios = await negociosDelMovil(from);

  if (negocios.length > 0) {
    await darDeBajaDueno({
      from,
      keyword,
      inboundMessageId: message.id,
      businessId: message.businessId ?? negocios[0].id,
    });
    // La conversación con el Gestor se cierra con la baja (§ 8).
    await cerrarConversacionDelDueno(from);
    // No se nombra un negocio al que nunca dijo que sí.
    const consentidos = negocios.filter(consintio);
    const respuesta =
      consentidos.length > 0
        ? await responder(
            message,
            "stop-dueno",
            mensajes.bajaDueno({ negocios: nombres(consentidos) }),
            { permitirBaja: true, saltarTecho: true }
          )
        : await responder(
            message,
            "stop-desconocido",
            mensajes.bajaDesconocido(),
            { permitirBaja: true, saltarTecho: true, unaVezAlDia: true }
          );
    return resultado("stop:dueno", respuesta);
  }

  await registrarBaja({
    phoneNumber: from,
    audience: "owner",
    keyword,
    inboundMessageId: message.id,
    businessId: message.businessId,
  });
  console.log(
    `[WhatsApp] Baja de ${from} en el número de negocios sin negocio asociado (entrante ${message.id})`
  );
  return resultado(
    "stop:desconocido",
    await responder(message, "stop-desconocido", mensajes.bajaDesconocido(), {
      permitirBaja: true,
      saltarTecho: true,
      unaVezAlDia: true,
    })
  );
}

/**
 * Intentos de código que no vincularon nada en la última hora. Cuenta
 * también los `alta:ya-activo:codigo`: un móvil que ya es dueño activo
 * recibe «ya activo» en vez de «no reconocido» (doble toque del enlace),
 * pero no por eso puede probar códigos de otros negocios sin límite.
 */
async function fallosDeCodigoEnUnaHora(from: string): Promise<number> {
  return prisma.inboundMessage.count({
    where: {
      fromNumber: from,
      OR: [
        { handler: { startsWith: "alta:codigo-invalido" } },
        { handler: { startsWith: "alta:codigo-caducado" } },
        { handler: { startsWith: "alta:ya-activo:codigo" } },
      ],
      receivedAt: { gt: new Date(Date.now() - HORA_MS) },
    },
  });
}

async function altaConCodigo(
  message: InboundMessage,
  code: string
): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;

  const fallos = await fallosDeCodigoEnUnaHora(from);
  if (fallos >= MAX_FALLOS_CODIGO_POR_HORA) {
    console.warn(
      `[WhatsApp] ${from} lleva ${fallos} códigos de alta fallidos en una hora; se bloquea sin consultar el código`
    );
    return resultado(
      "alta:bloqueado",
      await responder(message, "bloqueado", mensajes.demasiadosIntentos(), {
        unaVezAlDia: true,
      })
    );
  }

  const now = Date.now();
  const business = await prisma.business.findUnique({
    where: { ownerAltaCode: code },
  });
  const caducado =
    business !== null &&
    business.active &&
    (business.ownerAltaCodeExpiresAt === null ||
      business.ownerAltaCodeExpiresAt.getTime() <= now);
  const valido = business !== null && business.active && !caducado;

  if (valido) {
    const { count, numeroAnterior } = await activarAvisosDelDueno({
      businessId: business.id,
      from,
      via: "alta_codigo",
      inboundMessageId: message.id,
      codigo: code,
    });
    if (count === 1) {
      return resultado(
        "alta:vinculado",
        await responder(
          message,
          "bienvenida",
          mensajes.bienvenidaTrasAlta({
            negocios: [nombreParaWhatsapp(business)],
            movilApuntado: numeroAnterior !== null && from !== numeroAnterior,
          }),
          { businessId: business.id }
        )
      );
    }
    // Otro proceso lo consumió a la vez: se trata como código gastado.
  }

  // Un código gastado desde el móvil que ya es dueño activo (doble toque
  // del enlace, borrador reenviado, QR escaneado dos veces) recibe «ya
  // activo», pero el intento cuenta para el bloqueo de 5 por hora.
  const activos = (await negociosDelMovil(from)).filter(activo);
  if (activos.length > 0) {
    return resultado(
      "alta:ya-activo:codigo",
      await responder(
        message,
        "ya-activo",
        mensajes.yaActivo({ negocios: nombres(activos) }),
        { businessId: activos[0].id }
      )
    );
  }

  if (caducado) {
    return resultado(
      "alta:codigo-caducado",
      await responder(message, "codigo-caducado", mensajes.codigoCaducado())
    );
  }
  return resultado(
    "alta:codigo-invalido",
    await responder(message, "codigo-invalido", mensajes.codigoNoReconocido())
  );
}

async function altaASecas(message: InboundMessage): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;
  const negocios = await negociosDelMovil(from);

  // Reactivación: solo negocios que YA consintieron desde este móvil.
  const reactivables = negocios.filter(
    (b) => consintio(b) && b.ownerWhatsappOptOutAt !== null
  );
  if (reactivables.length > 0) {
    await reactivarDueno({ from, inboundMessageId: message.id });
    return resultado(
      "alta:reactivado",
      await responder(
        message,
        "reactivado",
        mensajes.avisosReactivados({ negocios: nombres(reactivables) }),
        { businessId: reactivables[0].id }
      )
    );
  }

  const activos = negocios.filter(activo);
  if (activos.length > 0) {
    await revocarBaja({
      phoneNumber: from,
      audience: "owner",
      inboundMessageId: message.id,
    });
    return resultado(
      "alta:ya-activo",
      await responder(
        message,
        "ya-activo",
        mensajes.yaActivo({ negocios: nombres(activos) }),
        { businessId: activos[0].id }
      )
    );
  }

  // Solo negocios `pendiente` (alguien tecleó este móvil en un panel, que
  // puede no ser el suyo) o ninguno: NO es consentimiento. La prueba es el
  // código (tener el panel) o el botón de la plantilla de ese negocio.
  return resultado(
    "alta:sin-codigo",
    await responder(message, "sin-codigo", mensajes.comoDarseDeAlta(), {
      unaVezAlDia: true,
    })
  );
}

async function ayudaEnNegocios(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  if (message.role === "owner") {
    const negocios = await negociosDelMovil(message.fromNumber);
    // Solo los que consintieron desde este móvil: un negocio que tecleó
    // este número en su panel (quizá otro tenant) no se nombra.
    const consentidos = negocios.filter(consintio);
    if (consentidos.length === 0) {
      return resultado(
        "ayuda:sin-consentimiento",
        await responder(message, "sin-codigo", mensajes.comoDarseDeAlta(), {
          unaVezAlDia: true,
        })
      );
    }
    return resultado(
      "ayuda:dueno",
      await responder(
        message,
        "ayuda-dueno",
        mensajes.ayudaDueno({
          negocios: nombres(consentidos),
          panelUrl: mensajes.panelUrl(),
          chat: chatDelDuenoActivo() && gestorAssistantId() !== null,
        })
      )
    );
  }
  return resultado(
    "ayuda:desconocido",
    await responder(
      message,
      "desconocido-negocios",
      mensajes.desconocidoEnNegocios(),
      { unaVezAlDia: true }
    )
  );
}

function esEnvioDeActivacion(enviado: {
  callbackData: string | null;
  templateName: string | null;
}): boolean {
  return (
    (enviado.callbackData?.startsWith("alta:") ?? false) ||
    enviado.templateName === "bienvenida_negocio"
  );
}

function negocioDelEnvio(enviado: {
  businessId: string | null;
  callbackData: string | null;
}): string | null {
  if (enviado.businessId) return enviado.businessId;
  return enviado.callbackData?.startsWith("alta:")
    ? enviado.callbackData.slice(5)
    : null;
}

async function botonEnNegocios(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;
  const pareceActivacion =
    normalizarTitulo(message.buttonTitle ?? message.buttonId) ===
    "ACTIVAR AVISOS";

  if (message.contextMessageId) {
    const enviado = await prisma.sentMessage.findUnique({
      where: { providerMessageId: message.contextMessageId },
    });
    if (!enviado && pareceActivacion) {
      // No se adivina a qué envío respondía: quedaría un consentimiento
      // atribuido a un negocio que la persona no eligió.
      console.warn(
        `[WhatsApp] Botón Activar avisos desde ${from} responde al mensaje ${message.contextMessageId}, que no tiene fila en sent_messages; se deja pendiente`
      );
      return { handler: "pendiente:boton:sin-fila" };
    }
    if (enviado && esEnvioDeActivacion(enviado)) {
      if (enviado.audience !== "owner" || enviado.toNumber !== from) {
        console.warn(
          `[WhatsApp] Botón de activación desde ${from} para un envío a ${enviado.toNumber ?? "?"} (${enviado.audience ?? "?"}, negocio ${enviado.businessId ?? "—"}); se ignora`
        );
        return { handler: "boton:activacion:remitente-distinto" };
      }
      const businessId = negocioDelEnvio(enviado);
      const business = businessId
        ? await prisma.business.findUnique({ where: { id: businessId } })
        : null;
      if (
        !business ||
        !business.active ||
        business.ownerWhatsappNumber !== from
      ) {
        return resultado(
          "boton:activacion:numero-antiguo",
          await responder(
            message,
            "otro-movil",
            mensajes.mensajeParaOtroMovil(),
            { businessId }
          )
        );
      }
      return activarPorBoton(message, business, "ok");
    }
  }

  // Respaldo ACOTADO para el botón sin `context.id`: UNA sola activación
  // reciente a ESE móvil (que salió de verdad), y solo ese negocio. Con dos
  // negocios distintos en 72 h no se sabe cuál pulsó: no se activa nada.
  if (pareceActivacion && !message.contextMessageId) {
    const enviados = await prisma.sentMessage.findMany({
      where: {
        audience: "owner",
        toNumber: from,
        callbackData: { startsWith: "alta:" },
        sentAt: { gt: new Date(Date.now() - RESPALDO_BOTON_MS) },
        NOT: { deliveryStatus: { in: ["failed", "suppressed"] } },
      },
      orderBy: { sentAt: "desc" },
      take: 2,
    });
    const negociosCandidatos = new Set(
      enviados.map((e) => negocioDelEnvio(e)).filter((id) => id !== null)
    );
    if (negociosCandidatos.size > 1) {
      console.warn(
        `[WhatsApp] Botón Activar avisos sin context.id desde ${from} con activaciones de varios negocios en 72 h (${[...negociosCandidatos].join(", ")}); no se activa ninguno`
      );
      return { handler: "pendiente:boton:ambiguo" };
    }
    const enviado = enviados[0] ?? null;
    const businessId = enviado ? negocioDelEnvio(enviado) : null;
    const business = businessId
      ? await prisma.business.findUnique({ where: { id: businessId } })
      : null;
    if (
      enviado &&
      business &&
      business.active &&
      business.ownerWhatsappNumber === from
    ) {
      console.log(
        `[WhatsApp] Botón Activar avisos sin context.id; se acepta por la activación ${enviado.providerMessageId ?? enviado.idempotencyKey} del negocio ${business.id}`
      );
      return activarPorBoton(message, business, "por-envio");
    }
    return { handler: "pendiente:boton:sin-contexto" };
  }

  if (message.buttonId?.startsWith("accion:")) {
    return botonDeAccion(message);
  }

  const aviso = await resolverBotonDeAviso(message);
  if (aviso) {
    return botonDeAviso(message, aviso);
  }

  const prefix = message.buttonId?.split(":")[0] ?? "?";
  return { handler: `pendiente:boton:${prefix}` };
}

// ---------------------------------------------------------------------------
// El Gestor (fase 2, PR 2): botones de una acción propuesta y MAL
// ---------------------------------------------------------------------------

/**
 * «Confirmar» · «Cancelar» sobre una propuesta del Gestor
 * (`accion:<id>:confirmar|cancelar`). La propuesta tiene que ser de un
 * negocio cuyo móvil dado de alta es el que pulsa; el reclamo atómico vive
 * en `decidirPropuesta`. Se responde siempre (el botón abre la ventana).
 */
async function botonDeAccion(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;
  const partes = (message.buttonId ?? "").split(":");
  const accionId = partes[1] ?? "";
  const decision = partes[2];
  if (!accionId || (decision !== "confirmar" && decision !== "cancelar")) {
    return { handler: "accion:boton:malformado" };
  }
  const propuesta = await prisma.ownerPendingAction.findUnique({
    where: { id: accionId },
    select: { businessId: true },
  });
  const business = propuesta
    ? await prisma.business.findFirst({
        where: {
          id: propuesta.businessId,
          active: true,
          ownerWhatsappNumber: from,
        },
        select: { id: true, timezone: true },
      })
    : null;
  if (!business) {
    console.warn(
      `[WhatsApp] Botón ${message.buttonId} desde ${from} sobre una propuesta que no es de su negocio; se ignora`
    );
    return resultado(
      "accion:boton:ajena",
      await responder(
        message,
        "accion-no-encontrada",
        mensajes.accionNoEncontrada(),
        {
          unaVezAlDia: true,
        }
      )
    );
  }
  const base = `accion:${decision}`;
  const opciones = { businessId: business.id };
  const r = await decidirPropuesta({
    accionId,
    businessId: business.id,
    timezone: business.timezone,
    decision,
    inboundMessageId: message.id,
  });
  switch (r.estado) {
    case "ejecutada":
      await anotarEnConversacionDelDueno(
        business.id,
        `El dueño pulsó Confirmar en la propuesta ${accionId} y se ejecutó. Resultado: ${r.mensaje}`
      );
      return resultado(
        base,
        await responder(
          message,
          "accion-ejecutada",
          mensajes.accionEjecutada(r),
          opciones
        )
      );
    case "fallida":
      await anotarEnConversacionDelDueno(
        business.id,
        `El dueño pulsó Confirmar en la propuesta ${accionId} pero no se pudo ejecutar: ${r.mensaje}`
      );
      return resultado(
        `${base}:fallida`,
        await responder(
          message,
          "accion-fallida",
          mensajes.accionFallida(r),
          opciones
        )
      );
    case "rechazada":
      await anotarEnConversacionDelDueno(
        business.id,
        `El dueño pulsó Cancelar en la propuesta ${accionId}: no se hizo nada.`
      );
      return resultado(
        base,
        await responder(
          message,
          "accion-rechazada",
          mensajes.accionRechazada(),
          opciones
        )
      );
    case "caducada":
      return resultado(
        `${base}:caducada`,
        await responder(
          message,
          "accion-caducada",
          mensajes.accionCaducada(),
          opciones
        )
      );
    case "ya_decidida":
      return resultado(
        `${base}:ya-decidida`,
        await responder(
          message,
          "accion-ya-decidida",
          mensajes.accionYaDecidida(),
          {
            ...opciones,
            unaVezAlDia: true,
          }
        )
      );
    case "no_encontrada":
      return resultado(
        `${base}:no-encontrada`,
        await responder(
          message,
          "accion-no-encontrada",
          mensajes.accionNoEncontrada(),
          {
            ...opciones,
            unaVezAlDia: true,
          }
        )
      );
  }
}

/**
 * MAL del dueño: guarda la última pareja pregunta/respuesta de su
 * conversación con el Gestor (leída de Telnyx) en `OwnerChatFeedback`.
 */
async function malEnNegocios(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;
  const business = message.businessId
    ? await prisma.business.findFirst({
        where: {
          id: message.businessId,
          ownerWhatsappNumber: from,
          active: true,
        },
        select: { id: true, ownerConversationId: true },
      })
    : null;
  if (!business?.ownerConversationId) {
    return resultado(
      "mal:sin-conversacion",
      await responder(
        message,
        "mal-sin-conversacion",
        mensajes.feedbackSinConversacion(),
        {
          businessId: business?.id ?? null,
          unaVezAlDia: true,
        }
      )
    );
  }
  try {
    const mensajesDeTelnyx = await telnyxAiAdapter.listConversationMessages(
      business.ownerConversationId
    );
    // Telnyx devuelve los mensajes del más reciente al más antiguo; la
    // pareja es la última respuesta del assistant y el último mensaje del
    // dueño anterior a ella.
    const ordenados = mensajesDeTelnyx.filter((m) => m.role !== "tool");
    const idxRespuesta = ordenados.findIndex(
      (m) => m.role === "assistant" && m.text.trim()
    );
    const respuesta = idxRespuesta >= 0 ? ordenados[idxRespuesta] : null;
    const pregunta = respuesta
      ? ordenados.slice(idxRespuesta + 1).find((m) => m.role === "user")
      : null;
    if (!respuesta || !pregunta) {
      return resultado(
        "mal:sin-pareja",
        await responder(
          message,
          "mal-sin-conversacion",
          mensajes.feedbackSinConversacion(),
          {
            businessId: business.id,
            unaVezAlDia: true,
          }
        )
      );
    }
    await prisma.ownerChatFeedback.create({
      data: {
        businessId: business.id,
        conversationId: business.ownerConversationId,
        question: pregunta.text
          .replace(/^\[WhatsApp[^\]]*\]\s*/, "")
          .slice(0, 4000),
        answer: respuesta.text.slice(0, 4000),
      },
    });
    console.log(
      `[WhatsApp] MAL del dueño ${from} (negocio ${business.id}): pareja guardada de la conversación ${business.ownerConversationId}`
    );
    return resultado(
      "mal:guardado",
      await responder(message, "mal-guardado", mensajes.feedbackGuardado(), {
        businessId: business.id,
      })
    );
  } catch (error) {
    console.error(
      `[WhatsApp] MAL del dueño ${from} (negocio ${business.id}): no se pudo guardar la pareja: ${errorMessage(error)}`
    );
    return resultado(
      "mal:error",
      await responder(
        message,
        "mal-sin-conversacion",
        mensajes.feedbackSinConversacion(),
        {
          businessId: business.id,
          unaVezAlDia: true,
        }
      )
    );
  }
}

// ---------------------------------------------------------------------------
// Botones de los avisos al negocio (PR 3)
// ---------------------------------------------------------------------------

interface BotonDeAviso {
  tipo: TipoAviso;
  recursoId: string;
  accion: string;
  /** Negocio al que se envió el aviso (SentMessage.businessId). */
  businessId: string | null;
}

const TIPOS_DE_AVISO: readonly string[] = [
  "nueva_reserva",
  "cita_pendiente",
  "cancelacion",
  "recado",
];

/** Acción por el título del botón de una PLANTILLA (sin id propio). */
function accionPorTitulo(titulo: string): string | null {
  switch (normalizarTitulo(titulo)) {
    case "VALE":
      return "vale";
    case "VER AGENDA DE HOY":
      return "agenda_hoy";
    case "LA APUNTE YO":
      return "apuntada";
    case "REINTENTAR":
      return "reintentar";
    case "RECONECTAR":
      return "reconectar";
    case "ATENDIDO":
      return "atendido";
    case "RECUERDAMELO MANANA":
      return "manana";
    case "AVISAR A QUIEN ESPERABA":
    case "AVISAR LISTA ESPERA":
      return "avisar_espera";
    default:
      return null;
  }
}

/**
 * Un botón de aviso llega de dos formas: interactivo (el id lleva
 * `aviso:<tipo>:<recurso>:<accion>`) o de plantilla (solo el título; el
 * aviso se sabe por `context.id` → SentMessage.callbackData
 * `aviso:<tipo>:<recurso>`). En los dos casos el envío original tiene que
 * existir y haber ido a este móvil: nunca se actúa sobre un recurso que la
 * persona no recibió.
 */
async function resolverBotonDeAviso(
  message: InboundMessage
): Promise<BotonDeAviso | null> {
  const enviado = message.contextMessageId
    ? await prisma.sentMessage.findUnique({
        where: { providerMessageId: message.contextMessageId },
        select: {
          businessId: true,
          audience: true,
          toNumber: true,
          callbackData: true,
        },
      })
    : null;
  if (
    enviado &&
    (enviado.audience !== "owner" || enviado.toNumber !== message.fromNumber)
  ) {
    return null;
  }

  const partesId = (message.buttonId ?? "").split(":");
  if (partesId[0] === "aviso" && partesId.length >= 4) {
    const tipo = partesId[1];
    const accion = partesId[partesId.length - 1];
    const recursoId = partesId.slice(2, -1).join(":");
    if (TIPOS_DE_AVISO.includes(tipo) && recursoId && accion) {
      if (!enviado) {
        // Sin el envío original no se sabe si este móvil recibió el aviso.
        console.warn(
          `[WhatsApp] Botón ${message.buttonId} desde ${message.fromNumber} sin envío original (context ${message.contextMessageId ?? "—"}); se ignora`
        );
        return null;
      }
      return {
        tipo: tipo as TipoAviso,
        recursoId,
        accion,
        businessId: enviado.businessId,
      };
    }
  }

  const callback = enviado?.callbackData ?? "";
  const partesCb = callback.split(":");
  if (
    partesCb[0] === "aviso" &&
    TIPOS_DE_AVISO.includes(partesCb[1]) &&
    partesCb.length >= 3
  ) {
    const accion = accionPorTitulo(
      message.buttonTitle ?? message.buttonId ?? ""
    );
    if (!accion) return null;
    return {
      tipo: partesCb[1] as TipoAviso,
      recursoId: partesCb.slice(2).join(":"),
      accion,
      businessId: enviado?.businessId ?? null,
    };
  }
  return null;
}

async function botonDeAviso(
  message: InboundMessage,
  aviso: BotonDeAviso
): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;
  const base = `aviso:${aviso.tipo}:${aviso.accion}`;
  const business = aviso.businessId
    ? await prisma.business.findFirst({
        where: {
          id: aviso.businessId,
          ownerWhatsappNumber: from,
          active: true,
        },
      })
    : null;
  if (!business) {
    // El aviso era de un negocio que ya no tiene este móvil: no se actúa.
    return resultado(
      `${base}:numero-antiguo`,
      await responder(message, "otro-movil", mensajes.mensajeParaOtroMovil(), {
        businessId: aviso.businessId,
      })
    );
  }

  switch (aviso.accion) {
    case "vale":
      // Solo cierra el aviso; el toque ya abrió la ventana de 24 h.
      return { handler: base };
    case "agenda_hoy":
      return resultado(
        base,
        await responder(
          message,
          "agenda-0",
          await textoAgendaDelDia(business, 0).catch((error: unknown) => {
            console.error(
              `[WhatsApp] No se pudo montar la agenda de hoy del negocio ${business.id}: ${errorMessage(error)}`
            );
            return `${nombreParaWhatsapp(business)}: no he podido leer la agenda ahora mismo.`;
          }),
          { businessId: business.id }
        )
      );
    case "apuntada":
    case "reintentar":
    case "reconectar":
      return botonDeCitaPendiente(message, aviso, business, base);
    case "avisar_espera":
      return botonDeListaDeEspera(message, aviso, business, base);
    case "atendido":
    case "manana":
      return botonDeRecado(message, aviso, business, base);
    default:
      return { handler: `pendiente:boton:aviso:${aviso.accion}` };
  }
}

/**
 * Botones del aviso #2 (recado): «Atendido» resuelve el lead;
 * «Recuérdamelo mañana» lo pospone hasta las 09:00 del día siguiente en la
 * zona del negocio y programa el job `recordar-recado`, que vuelve a avisar
 * si sigue sin atender. El lead tiene que ser de ESTE negocio; el id del
 * recurso puede llevar el sufijo `:r<n>` de un recordatorio.
 */
async function botonDeRecado(
  message: InboundMessage,
  aviso: BotonDeAviso,
  business: Business,
  base: string
): Promise<ResultadoEnrutado> {
  const leadId = aviso.recursoId.replace(/:r\d+$/, "");
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, type: "message", call: { businessId: business.id } },
    select: { id: true, resolvedAt: true },
  });
  if (!lead) {
    console.warn(
      `[WhatsApp] Botón ${aviso.accion} de ${message.fromNumber} para el recado ${leadId}, que no es del negocio ${business.id}; se ignora`
    );
    return { handler: `${base}:lead-ajeno` };
  }
  if (lead.resolvedAt) {
    return resultado(
      `${base}:ya-atendido`,
      await responder(message, "recado-atendido", mensajes.recadoYaAtendido(), {
        businessId: business.id,
      })
    );
  }
  if (aviso.accion === "atendido") {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { resolvedAt: new Date(), snoozedUntil: null },
    });
    console.log(
      `[WhatsApp] Recado ${lead.id} del negocio ${business.id} atendido por el dueño (${message.fromNumber})`
    );
    return resultado(
      base,
      await responder(message, "recado-atendido", mensajes.recadoAtendido(), {
        businessId: business.id,
      })
    );
  }
  // manana
  const cuando = manana9h(business.timezone || "Europe/Madrid");
  await prisma.lead.update({
    where: { id: lead.id },
    data: { snoozedUntil: cuando },
  });
  try {
    await enqueueRecordarRecadoJob({ leadId: lead.id }, cuando);
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo programar el recordatorio del recado ${lead.id} (negocio ${business.id}) para ${cuando.toISOString()}: ${errorMessage(error)}`
    );
    return resultado(
      `${base}:sin-programar`,
      await responder(
        message,
        "recado-pospuesto",
        `No he podido programar el recordatorio. El recado sigue en tu panel: ${mensajes.panelUrl("/llamadas")}`,
        { businessId: business.id }
      )
    );
  }
  console.log(
    `[WhatsApp] Recado ${lead.id} del negocio ${business.id} pospuesto hasta ${cuando.toISOString()}`
  );
  return resultado(
    base,
    await responder(message, "recado-pospuesto", mensajes.recadoPospuesto(), {
      businessId: business.id,
    })
  );
}

/** Las 09:00 del día siguiente en la zona del negocio. */
export function manana9h(timezone: string, ahora: Date = new Date()): Date {
  const { inicio } = limitesDelDia(timezone, 1, ahora);
  return new Date(inicio.getTime() + 9 * 60 * 60 * 1000);
}

/**
 * «Avisar a quien esperaba» del aviso #4 (PR 4): ofrece el hueco de la cita
 * cancelada al primero de la lista de espera de ESE negocio. Ninguna
 * respuesta nombra el teléfono del que esperaba. Doble toque ⇒ `en_oferta`
 * (la plaza está retenida) o `nadie`.
 */
async function botonDeListaDeEspera(
  message: InboundMessage,
  aviso: BotonDeAviso,
  business: Business,
  base: string
): Promise<ResultadoEnrutado> {
  const negocio = nombreParaWhatsapp(business);
  const opciones = { businessId: business.id };
  const booking = await prisma.booking.findFirst({
    where: { id: aviso.recursoId, call: { businessId: business.id } },
    select: {
      id: true,
      isCancelled: true,
      programedAt: true,
      durationMinutes: true,
    },
  });
  if (!booking) {
    console.warn(
      `[WhatsApp] Botón avisar_espera de ${message.fromNumber} para la reserva ${aviso.recursoId}, que no es del negocio ${business.id}; se ignora`
    );
    return { handler: `${base}:reserva-ajena` };
  }
  if (!booking.isCancelled) {
    return resultado(
      `${base}:no-cancelada`,
      await responder(
        message,
        "lista-espera-sin-hueco",
        mensajes.listaDeEsperaSinHueco({ negocio }),
        opciones
      )
    );
  }
  if (booking.programedAt.getTime() < Date.now()) {
    return resultado(
      `${base}:pasada`,
      await responder(
        message,
        "lista-espera-pasada",
        mensajes.listaDeEsperaPasada({ negocio }),
        opciones
      )
    );
  }
  const r = await avisarAQuienEsperaba({
    businessId: business.id,
    hueco: {
      inicioMs: booking.programedAt.getTime(),
      finMs:
        booking.programedAt.getTime() +
        (booking.durationMinutes || 30) * 60_000,
    },
    origen: "boton_dueno",
    etiqueta: `boton dueño ${message.id}`,
  });
  switch (r.resultado) {
    case "avisado":
      return resultado(
        base,
        await responder(
          message,
          "lista-espera-avisada",
          mensajes.listaDeEsperaAvisada({ negocio, cliente: r.cliente }),
          opciones
        )
      );
    case "en_oferta":
      return resultado(
        `${base}:en-oferta`,
        await responder(
          message,
          "lista-espera-en-oferta",
          mensajes.listaDeEsperaEnOferta({
            negocio,
            cliente: r.cliente,
            minutos: r.minutos,
          }),
          opciones
        )
      );
    case "nadie":
      return resultado(
        `${base}:nadie`,
        await responder(
          message,
          "lista-espera-nadie",
          mensajes.listaDeEsperaNadie({ negocio }),
          opciones
        )
      );
    case "sin_plantilla":
      return resultado(
        `${base}:sin-plantilla`,
        await responder(
          message,
          "lista-espera-sin-plantilla",
          mensajes.listaDeEsperaSinPlantilla({ negocio }),
          opciones
        )
      );
    default:
      return resultado(
        `${base}:error`,
        await responder(
          message,
          "lista-espera-error",
          mensajes.listaDeEsperaError({ negocio }),
          opciones
        )
      );
  }
}

async function botonDeCitaPendiente(
  message: InboundMessage,
  aviso: BotonDeAviso,
  business: Business,
  base: string
): Promise<ResultadoEnrutado> {
  if (aviso.accion === "reconectar") {
    return resultado(
      base,
      await responder(
        message,
        "reconectar",
        mensajes.reconectarCalendario({
          panelUrl: mensajes.panelUrl("/ajustes"),
        }),
        { businessId: business.id }
      )
    );
  }
  // El lead tiene que ser de ESTE negocio: el id viene del botón.
  const lead = await prisma.lead.findFirst({
    where: {
      id: aviso.recursoId,
      type: "pending_booking",
      call: { businessId: business.id },
    },
    select: { id: true, resolvedAt: true, data: true },
  });
  if (!lead) {
    console.warn(
      `[WhatsApp] Botón ${aviso.accion} de ${message.fromNumber} para el lead ${aviso.recursoId}, que no es una cita pendiente del negocio ${business.id}; se ignora`
    );
    return { handler: `${base}:lead-ajeno` };
  }
  const cliente =
    (
      (lead.data as { clientName?: unknown } | null)?.clientName as
        string | undefined
    )?.trim() || "ese cliente";
  if (lead.resolvedAt) {
    return resultado(
      `${base}:ya-resuelta`,
      await responder(message, "cita-resuelta", mensajes.citaYaResuelta(), {
        businessId: business.id,
      })
    );
  }
  if (aviso.accion === "apuntada") {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        resolvedAt: new Date(),
        data: {
          ...((lead.data as Record<string, unknown> | null) ?? {}),
          resolvedBy: "owner_whatsapp",
          resolvedFromInboundMessageId: message.id,
        },
      },
    });
    console.log(
      `[WhatsApp] Cita pendiente ${lead.id} del negocio ${business.id} resuelta a mano por el dueño (${message.fromNumber})`
    );
    return resultado(
      base,
      await responder(
        message,
        "cita-apuntada",
        mensajes.citaApuntada({ cliente }),
        {
          businessId: business.id,
        }
      )
    );
  }
  // reintentar
  try {
    await enqueueRetryBookingJob({ leadId: lead.id });
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo encolar el reintento de la cita pendiente ${lead.id} (negocio ${business.id}): ${errorMessage(error)}`
    );
    return resultado(
      `${base}:sin-encolar`,
      await responder(
        message,
        "reintento-fallido",
        `No he podido programar el reintento de la cita de ${cliente}. Inténtalo desde el panel: ${mensajes.panelUrl("/")}`,
        { businessId: business.id }
      )
    );
  }
  return resultado(
    base,
    await responder(
      message,
      "cita-reintento",
      mensajes.reintentandoCita({ cliente }),
      {
        businessId: business.id,
      }
    )
  );
}

async function activarPorBoton(
  message: InboundMessage,
  business: Business,
  variante: "ok" | "por-envio"
): Promise<ResultadoEnrutado> {
  const nombre = nombreParaWhatsapp(business);
  if (activo(business)) {
    // Botón pulsado dos veces: no se reescribe el consentimiento.
    return resultado(
      "boton:activacion:ya-activo",
      await responder(
        message,
        "ya-activo",
        mensajes.yaActivo({ negocios: [nombre] }),
        { businessId: business.id }
      )
    );
  }
  const { count } = await activarAvisosDelDueno({
    businessId: business.id,
    from: message.fromNumber,
    via: "boton_plantilla",
    inboundMessageId: message.id,
  });
  if (count === 0) {
    return resultado(
      "boton:activacion:numero-antiguo",
      await responder(message, "otro-movil", mensajes.mensajeParaOtroMovil(), {
        businessId: business.id,
      })
    );
  }
  return resultado(
    `boton:activacion:${variante}`,
    await responder(
      message,
      "bienvenida",
      mensajes.bienvenidaTrasAlta({ negocios: [nombre], movilApuntado: false }),
      { businessId: business.id }
    )
  );
}

// ---------------------------------------------------------------------------
// Número de CLIENTES
// ---------------------------------------------------------------------------

async function enrutarEnClientes(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;
  const comando =
    message.kind === "keyword" && message.text
      ? interpretarComando(message.text)
      : null;

  if (comando) {
    switch (comando.keyword) {
      case "STOP":
      case "BAJA": {
        // Baja GLOBAL por número: un dueño aquí se da de baja como cliente.
        await registrarBaja({
          phoneNumber: from,
          audience: "client",
          keyword: comando.keyword,
          inboundMessageId: message.id,
          businessId: message.businessId,
        });
        console.log(
          `[WhatsApp] Baja global del cliente ${from} (entrante ${message.id})`
        );
        return resultado(
          "stop:cliente",
          await responder(message, "stop-cliente", mensajes.bajaCliente(), {
            permitirBaja: true,
            saltarTecho: true,
            unaVezAlDia: true,
          })
        );
      }
      case "ALTA": {
        if (comando.code) {
          // No se valida, consume ni vincula nada: se le devuelve su propio
          // código en un enlace al número de negocios.
          const enlace = construirEnlaceAlta(
            await numeroDeNegocios(),
            comando.code
          );
          return resultado(
            "alta:numero-equivocado",
            await responder(
              message,
              "numero-equivocado",
              mensajes.numeroEquivocado({ enlace })
            )
          );
        }
        const revocadas = await revocarBaja({
          phoneNumber: from,
          audience: "client",
          inboundMessageId: message.id,
        });
        if (revocadas === 1) {
          return resultado(
            "alta:cliente-reactivado",
            await responder(
              message,
              "cliente-reactivado",
              mensajes.clienteReactivado()
            )
          );
        }
        break; // sin baja: como texto libre
      }
      default:
        break; // AYUDA y el resto: como texto libre
    }
  }

  if (message.kind === "button") {
    return botonEnClientes(message);
  }

  if (message.kind === "text" || message.kind === "keyword") {
    return textoEnClientes(message);
  }

  return { handler: `ignorado:${message.kind}` };
}

async function esDuenoConocido(from: string): Promise<boolean> {
  const count = await prisma.business.count({
    where: {
      ownerWhatsappNumber: from,
      active: true,
      ownerWhatsappOptInAt: { not: null },
    },
  });
  return count > 0;
}

async function textoEnClientes(
  message: InboundMessage
): Promise<ResultadoEnrutado> {
  const from = message.fromNumber;

  if (message.role !== "client" && (await esDuenoConocido(from))) {
    const digitos = (await numeroDeNegocios()).replace(/^\+/, "");
    return resultado(
      "texto:dueno-en-clientes",
      await responder(
        message,
        "dueno-en-clientes",
        mensajes.duenoEnClientes({ enlace: `https://wa.me/${digitos}` }),
        { unaVezAlDia: true }
      )
    );
  }

  if (message.role === "client") {
    // Fase 2: la recepcionista por chat. Si no puede atender (interruptor,
    // negocio sin recepcionista en Telnyx, suscripción bloqueada) se cae a
    // la respuesta fija de siempre.
    if (message.businessId && message.text) {
      const chat = await conversarConRecepcionista({
        message,
        businessId: message.businessId,
        texto: message.text,
      });
      if (chat.atendido) {
        return chat.resultado;
      }
    }
    const business = message.businessId
      ? await prisma.business.findUnique({
          where: { id: message.businessId },
          select: { name: true, phone: true, telnyxPhoneNumber: true },
        })
      : null;
    return resultado(
      "pendiente:texto:client",
      await responder(
        message,
        "cliente-conocido",
        mensajes.clienteConocido({
          negocio: business ? nombreParaCliente(business) : "el negocio",
          telefono: business ? telefonoDeContacto(business) : null,
        }),
        { unaVezAlDia: true }
      )
    );
  }

  return resultado(
    "texto:desconocido",
    await responder(
      message,
      "desconocido-clientes",
      mensajes.desconocidoEnClientes(),
      { unaVezAlDia: true }
    )
  );
}
