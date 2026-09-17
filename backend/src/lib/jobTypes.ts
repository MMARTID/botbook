export interface ProcessRecordingJob {
  callId: string;
  externalUrl: string;
  businessId: string;
}

export interface RetryFailedBookingJob {
  leadId: string;
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

export interface SendWhatsappJob {
  toNumber: string;
  templateName: string;
  languageCode: string;
  /** Variables con nombre del body de la plantilla, con las claves exactas
   * aprobadas por Meta — ver WHATSAPP_TEMPLATE_CONFIRMATION_NAME /
   * WHATSAPP_TEMPLATE_REMINDER_NAME en voiceTools/service.ts. */
  bodyParams: Record<string, string>;
  /** Ver SendEmailJob.idempotencyKey. */
  idempotencyKey?: string;
}
