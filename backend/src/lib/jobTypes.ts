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
}
