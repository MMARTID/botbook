import type { WhatsAppContactCard } from "../../adapters/whatsapp/WhatsAppAdapter.js";
import { nombreParaElCliente } from "../../lib/nombreProfesional.js";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import { reclamarEnvio } from "../../lib/messageIdempotency.js";
import { enqueueWhatsappJob } from "../../lib/cloudTasks.js";
import { PermanentJobError } from "../../lib/jobErrors.js";
import type { SendWhatsappJobPorProposito } from "../../lib/jobTypes.js";
import { formatearTelefonoLegible, isValidE164Phone } from "../../lib/phone.js";
import { planAllows, resolvePlanId } from "../../lib/planFeatures.js";
import {
  enviarPlantilla,
  refrescarPlantilla,
  resolverPlantilla,
  resolverRemitente,
  type PlantillaResuelta,
} from "./service.js";
import {
  describirServicio,
  formatearCita,
  nombreDeServicios,
} from "./avisosNegocio.js";
import { estaDadoDeBaja, WhatsappOptOutError } from "./bajas.js";

/**
 * Mensajes al cliente por WhatsApp (PLAN-CANAL-DUENO.md § 3, § 5 y § 9),
 * fase 1 / PR 4: la confirmación tras reservar, el recordatorio 24 h antes y
 * el aviso de hueco libre de la lista de espera. Aquí viven los parámetros
 * de CADA plantilla (Meta rechaza en diferido cualquier clave de más o de
 * menos: no hay reintento posible), la cascada que elige la plantilla
 * aprobada en el momento del envío (v2 con botones → aprobada actual →
 * variable de entorno) y el job que relee la reserva o el lead antes de
 * enviar, para no mandar un mensaje que ya no dice la verdad.
 *
 * Nunca importa `voiceTools/service.ts`; `voiceTools` y `listaDeEspera` son
 * los que llaman aquí.
 */

/** `cambio` y `cancelacion` (fase 2 / PR 4): avisos que el dueño pide
 * enviar desde el chat con el Gestor tras mover o cancelar una cita. */
export type PropositoCliente =
  "confirmacion" | "recordatorio" | "hueco_libre" | "cambio" | "cancelacion";

export interface ContextoCita {
  negocio: {
    id: string;
    name: string;
    timezone: string;
    telnyxPhoneNumber: string | null;
    phone: string;
    /** Privacidad (caso C): sin número en ningún mensaje al cliente. */
    hideOwnerNumberFromClients?: boolean;
    placeId: string | null;
  };
  startDateTime: Date;
  serviceNames: string[];
  professionalName: string | null;
}

export interface PlantillaElegida {
  /** "confirmacion_cita_v2" | "confirmacion_cita" | "recordatorio_cita_v2" |
   * "recordatorio_cita" | "hueco_libre" | "hora_disponible" |
   * "cambio_cita_cliente" | "cancelacion_cita_cliente" | "env:<nombre>";
   * va al log y decide los efectos sobre el lead. */
  etiqueta: string;
  template: { id: string } | { name: string; language: string };
  /** Nombre real de la fila (o el de la variable de entorno): se pasa a
   * `enviarPlantilla` para que `SentMessage.templateName` quede escrito. */
  templateName: string;
  templateLanguage: string;
  bodyParams: Record<string, string>;
  buttonUrlParams?: Array<{ index: number; text: string }>;
  /** hueco_libre / recordatorio_cita_v2 / confirmacion_cita_v2 = true. */
  conBotones: boolean;
}

export type MotivoSinPlantilla = "SIN_PLANTILLA" | "SIN_TELEFONO";

/** Antelación del recordatorio al cliente. */
export const REMINDER_LEAD_HOURS = 24;
const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;
/** Un recordatorio que ya casi toca no se programa (ni a destiempo). */
const MARGEN_RECORDATORIO_MS = 5 * 60 * 1000;
/** Cloud Tasks rechaza tareas a más de 30 días: se programa a 29 y el job
 * se reencola a sí mismo hasta llegar. */
const HORIZONTE_CLOUD_TASKS_MS = 29 * DIA_MS;
const MAX_SALTOS_RECORDATORIO = 12;
/** Recordatorio entregado con menos de esto por delante: ya no es «mañana». */
const MINIMO_RECORDATORIO_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

/**
 * Nombre del negocio tal como lo lee el CLIENTE: sin saltos ni espacios
 * seguidos, recortado a 60, y con respaldo «el negocio» (nunca «tu negocio»,
 * que es lo que `nombreParaWhatsapp` devuelve para el dueño: el cliente
 * leería «gestiono las reservas de tu negocio»).
 */
export function nombreParaCliente(negocio: { name: string }): string {
  const limpio = negocio.name.replace(/\s+/g, " ").trim();
  if (!limpio || limpio.startsWith("Negocio de ") || limpio.includes("@")) {
    return "el negocio";
  }
  return limpio.length > 60 ? limpio.slice(0, 60).trimEnd() : limpio;
}

/**
 * Teléfono al que el cliente puede llamar: el número que atiende la
 * recepcionista (Telnyx), formateado; si no, `phone` si es E.164 real (no el
 * `TEMP-` del registro); si no, null (los textos tienen variante).
 *
 * Con `hideOwnerNumberFromClients` (PLAN-TELEFONIA-UX.md § 3, caso C: «no
 * des mi número a los clientes») lo que se oculta es la línea del dueño
 * (`phone`): el número de Alhabla lo atiende la recepcionista, que toma el
 * recado, así que sigue dándose (todas las plantillas de confirmación,
 * cambio y cancelación exigen `negocio_telefono`; sin él el cliente no
 * recibiría nada después de que la recepcionista le prometiera el WhatsApp).
 * Solo sin número de Alhabla devuelve null, y las variantes sin teléfono
 * («llama directamente a …», o la plantilla sin `negocio_telefono`) hacen el
 * resto. El cliente siempre puede responder por WhatsApp.
 */
export function telefonoDeContacto(negocio: {
  telnyxPhoneNumber: string | null;
  phone: string;
  hideOwnerNumberFromClients?: boolean;
}): string | null {
  if (negocio.telnyxPhoneNumber) {
    return formatearTelefonoLegible(negocio.telnyxPhoneNumber);
  }
  if (
    negocio.hideOwnerNumberFromClients !== true &&
    negocio.phone &&
    !negocio.phone.startsWith("TEMP-") &&
    isValidE164Phone(negocio.phone)
  ) {
    return negocio.phone;
  }
  return null;
}

const PLACE_ID_REGEX = /^[A-Za-z0-9_-]{1,512}$/;

/** El `placeId` viaja dentro de una URL de plantilla: solo su alfabeto. */
export function placeIdValido(
  value: string | null | undefined,
  businessId = "?"
): string | null {
  if (!value) {
    return null;
  }
  if (PLACE_ID_REGEX.test(value)) {
    return value;
  }
  console.warn(
    `[WhatsApp] placeId del negocio ${businessId} con caracteres fuera de [A-Za-z0-9_-]; se trata como ausente`
  );
  return null;
}

let avisadoIndiceUrlPorDefecto = false;

/**
 * Posición del botón URL «Cómo llegar» dentro de `BUTTONS` de la plantilla,
 * derivada de los `components` de Meta tal como los guardó la
 * sincronización. Sin `components`, sin `BUTTONS` o sin botón `URL` se
 * devuelve 1 (la definición enviada a Meta: «Guardar contacto» QUICK_REPLY en
 * 0, «Cómo llegar» URL en 1), con un aviso una vez por proceso.
 */
export function indiceDelBotonUrl(components: unknown): number {
  if (Array.isArray(components)) {
    for (const componente of components) {
      if (
        componente &&
        typeof componente === "object" &&
        String((componente as { type?: unknown }).type).toUpperCase() ===
          "BUTTONS" &&
        Array.isArray((componente as { buttons?: unknown }).buttons)
      ) {
        const botones = (componente as { buttons: unknown[] }).buttons;
        const indice = botones.findIndex(
          (b) =>
            b &&
            typeof b === "object" &&
            String((b as { type?: unknown }).type).toUpperCase() === "URL"
        );
        if (indice >= 0) {
          return indice;
        }
      }
    }
  }
  if (!avisadoIndiceUrlPorDefecto) {
    avisadoIndiceUrlPorDefecto = true;
    console.warn(
      "[WhatsApp] confirmacion_cita_v2 sin components o sin botón URL en la fila; se usa el índice 1 por defecto"
    );
  }
  return 1;
}

/** Solo para tests: vuelve a avisar del índice por defecto. */
export function reiniciarAvisoDeIndiceUrl(): void {
  avisadoIndiceUrlPorDefecto = false;
}

/**
 * Texto controlado por el usuario (nombre del cliente por voz, perfil de
 * WhatsApp): una línea, sin espacios seguidos, 80 caracteres; vacío ⇒ null.
 */
export function sanearNombre(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const limpio = value.replace(/\s+/g, " ").trim().slice(0, 80).trim();
  return limpio || null;
}

/** «corte y mechas con Laura» / «corte» / «lo que pediste con Laura» / «lo que pediste». */
export function describirServicioParaCliente(
  serviceNames: string[],
  professionalName: string | null
): string {
  const servicios = serviceNames.map((n) => n.trim()).filter(Boolean);
  const base =
    servicios.length === 0
      ? "lo que pediste"
      : servicios.length === 1
        ? servicios[0]
        : `${servicios.slice(0, -1).join(", ")} y ${servicios[servicios.length - 1]}`;
  const profesional = professionalName?.trim();
  return profesional ? `${base} con ${profesional}` : base;
}

/** «jue, 24 sept» — el mismo formato que usaban las plantillas antiguas. */
export function fechaCorta(fecha: Date, tz: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: tz || "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(fecha);
}

/** «17:00». */
export function horaCorta(fecha: Date, tz: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: tz || "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  }).format(fecha);
}

function fechaCivil(fecha: Date, tz: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: tz || "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

/** ¿Caen en el mismo día civil de la zona del negocio? */
export function mismaFechaCivil(a: Date, b: Date, tz: string): boolean {
  return fechaCivil(a, tz) === fechaCivil(b, tz);
}

/** Meta rechaza un parámetro vacío o con saltos de línea. */
function limpiarParametros(
  params: Record<string, string>
): Record<string, string> {
  const limpios: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(params)) {
    limpios[clave] = valor.replace(/\s+/g, " ").trim();
  }
  return limpios;
}

// Funciones de parámetros, una por plantilla, con el conjunto EXACTO de
// claves que aprobó Meta. Los tests fijan las claves de cada una.

/** confirmacion_cita_v2 (PENDING): 4 parámetros. */
export function parametrosConfirmacionV2(
  ctx: ContextoCita,
  telefono: string
): Record<string, string> {
  return limpiarParametros({
    negocio_nombre: nombreParaCliente(ctx.negocio),
    servicio: describirServicioParaCliente(
      ctx.serviceNames,
      ctx.professionalName
    ),
    cita: formatearCita(ctx.startDateTime, ctx.negocio.timezone),
    negocio_telefono: telefono,
  });
}

/** confirmacion_cita es_ES (APPROVED, con cabecera): 5 parámetros, SIN
 * profesional (va dentro de `servicios`). */
export function parametrosConfirmacionConCabecera(
  ctx: ContextoCita,
  telefono: string
): Record<string, string> {
  return limpiarParametros({
    negocio_nombre: nombreParaCliente(ctx.negocio),
    servicios: describirServicio(ctx.serviceNames, ctx.professionalName),
    fecha_cita: fechaCorta(ctx.startDateTime, ctx.negocio.timezone),
    hora_cita: horaCorta(ctx.startDateTime, ctx.negocio.timezone),
    negocio_telefono: telefono,
  });
}

/** confirmacion_cita es / recordatorio_cita es / variables de entorno: los 6
 * parámetros de siempre. */
export function parametrosAntiguos(
  ctx: ContextoCita,
  telefono: string
): Record<string, string> {
  return limpiarParametros({
    negocio_nombre: nombreParaCliente(ctx.negocio),
    servicios: ctx.serviceNames.filter(Boolean).join(" + ") || "tu cita",
    fecha_cita: fechaCorta(ctx.startDateTime, ctx.negocio.timezone),
    hora_cita: horaCorta(ctx.startDateTime, ctx.negocio.timezone),
    profesional: ctx.professionalName || "nuestro equipo",
    negocio_telefono: telefono,
  });
}

/** recordatorio_cita_v2 (PENDING): 3 parámetros. */
export function parametrosRecordatorioV2(
  ctx: ContextoCita
): Record<string, string> {
  return limpiarParametros({
    negocio_nombre: nombreParaCliente(ctx.negocio),
    servicio: describirServicioParaCliente(
      ctx.serviceNames,
      ctx.professionalName
    ),
    cita: formatearCita(ctx.startDateTime, ctx.negocio.timezone),
  });
}

/** cambio_cita_cliente (PENDING): 4 parámetros; `cita` es la hora NUEVA. */
export function parametrosCambio(
  ctx: ContextoCita,
  telefono: string
): Record<string, string> {
  return limpiarParametros({
    negocio_nombre: nombreParaCliente(ctx.negocio),
    servicio: describirServicioParaCliente(
      ctx.serviceNames,
      ctx.professionalName
    ),
    cita: formatearCita(ctx.startDateTime, ctx.negocio.timezone),
    negocio_telefono: telefono,
  });
}

/** cancelacion_cita_cliente (PENDING): 3 parámetros; `cita` es la hora que
 * tenía la cita cancelada. */
export function parametrosCancelacion(
  ctx: ContextoCita,
  telefono: string
): Record<string, string> {
  return limpiarParametros({
    negocio_nombre: nombreParaCliente(ctx.negocio),
    cita: formatearCita(ctx.startDateTime, ctx.negocio.timezone),
    negocio_telefono: telefono,
  });
}

/** hueco_libre (PENDING): 2 parámetros. */
export function parametrosHuecoLibre(
  ctx: ContextoCita
): Record<string, string> {
  return limpiarParametros({
    negocio_nombre: nombreParaCliente(ctx.negocio),
    cita: formatearCita(ctx.startDateTime, ctx.negocio.timezone),
  });
}

/** hora_disponible es (APPROVED, MARKETING): 4 parámetros. */
export function parametrosHoraDisponible(
  ctx: ContextoCita,
  telefono: string
): Record<string, string> {
  return limpiarParametros({
    negocio_nombre: nombreParaCliente(ctx.negocio),
    fecha_cita: fechaCorta(ctx.startDateTime, ctx.negocio.timezone),
    hora_cita: horaCorta(ctx.startDateTime, ctx.negocio.timezone),
    negocio_telefono: telefono,
  });
}

// ---------------------------------------------------------------------------
// Elección de plantilla
// ---------------------------------------------------------------------------

function porFila(
  etiqueta: string,
  fila: PlantillaResuelta,
  bodyParams: Record<string, string>,
  conBotones: boolean,
  buttonUrlParams?: Array<{ index: number; text: string }>
): PlantillaElegida {
  return {
    etiqueta,
    template: { id: fila.telnyxTemplateId },
    templateName: fila.name,
    templateLanguage: fila.language,
    bodyParams,
    ...(buttonUrlParams ? { buttonUrlParams } : {}),
    conBotones,
  };
}

function porVariableDeEntorno(
  nombre: string,
  bodyParams: Record<string, string>
): PlantillaElegida {
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "es";
  return {
    etiqueta: `env:${nombre}`,
    template: { name: nombre, language },
    templateName: nombre,
    templateLanguage: language,
    bodyParams,
    conBotones: false,
  };
}

/**
 * Cascada por propósito: la primera fila `APPROVED` en `WhatsappTemplate`
 * que cumpla su requisito gana; después la variable de entorno; después
 * nada. Antes de resolver cada clave se llama a `refrescarPlantilla` (solo
 * va al WABA si la fila lleva > 24 h sin sincronizar, con enfriamiento tras
 * fallo): una v2 aprobada entra sola en ≤ 24 h aunque el webhook de plantilla
 * no llegue, y una pausada deja de elegirse en ese mismo plazo. Si la
 * plantilla exige `negocio_telefono` y el negocio no tiene teléfono de
 * contacto, se salta; si por eso no queda ninguna, `SIN_TELEFONO`.
 */
export async function elegirPlantillaCliente(
  proposito: PropositoCliente,
  ctx: ContextoCita,
  opciones: { sinV2?: boolean; recursoId?: string } = {}
): Promise<PlantillaElegida | { motivo: MotivoSinPlantilla }> {
  const telefono = telefonoDeContacto(ctx.negocio);
  let saltadaPorTelefono = false;
  const sinTelefono = () => {
    saltadaPorTelefono = true;
    return null;
  };
  const resolver = async (key: string) => {
    await refrescarPlantilla(key);
    return resolverPlantilla({ key });
  };

  if (proposito === "confirmacion") {
    if (!opciones.sinV2) {
      const v2 = await resolver("confirmacion_cita_v2");
      if (v2) {
        const placeId = placeIdValido(ctx.negocio.placeId, ctx.negocio.id);
        if (!placeId) {
          console.log(
            `[WhatsApp] Negocio ${ctx.negocio.id} sin placeId: la confirmación de la reserva ${opciones.recursoId ?? "?"} sale con confirmacion_cita en vez de la v2`
          );
        } else if (!telefono) {
          sinTelefono();
        } else {
          return porFila(
            "confirmacion_cita_v2",
            v2,
            parametrosConfirmacionV2(ctx, telefono),
            true,
            [{ index: indiceDelBotonUrl(v2.components), text: placeId }]
          );
        }
      }
    }
    const aprobada = await resolver("confirmacion_cita");
    if (aprobada) {
      if (!telefono) {
        sinTelefono();
      } else {
        return porFila(
          "confirmacion_cita",
          aprobada,
          parametrosConfirmacionConCabecera(ctx, telefono),
          false
        );
      }
    }
    const nombreEnv = process.env.WHATSAPP_TEMPLATE_CONFIRMATION_NAME;
    if (nombreEnv) {
      if (!telefono) {
        sinTelefono();
      } else {
        return porVariableDeEntorno(
          nombreEnv,
          parametrosAntiguos(ctx, telefono)
        );
      }
    }
    return { motivo: saltadaPorTelefono ? "SIN_TELEFONO" : "SIN_PLANTILLA" };
  }

  if (proposito === "recordatorio") {
    const v2 = await resolver("recordatorio_cita_v2");
    if (v2) {
      return porFila(
        "recordatorio_cita_v2",
        v2,
        parametrosRecordatorioV2(ctx),
        true
      );
    }
    const aprobada = await resolver("recordatorio_cita");
    if (aprobada) {
      if (!telefono) {
        sinTelefono();
      } else {
        return porFila(
          "recordatorio_cita",
          aprobada,
          parametrosAntiguos(ctx, telefono),
          false
        );
      }
    }
    const nombreEnv = process.env.WHATSAPP_TEMPLATE_REMINDER_NAME;
    if (nombreEnv) {
      if (!telefono) {
        sinTelefono();
      } else {
        return porVariableDeEntorno(
          nombreEnv,
          parametrosAntiguos(ctx, telefono)
        );
      }
    }
    return { motivo: saltadaPorTelefono ? "SIN_TELEFONO" : "SIN_PLANTILLA" };
  }

  if (proposito === "cambio" || proposito === "cancelacion") {
    // Sin v2 ni variable de entorno: solo existen estas plantillas (ambas
    // llevan el teléfono del negocio, así que sin él no salen).
    const key =
      proposito === "cambio"
        ? "cambio_cita_cliente"
        : "cancelacion_cita_cliente";
    const fila = await resolver(key);
    if (fila) {
      if (!telefono) {
        sinTelefono();
      } else {
        return porFila(
          key,
          fila,
          proposito === "cambio"
            ? parametrosCambio(ctx, telefono)
            : parametrosCancelacion(ctx, telefono),
          true
        );
      }
    }
    return { motivo: saltadaPorTelefono ? "SIN_TELEFONO" : "SIN_PLANTILLA" };
  }

  // hueco_libre
  const huecoLibre = await resolver("hueco_libre");
  if (huecoLibre) {
    return porFila("hueco_libre", huecoLibre, parametrosHuecoLibre(ctx), true);
  }
  const horaDisponible = await resolver("hora_disponible");
  if (horaDisponible) {
    if (!telefono) {
      sinTelefono();
    } else {
      return porFila(
        "hora_disponible",
        horaDisponible,
        parametrosHoraDisponible(ctx, telefono),
        false
      );
    }
  }
  const nombreEnv = process.env.WHATSAPP_TEMPLATE_SLOT_AVAILABLE_NAME;
  if (nombreEnv) {
    if (!telefono) {
      sinTelefono();
    } else {
      return porVariableDeEntorno(
        nombreEnv,
        parametrosHoraDisponible(ctx, telefono)
      );
    }
  }
  return { motivo: saltadaPorTelefono ? "SIN_TELEFONO" : "SIN_PLANTILLA" };
}

// ---------------------------------------------------------------------------
// Programación (tras reservar)
// ---------------------------------------------------------------------------

function esTareaRepetida(error: unknown): boolean {
  // gRPC ALREADY_EXISTS: reintento del webhook de tool o cambio A→B→A dentro
  // de la misma llamada (límite conocido).
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 6
  );
}

export function epochSegundos(fecha: Date): number {
  return Math.floor(fecha.getTime() / 1000);
}

/**
 * Encola la confirmación y, si el plan lo permite y la cita queda a más de
 * 24 h, el recordatorio. Nunca lanza. Devuelve si la confirmación quedó
 * programada, para que la recepcionista solo prometa el WhatsApp cuando de
 * verdad va a salir: sin consentimiento, sin número válido, sin
 * `telnyxPhoneNumber`, con la reserva cancelada, el negocio inactivo o el
 * número dado de baja (STOP) no se encola nada y se devuelve `no`. Un STOP
 * previo NO se revoca por consentimiento de voz (decisión de producto: STOP
 * es una orden dada en WhatsApp y solo se levanta con ALTA en el chat).
 */
export async function programarMensajesAlCliente(input: {
  bookingId: string;
  etiqueta: string;
  /** true por defecto. `false` = solo el recordatorio (lista de espera). */
  confirmacion?: boolean;
}): Promise<{ confirmacion: "programada" | "no"; motivo?: string }> {
  const conConfirmacion = input.confirmacion !== false;
  const sinMensajes = (motivo: string) => {
    console.log(
      `[WhatsApp] Reserva ${input.bookingId}: sin mensajes al cliente (${motivo})`
    );
    return { confirmacion: "no" as const, motivo };
  };

  let booking;
  let business;
  try {
    booking = await prisma.booking.findUnique({
      where: { id: input.bookingId },
      select: {
        id: true,
        programedAt: true,
        smsConsent: true,
        clientPhone: true,
        isCancelled: true,
        call: { select: { fromNumber: true, businessId: true } },
      },
    });
    if (!booking) {
      return sinMensajes("reserva inexistente");
    }
    business = await prisma.business.findUnique({
      where: { id: booking.call.businessId },
      select: {
        id: true,
        plan: true,
        stripePriceId: true,
        telnyxPhoneNumber: true,
        phone: true,
        active: true,
      },
    });
  } catch (error) {
    console.error(
      `[WhatsApp] Reserva ${input.bookingId} (${input.etiqueta}): no se pudo leer para programar los mensajes al cliente: ${errorMessage(error)}`
    );
    return { confirmacion: "no", motivo: "error de lectura" };
  }
  if (!business || !business.active) {
    return sinMensajes("negocio inexistente o inactivo");
  }
  if (booking.isCancelled) {
    return sinMensajes("reserva cancelada");
  }
  if (!booking.smsConsent) {
    return sinMensajes("sin consentimiento");
  }
  const to = booking.clientPhone ?? booking.call.fromNumber;
  if (!to || !isValidE164Phone(to)) {
    return sinMensajes("sin número válido");
  }
  if (!business.telnyxPhoneNumber) {
    return sinMensajes("el negocio no tiene número de teléfono");
  }
  if (await estaDadoDeBaja("client", to)) {
    return sinMensajes("el número pidió STOP");
  }

  const now = Date.now();
  const epoch = epochSegundos(booking.programedAt);
  let confirmacion: "programada" | "no" = conConfirmacion ? "no" : "programada";
  let motivo: string | undefined;

  if (conConfirmacion) {
    const taskId = `booking-${booking.id}-confirmacion-${epoch}`;
    try {
      await enqueueWhatsappJob(
        {
          proposito: "confirmacion",
          bookingId: booking.id,
          programedAtMs: booking.programedAt.getTime(),
          toNumber: to,
          businessId: business.id,
          audience: "client",
        },
        { taskId }
      );
      confirmacion = "programada";
    } catch (error) {
      if (esTareaRepetida(error)) {
        console.log(
          `[WhatsApp] Reserva ${booking.id}: confirmacion ya programado (tarea repetida)`
        );
        confirmacion = "programada";
      } else {
        motivo = errorMessage(error);
        console.error(
          `[WhatsApp] Reserva ${booking.id} (negocio ${business.id}, ${input.etiqueta}): no se pudo encolar la confirmación al cliente: ${motivo}`
        );
      }
    }
  }

  // El recordatorio es feature de Pro/Scale; se lee de la BD, no de la caché
  // de voz, que puede ser anterior a un cambio de plan.
  const reminderAllowed = planAllows(
    resolvePlanId({
      plan: business.plan,
      stripePriceId: business.stripePriceId,
    }),
    "recordatorios_cita"
  );
  if (reminderAllowed) {
    const reminderAt =
      booking.programedAt.getTime() - REMINDER_LEAD_HOURS * HORA_MS;
    if (reminderAt <= now + MARGEN_RECORDATORIO_MS) {
      console.log(
        `[WhatsApp] Reserva ${booking.id}: sin recordatorio (la cita queda a menos de ${REMINDER_LEAD_HOURS} h)`
      );
    } else {
      const scheduleTime = new Date(
        Math.min(reminderAt, now + HORIZONTE_CLOUD_TASKS_MS)
      );
      try {
        await enqueueWhatsappJob(
          {
            proposito: "recordatorio",
            bookingId: booking.id,
            programedAtMs: booking.programedAt.getTime(),
            toNumber: to,
            businessId: business.id,
            audience: "client",
            saltos: 0,
          },
          {
            taskId: `booking-${booking.id}-recordatorio-${epoch}`,
            scheduleTime,
          }
        );
      } catch (error) {
        if (esTareaRepetida(error)) {
          console.log(
            `[WhatsApp] Reserva ${booking.id}: recordatorio ya programado (tarea repetida)`
          );
        } else {
          console.error(
            `[WhatsApp] Reserva ${booking.id} (negocio ${business.id}, ${input.etiqueta}): no se pudo encolar el recordatorio al cliente: ${errorMessage(error)}`
          );
        }
      }
    }
  }

  return motivo ? { confirmacion, motivo } : { confirmacion };
}

/**
 * Aviso de cambio o de cancelación que el dueño pide desde el chat con el
 * Gestor (fase 2 / PR 4, acción `avisar_cliente`). Mismas condiciones que la
 * confirmación (consentimiento, número válido, sin STOP, negocio con
 * número), pero una cancelación se manda sobre una reserva YA cancelada.
 * Una tarea por petición (`-<epoch de ahora>`): si el dueño lo pide dos
 * veces, sale dos veces, que es lo que ha pedido.
 */
export async function programarAvisoAlCliente(input: {
  bookingId: string;
  proposito: "cambio" | "cancelacion";
  etiqueta: string;
}): Promise<{ programado: true } | { programado: false; motivo: string }> {
  const sinAviso = (motivo: string) => {
    console.log(
      `[WhatsApp] Reserva ${input.bookingId}: sin aviso de ${input.proposito} al cliente (${motivo})`
    );
    return { programado: false as const, motivo };
  };
  let booking;
  let business;
  try {
    booking = await prisma.booking.findUnique({
      where: { id: input.bookingId },
      select: {
        id: true,
        programedAt: true,
        smsConsent: true,
        clientPhone: true,
        isCancelled: true,
        call: { select: { fromNumber: true, businessId: true } },
      },
    });
    if (!booking) {
      return sinAviso("reserva inexistente");
    }
    business = await prisma.business.findUnique({
      where: { id: booking.call.businessId },
      select: { id: true, telnyxPhoneNumber: true, active: true },
    });
  } catch (error) {
    console.error(
      `[WhatsApp] Reserva ${input.bookingId} (${input.etiqueta}): no se pudo leer para programar el aviso de ${input.proposito}: ${errorMessage(error)}`
    );
    return sinAviso("error de lectura");
  }
  if (!business || !business.active) {
    return sinAviso("negocio inexistente o inactivo");
  }
  if (booking.isCancelled !== (input.proposito === "cancelacion")) {
    return sinAviso(
      booking.isCancelled ? "reserva cancelada" : "la reserva sigue activa"
    );
  }
  if (!booking.smsConsent) {
    return sinAviso("sin consentimiento");
  }
  const to = booking.clientPhone ?? booking.call.fromNumber;
  if (!to || !isValidE164Phone(to)) {
    return sinAviso("sin número válido");
  }
  if (!business.telnyxPhoneNumber) {
    return sinAviso("el negocio no tiene número de teléfono");
  }
  if (await estaDadoDeBaja("client", to)) {
    return sinAviso("el número pidió STOP");
  }
  try {
    await enqueueWhatsappJob(
      {
        proposito: input.proposito,
        bookingId: booking.id,
        ...(input.proposito === "cambio"
          ? { programedAtMs: booking.programedAt.getTime() }
          : {}),
        toNumber: to,
        businessId: business.id,
        audience: "client",
      },
      {
        taskId: `booking-${booking.id}-${input.proposito}-${epochSegundos(new Date())}`,
      }
    );
    return { programado: true };
  } catch (error) {
    const motivo = errorMessage(error);
    console.error(
      `[WhatsApp] Reserva ${booking.id} (negocio ${business.id}, ${input.etiqueta}): no se pudo encolar el aviso de ${input.proposito} al cliente: ${motivo}`
    );
    return sinAviso(motivo);
  }
}

// ---------------------------------------------------------------------------
// Envío (cuerpo del job send-whatsapp para la forma por propósito)
// ---------------------------------------------------------------------------

async function marcarFila(
  idempotencyKey: string | undefined,
  data: {
    deliveryStatus: string;
    errorCode: string;
    errorDetail?: string;
  },
  soloSinProveedor = false
): Promise<void> {
  if (!idempotencyKey) {
    return;
  }
  try {
    await prisma.sentMessage.updateMany({
      where: {
        channel: "whatsapp",
        idempotencyKey,
        ...(soloSinProveedor ? { providerMessageId: null } : {}),
      },
      data,
    });
  } catch (error) {
    console.error(
      `[Job] No se pudo marcar la fila ${idempotencyKey} como ${data.deliveryStatus}: ${errorMessage(error)}`
    );
  }
}

/** Revierte el reclamo del lead («encolado») cuando el job no llega a enviar. */
async function revertirOfertaDelLead(
  leadId: string,
  motivo: string
): Promise<void> {
  try {
    await prisma.lead.updateMany({
      where: { id: leadId, resolvedAt: null, notifiedVia: "encolado" },
      data: {
        notifiedAt: null,
        notifiedVia: `ninguna:${motivo}`.slice(0, 200),
      },
    });
  } catch (error) {
    console.error(
      `[Job] No se pudo revertir la oferta del lead ${leadId} (${motivo}): ${errorMessage(error)}`
    );
  }
}

async function cerrarLead(
  leadId: string,
  data: Record<string, unknown>,
  resolvedBy: string
): Promise<void> {
  try {
    await prisma.lead.update({
      where: { id: leadId },
      data: { resolvedAt: new Date(), data: { ...data, resolvedBy } },
    });
  } catch (error) {
    console.error(
      `[Job] No se pudo cerrar el lead ${leadId} (${resolvedBy}): ${errorMessage(error)}`
    );
  }
}

function esErrorDeBaja(error: unknown): boolean {
  return (
    error instanceof WhatsappOptOutError ||
    (error as { code?: unknown } | null)?.code === "WHATSAPP_OPT_OUT"
  );
}

const SELECT_NEGOCIO_CLIENTE = {
  id: true,
  name: true,
  timezone: true,
  telnyxPhoneNumber: true,
  phone: true,
  hideOwnerNumberFromClients: true,
  placeId: true,
  active: true,
} as const;

async function nombreDelProfesional(
  professionalId: string | null | undefined,
  businessId: string
): Promise<string | null> {
  if (!professionalId) {
    return null;
  }
  const professional = await prisma.professional.findFirst({
    where: { id: professionalId, businessId },
    select: { name: true },
  });
  return nombreParaElCliente(professional?.name);
}

/**
 * Envía un mensaje al cliente en el momento del job: relee la reserva o el
 * lead (descarta con fila `skipped` lo que ya no dice la verdad), elige la
 * plantilla aprobada, envía y aplica los efectos. Solo `enviarPlantilla` va
 * dentro del `try/catch` que marca `failed` y relanza; los efectos
 * posteriores loguean y NO relanzan (el mensaje ya salió, un reintento lo
 * duplicaría).
 */
export async function enviarMensajeAlCliente(
  data: SendWhatsappJobPorProposito
): Promise<void> {
  const { proposito, businessId, toNumber: to, idempotencyKey } = data;
  const now = new Date();

  // Recordatorio a más de 29 días: reencolar sin tocar SentMessage.
  if (proposito === "recordatorio" && data.programedAtMs !== undefined) {
    const reminderAt = data.programedAtMs - REMINDER_LEAD_HOURS * HORA_MS;
    if (reminderAt > now.getTime() + MARGEN_RECORDATORIO_MS) {
      const saltos = (data.saltos ?? 0) + 1;
      if (saltos > MAX_SALTOS_RECORDATORIO) {
        console.error(
          `[Job] Recordatorio de la reserva ${data.bookingId} a más de un año (${saltos - 1} saltos); no se reencola`
        );
        return;
      }
      const epoch = Math.floor(data.programedAtMs / 1000);
      // La clave de la fila es la documentada (sin `-s<n>`): el taskId del
      // salto solo nombra la tarea; `enqueueWhatsappJob` respeta la clave
      // que ya viene en el payload.
      await enqueueWhatsappJob(
        {
          ...data,
          saltos,
          idempotencyKey:
            data.idempotencyKey ??
            `booking-${data.bookingId}-recordatorio-${epoch}`,
        },
        {
          taskId: `booking-${data.bookingId}-recordatorio-${epoch}-s${saltos}`,
          scheduleTime: new Date(
            Math.min(reminderAt, now.getTime() + HORIZONTE_CLOUD_TASKS_MS)
          ),
        }
      );
      console.log(
        `[Job] Recordatorio de la reserva ${data.bookingId} a más de 29 días: salto ${saltos}`
      );
      return;
    }
  }

  const recursoId =
    proposito === "hueco_libre" ? (data.leadId ?? "") : (data.bookingId ?? "");
  const callbackData =
    proposito === "hueco_libre"
      ? `cliente:hueco:${recursoId}`
      : `cliente:${proposito}:${recursoId}`;
  const reclamado = await reclamarEnvio(
    "whatsapp",
    idempotencyKey,
    {
      businessId,
      audience: "client",
      toNumber: to,
      callbackData,
      kind: "template",
    },
    { reintentarFallidos: true }
  );
  if (!reclamado) {
    return;
  }

  const descartar = async (errorCode: string, errorDetail: string) => {
    console.log(
      `[Job] ${proposito} de ${recursoId} (negocio ${businessId}) descartado: ${errorCode} — ${errorDetail}`
    );
    await marcarFila(idempotencyKey, {
      deliveryStatus: "skipped",
      errorCode,
      errorDetail,
    });
  };

  // Relectura y contexto.
  let ctx: ContextoCita;
  let leadData: Record<string, unknown> | null = null;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: SELECT_NEGOCIO_CLIENTE,
  });
  if (!business || !business.active) {
    await descartar(
      proposito === "hueco_libre" ? "AVISO_CERRADO" : "RESERVA_INEXISTENTE",
      "negocio inexistente o inactivo"
    );
    return;
  }

  if (proposito === "hueco_libre") {
    const lead = await prisma.lead.findFirst({
      where: {
        id: recursoId,
        type: "availability_watch",
        call: { businessId },
      },
      select: { id: true, resolvedAt: true, data: true },
    });
    if (!lead) {
      await descartar("AVISO_CERRADO", "el aviso no existe en este negocio");
      return;
    }
    if (lead.resolvedAt) {
      await descartar("AVISO_CERRADO", "el aviso ya estaba cerrado");
      return;
    }
    leadData = (lead.data as Record<string, unknown> | null) ?? {};
    if (leadData.clientPhone !== to) {
      // El destino viaja en el payload de la tarea; si el aviso ya no es de
      // ese número, no se le manda la hora de otra persona.
      await descartar("DESTINO_CAMBIADO", "el aviso ya no es de este número");
      return;
    }
    const startDateTime = new Date(String(leadData.startDateTime));
    if (Number.isNaN(startDateTime.getTime()) || startDateTime < now) {
      await cerrarLead(lead.id, leadData, "pasado");
      await descartar("HORA_PASADA", "la hora pedida ya pasó");
      return;
    }
    const serviceIds = Array.isArray(leadData.serviceIds)
      ? leadData.serviceIds.filter((id): id is string => typeof id === "string")
      : [];
    ctx = {
      negocio: business,
      startDateTime,
      serviceNames: await nombreDeServicios(serviceIds),
      professionalName: await nombreDelProfesional(
        typeof leadData.professionalId === "string"
          ? leadData.professionalId
          : null,
        businessId
      ),
    };
  } else {
    const booking = await prisma.booking.findFirst({
      where: { id: recursoId, call: { businessId } },
      include: {
        call: { select: { fromNumber: true } },
        professional: { select: { name: true } },
      },
    });
    if (!booking) {
      await descartar(
        "RESERVA_INEXISTENTE",
        "la reserva no existe en este negocio"
      );
      return;
    }
    if (booking.isCancelled && proposito !== "cancelacion") {
      await descartar("RESERVA_CANCELADA", "la reserva está cancelada");
      return;
    }
    if (proposito === "cancelacion" && !booking.isCancelled) {
      // Se volvió a activar (o nunca se canceló): avisar de una cancelación
      // que no existe sería peor que no avisar.
      await descartar("RESERVA_ACTIVA", "la reserva no está cancelada");
      return;
    }
    if (
      data.programedAtMs !== undefined &&
      booking.programedAt.getTime() !== data.programedAtMs
    ) {
      await descartar("HORA_CAMBIADA", "la cita cambió de hora tras encolar");
      return;
    }
    // El `update` del upsert de book_appointment cambia `clientPhone` dentro
    // de la misma llamada (número mal transcrito y corregido): la tarea ya
    // encolada lleva el número viejo y mandaría la cita de B a A. La
    // titularidad es la misma que usan los botones y cancel_appointment.
    const titular = booking.clientPhone ?? booking.call.fromNumber;
    if (titular !== to) {
      await descartar("DESTINO_CAMBIADO", "la reserva ya no es de este número");
      return;
    }
    if (booking.smsConsent === false) {
      await descartar(
        "SIN_CONSENTIMIENTO",
        "la reserva no tiene consentimiento"
      );
      return;
    }
    if (
      proposito === "recordatorio" &&
      (booking.programedAt.getTime() - now.getTime() < MINIMO_RECORDATORIO_MS ||
        mismaFechaCivil(now, booking.programedAt, business.timezone))
    ) {
      await descartar(
        "RECORDATORIO_TARDIO",
        "el recordatorio llegó el mismo día de la cita o con menos de una hora"
      );
      return;
    }
    ctx = {
      negocio: business,
      startDateTime: booking.programedAt,
      serviceNames: await nombreDeServicios(booking.serviceIds),
      professionalName: nombreParaElCliente(booking.professional?.name),
    };
  }

  const elegida = await elegirPlantillaCliente(proposito, ctx, {
    sinV2: data.sinV2,
    recursoId,
  });
  if ("motivo" in elegida) {
    console.error(
      `[WhatsApp] ${proposito} de ${recursoId} (negocio ${businessId}) sin plantilla aprobada ni variable de entorno (${elegida.motivo})`
    );
    await marcarFila(idempotencyKey, {
      deliveryStatus: "skipped",
      errorCode: elegida.motivo,
      errorDetail: "sin plantilla aprobada ni variable de entorno",
    });
    if (proposito === "hueco_libre") {
      await revertirOfertaDelLead(recursoId, elegida.motivo);
    }
    throw new PermanentJobError(elegida.motivo, elegida.motivo.toLowerCase());
  }

  console.log(
    `[Job] Enviando WhatsApp ${elegida.etiqueta} (${proposito}) a ${to} (negocio ${businessId}, ${recursoId})`
  );
  try {
    await enviarPlantilla({
      audience: "client",
      to,
      businessId,
      template: elegida.template,
      templateName: elegida.templateName,
      templateLanguage: elegida.templateLanguage,
      bodyParams: elegida.bodyParams,
      buttonUrlParams: elegida.buttonUrlParams,
      idempotencyKey,
      callbackData,
    });
  } catch (error) {
    if (esErrorDeBaja(error)) {
      console.log(
        `[Job] WhatsApp ${proposito} a ${to} descartado: el número pidió la baja`
      );
      if (proposito === "hueco_libre" && leadData) {
        await cerrarLead(recursoId, leadData, "baja");
      }
      return;
    }
    const motivo = errorMessage(error);
    console.error(
      `[Job] No se pudo enviar ${elegida.etiqueta} (${proposito}) a ${to} (negocio ${businessId}, ${recursoId}): ${motivo}`
    );
    await marcarFila(
      idempotencyKey,
      {
        deliveryStatus: "failed",
        errorCode: "SEND_ERROR",
        errorDetail: motivo,
      },
      true
    );
    if (proposito === "hueco_libre") {
      await revertirOfertaDelLead(recursoId, "SEND_ERROR");
    }
    throw error;
  }

  // Efectos tras enviar: nunca relanzan.
  try {
    if (
      proposito === "confirmacion" ||
      proposito === "cambio" ||
      proposito === "cancelacion"
    ) {
      await prisma.booking.update({
        where: { id: recursoId },
        data: { clientNotifiedAt: new Date() },
      });
    } else if (proposito === "hueco_libre") {
      const via =
        elegida.etiqueta === "hueco_libre"
          ? "plantilla:hueco_libre"
          : elegida.etiqueta === "hora_disponible"
            ? "plantilla:hora_disponible"
            : "plantilla:env";
      await prisma.lead.update({
        where: { id: recursoId },
        data: {
          notifiedAt: new Date(),
          notifiedVia: via,
          ...(elegida.conBotones ? {} : { resolvedAt: new Date() }),
        },
      });
    }
  } catch (error) {
    console.error(
      `[Job] ${proposito} de ${recursoId} (negocio ${businessId}) enviado, pero no se pudieron anotar sus efectos: ${errorMessage(error)}`
    );
  }
}

// ---------------------------------------------------------------------------
// vCard
// ---------------------------------------------------------------------------

/** Tarjeta de contacto «Alhabla Reservas»: solo datos de Alhabla. */
export const TARJETA_ALHABLA_RESERVAS = (
  numero: string
): WhatsAppContactCard => ({
  formattedName: "Alhabla Reservas",
  firstName: "Alhabla Reservas",
  company: "Alhabla",
  phones: [{ number: numero, type: "WORK" }],
  urls: [{ url: "https://alhabla.ai", type: "WORK" }],
});

/** Número del remitente de clientes, para la vCard. */
export async function numeroDeClientes(): Promise<string> {
  return (await resolverRemitente("client")).phoneNumber;
}
