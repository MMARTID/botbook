export interface ProcessRecordingJob {
  callId: string;
  externalUrl: string;
  businessId: string;
}

export interface RetryFailedBookingJob {
  leadId: string;
  /** Vuelta del reintento diferido cuando el calendario sigue desconectado.
   * Acota cuántas veces se reprograma antes de dejarlo en manos del negocio. */
  attempt?: number;
}

export interface ReportUsageJob {
  businessId: string;
}

export interface SendEmailJob {
  fromAlias: "welcome" | "support";
  toAddress: string;
  subject: string;
  html: string;
  /** Clave de envío único. La rellena enqueueEmailJob a partir del id de la
   * tarea: el job la reclama antes de mandar nada, así una segunda entrega
   * de Cloud Tasks no duplica el correo. */
  idempotencyKey?: string;
}

export interface SendSmsJob {
  /** Número Telnyx del negocio (el que ya usa para recibir llamadas del
   * agente) — se reutiliza también como remitente del SMS, salvo que se use
   * el Alphanumeric Sender ID (ver `resolveSmsFromAddress`). */
  fromNumber: string;
  toNumber: string;
  text: string;
  /** Obligatorio en la API de Telnyx cuando `fromNumber` es un Alphanumeric
   * Sender ID en vez de un número — ver `resolveSmsMessagingProfileId`. */
  messagingProfileId?: string;
  /** Ver SendEmailJob.idempotencyKey. */
  idempotencyKey?: string;
}

/**
 * Forma legada del job de WhatsApp: plantilla por nombre + idioma y
 * parámetros ya construidos por quien encola. La siguen usando los envíos
 * que no pasan por `modules/whatsapp/mensajesCliente.ts`.
 */
/** «Recuérdamelo mañana» de un recado: volver a avisar si sigue sin atender. */
export interface RecordarRecadoJob {
  leadId: string;
  /** Número de recordatorio (1 = el primero); forma el recurso del aviso. */
  intento?: number;
}

export interface SendWhatsappJobLegado {
  toNumber: string;
  templateName: string;
  languageCode: string;
  /** Variables con nombre del body de la plantilla, con las claves exactas
   * aprobadas por Meta. */
  bodyParams: Record<string, string>;
  /** Ver SendEmailJob.idempotencyKey. */
  idempotencyKey?: string;
  /** Negocio al que pertenece el envío (para SentMessage y el contador). */
  businessId?: string;
  /** Desde qué número de Alhabla sale: "client" (por defecto) u "owner". */
  audience?: "client" | "owner";
}

/**
 * Mensajes al cliente por propósito (PR 4, lado cliente): el job relee la
 * reserva o el lead en el momento del envío y elige la plantilla aprobada
 * (`elegirPlantillaCliente`), así una cancelación o un cambio de hora entre
 * encolar y enviar no manda un mensaje falso.
 */
export interface SendWhatsappJobPorProposito {
  proposito: "confirmacion" | "recordatorio" | "hueco_libre";
  /** confirmacion / recordatorio. */
  bookingId?: string;
  /** hueco_libre. */
  leadId?: string;
  /** `Booking.programedAt` al encolar: si cambió, el job no envía. */
  programedAtMs?: number;
  toNumber: string;
  businessId: string;
  audience: "client";
  /** Ver SendEmailJob.idempotencyKey. */
  idempotencyKey?: string;
  /** Respaldo tras un failed diferido de la v2: salta el paso (a) de la
   * cascada y sale la plantilla aprobada. */
  sinV2?: boolean;
  /** Recordatorio a más de 29 días: número de reencolados ya hechos. */
  saltos?: number;
}

export type SendWhatsappJob =
  SendWhatsappJobLegado | SendWhatsappJobPorProposito;

export function esJobPorProposito(
  data: SendWhatsappJob
): data is SendWhatsappJobPorProposito {
  return "proposito" in data;
}
