export interface ProcessRecordingJob {
  callId: string;
  vapiUrl: string;
  businessId: string;
}

export interface RetryFailedBookingJob {
  leadId: string;
}

export interface SendEmailJob {
  fromAlias: "welcome" | "support";
  toAddress: string;
  subject: string;
  html: string;
}

export interface SendSmsJob {
  /** Número Telnyx del negocio (el que ya usa para recibir llamadas del
   * agente) — se reutiliza también como remitente del SMS. */
  fromNumber: string;
  toNumber: string;
  text: string;
}
