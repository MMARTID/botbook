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
