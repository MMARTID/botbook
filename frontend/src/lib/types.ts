export type CallStatus = "INITIATED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "TIMED_OUT";

export type CallOutcome =
  | "RESOLVED"
  | "FRUSTRATED"
  | "NO_ANSWER"
  | "ESCALATED"
  | "LEAD_CAPTURED";

export type CallSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

/**
 * Motivo por el que una llamada acabó escalada o sin completar la reserva,
 * clasificado por el análisis post-llamada de Retell.
 */
export type CallEscalationReason =
  | "CLIENTE_LO_PIDIO"
  | "FALLO_TECNICO"
  | "FUERA_DE_HORARIO"
  | "CONSULTA_COMPLEJA"
  | "NO_APLICA";

export type WeekDay = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
export type ScheduleInterval = { start: string; end: string };
export type ScheduleDay = { enabled: boolean; intervals: ScheduleInterval[] };
/** Día suelto que no sigue el patrón semanal: un festivo, un puente o un
 * horario especial. Sin esto, el agente daba por abierto el 25 de diciembre
 * por ser jueves y confirmaba citas para un negocio cerrado. */
export type ScheduleException = {
  /** Fecha local del negocio, YYYY-MM-DD. */
  date: string;
  closed: boolean;
  intervals: ScheduleInterval[];
  label?: string;
};

export type BusinessSchedule = {
  version: 1;
  week: Record<WeekDay, ScheduleDay>;
  /** Opcional: los horarios guardados antes de existir esto no la traen. */
  exceptions?: ScheduleException[];
};
export type AgentSettings = {
  version: 1;
  tone: "warm" | "professional" | "direct";
  primaryGoal: "bookings" | "customer_service" | "lead_capture";
  responseStyle: "concise" | "balanced";
  escalation: "take_message" | "request_callback";
  voiceGender: "femenina" | "masculina";
  languages: AgentLanguage[];
  /** Idioma real de la voz (TTS) — independiente de `languages` (qué
   * entiende el agente). Debe ser uno de los activados en `languages`. */
  voiceLanguage: VoiceLanguage;
};

export type AgentLanguage = "es-ES" | "en-GB" | "fr-FR" | "ca-ES";

/** Catalán queda fuera: sin voz Telnyx Ultra curada para ese idioma. */
export type VoiceLanguage = "es-ES" | "en-GB" | "fr-FR";

export type BusinessType =
  | "peluqueria"
  | "centro-de-estetica"
  | "salon-de-unas"
  | "barberia"
  | "fisioterapia"
  | "other";

export type Business = {
  id: string;
  name: string;
  phone: string;
  timezone: string;
  schedule: Record<string, unknown>;
  plan: "basic" | "pro" | "enterprise" | string;
  active: boolean;
  bookingCapacity: number;
  businessType?: BusinessType;
  createdAt: string;
  updatedAt: string;
  systemPrompt?: string;
  businessDetails?: string;
  /**
   * Identificador del negocio en Google Places y su dirección postal, tal y
   * como los eligió en el alta. El placeId alimenta el botón «Cómo llegar»
   * de la confirmación por WhatsApp al cliente. Opcionales porque un backend
   * anterior no los devuelve.
   */
  placeId?: string | null;
  address?: string | null;
  agentSettings?: AgentSettings | null;
  calendarProvider?: string | null;
  googleCalendarId?: string | null;
  googleCalendarConnected?: boolean;
  googleCalendarDisconnectedAt?: string | null;
  googleCalendarLastError?: string | null;
  outlookCalendarId?: string | null;
  outlookCalendarConnected?: boolean;
  outlookCalendarDisconnectedAt?: string | null;
  outlookCalendarLastError?: string | null;
  outlookUserEmail?: string | null;
  /**
   * Estado del proveedor de calendario activo, sin nombres de proveedor en
   * las claves (lo calcula el backend desde calendar_connections). Es el
   * contrato a usar en adelante; los campos google* y outlook* de arriba son
   * el antiguo y desaparecerán.
   */
  activeCalendar?: ActiveCalendar | null;
  subscriptionStatus?: SubscriptionStatus | null;
  /**
   * Fecha en la que se suspendieron las llamadas por impago. Mientras esté
   * puesta, el agente no atiende: es el estado más grave que puede tener un
   * negocio y hay que enseñarlo tal cual.
   */
  callsSuspendedAt?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  /**
   * Móvil del dueño para los avisos por WhatsApp (no es `phone`, el teléfono
   * del local). Opcional porque un backend anterior no lo devuelve: el alta
   * lo usa para saber si el PATCH lo guardó de verdad.
   */
  ownerWhatsappNumber?: string | null;
  ownerWhatsappOptInAt?: string | null;
  ownerWhatsappOptOutAt?: string | null;
  ownerWhatsappUnreachableAt?: string | null;
  agents?: Agent[];
  calls?: Call[];
};

/**
 * Estado del móvil del dueño en WhatsApp, tal y como lo calcula el backend.
 * - `sin_numero`: no ha puesto móvil.
 * - `pendiente`: hay móvil pero aún no ha dado el consentimiento desde él.
 * - `activo`: recibe avisos.
 * - `sin_whatsapp`: Meta no pudo entregar (el número no tiene WhatsApp).
 * - `baja`: escribió STOP; solo él puede reactivarlo desde el móvil.
 */
export type WhatsappOwnerStatus =
  | "sin_numero"
  | "pendiente"
  | "activo"
  | "sin_whatsapp"
  | "baja";

export type EstadoWhatsappDueno = {
  ownerWhatsappNumber: string | null;
  status: WhatsappOwnerStatus;
  optInAt: string | null;
  optInVia: "boton_plantilla" | "alta_codigo" | "alta_palabra" | null;
  optOutAt: string | null;
  unreachableAt: string | null;
  activationSentAt: string | null;
  /** `bienvenida_negocio` aprobada por Meta (hoy está PENDING). */
  templateApproved: boolean;
  /** Aprobada y con plan activo o en prueba: se puede enviar la plantilla. */
  canSendTemplate: boolean;
  /** Número de Alhabla para negocios, en E.164. */
  alhablaNumber: string;
  /** Mensaje «ALTA <código>» listo para enviar; `null` solo cuando está activo. */
  alta: { code: string; text: string; link: string; expiresAt: string } | null;
};

export type PlanId = "inicio" | "pro" | "scale";

export type PlaceSearchResult = {
  placeId: string;
  name: string;
  address: string;
  photoUrl: string | null;
};

/** Resultado de búsqueda de la demo pública: enriquecido con foto y tipo de negocio detectado. */
export type DemoPlaceSearchResult = PlaceSearchResult & {
  businessType: BusinessType;
  photoUrl: string | null;
};

export type PlaceDetails = {
  placeId: string;
  name: string;
  address: string;
  phone: string | null;
  schedule: Record<string, unknown>;
  types: string[];
};

export type SubscriptionStatus =
  | "INCOMPLETE"
  | "INCOMPLETE_EXPIRED"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "UNPAID"
  | "PAUSED";

export type BillingSummary = {
  planId: PlanId | null;
  legacyPlan: string;
  customerConfigured: boolean;
  subscriptionId: string | null;
  priceId: string | null;
  status: SubscriptionStatus | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  includedMinutes: number | null;
  extraMinuteCents: number | null;
  consumedMinutes: number;
  /** Plan efectivo resuelto en backend (priceId de Stripe o columna legacy). */
  effectivePlanId: PlanId;
  /** null = sin límite. */
  maxProfessionals: number | null;
  activeProfessionals: number;
  planFeatures: PlanFeatureKey[];
};

export type CallAnalytics = {
  days: number;
  totals: {
    calls: number;
    minutes: number;
    averageDurationSecs: number;
    bookings: number;
    cancelledBookings: number;
    waitlistLeads: number;
  };
  outcomes: Array<{ outcome: string; count: number }>;
  sentiments: Array<{ sentiment: string; count: number }>;
  byHour: Array<{ hour: number; count: number }>;
  /** 1 = lunes … 7 = domingo, en la zona horaria del negocio. */
  byWeekday: Array<{ weekday: number; count: number }>;
  topServices: Array<{ service: string; count: number }>;
};

export type PlanFeatureKey =
  | "recordatorios_cita"
  | "resumen_semanal"
  | "voz_idioma"
  | "analitica_avanzada"
  | "multi_sede";

export type BookingService = {
  id: string;
  name: string;
  durationMinutes: number;
  /** Céntimos. Opcional: un negocio puede trabajar sin tarifa publicada. */
  priceCents: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Nivel de un profesional en un servicio concreto. Ausencia de nivel = `normal`
 * («Lo hace»): si lo piden por su nombre, se reserva sin más.
 * - `especialista`: se le asigna primero cuando el cliente no pide a nadie.
 * - `no_sugerir`: solo si el cliente lo pide por su nombre; la recepcionista
 *   propone antes al más indicado. Es una nota interna del panel: el agente
 *   nunca se lo dice al cliente.
 */
export type ProfessionalServiceLevel = "especialista" | "normal" | "no_sugerir";

export type BookingProfessional = {
  id: string;
  name: string;
  active: boolean;
  /**
   * Legado: ids con nivel `especialista`. No usarlo para pintar el editor;
   * la fuente de verdad es `serviceLevels`.
   */
  serviceIds: string[];
  /**
   * Solo los servicios con nivel explícito. Un servicio que no aparece se
   * entiende como `normal` («Lo hace»).
   */
  serviceLevels: Record<string, Exclude<ProfessionalServiceLevel, "normal">>;
  createdAt: string;
  updatedAt: string;
};

export type BookingSettings = {
  bookingCapacity: number;
  services: BookingService[];
  professionals: BookingProfessional[];
};

export type BookingServiceInput = {
  name: string;
  durationMinutes: number;
  /** `null` borra el precio de un servicio que ya lo tenía. */
  priceCents?: number | null;
  active?: boolean;
};

export type BookingProfessionalInput = {
  name: string;
  active?: boolean;
  /**
   * Si se manda, es el mapa COMPLETO: reemplaza todos los vínculos con
   * servicios. `normal` equivale a no incluir el servicio. Si se omite, el
   * backend no toca los niveles que ya tuviera.
   */
  serviceLevels?: Record<string, ProfessionalServiceLevel>;
};

export type MicrosoftCalendarOption = {
  id: string;
  name: string;
  canEdit: boolean;
  canShare: boolean;
  ownerEmail: string | null;
};

export type CalendarListItem = {
  id: string;
  name: string;
  primary: boolean;
};

export type CalendarProviderId = "google" | "outlook" | "caldav";

export type ActiveCalendar = {
  provider: CalendarProviderId;
  connected: boolean;
  calendarId: string | null;
  accountEmail: string | null;
  disconnectedAt: string | null;
  lastError: string | null;
};

export type CalendarListResponse = {
  provider: CalendarProviderId;
  selectedCalendarId: string | null;
  calendars: CalendarListItem[];
};

/** Respuesta del alta de Apple/iCloud (y del callback de Outlook): la cuenta
 * ya está guardada y falta elegir calendario con selectCalendar(). */
export type CalendarAccountConnected = {
  calendars: CalendarListItem[];
  email: string | null;
};

export type Agent = {
  id: string;
  businessId: string;
  name: string;
  voice: string;
  language: string;
  systemPrompt: string;
  promptVersion: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  calls?: Call[];
};

export type TranscriptMessage = {
  role?: string;
  content?: string; // Retell
  text?: string; // Telnyx
  timestamp?: string;
  createdAt?: string;
  sentAt?: string;
};

export type Transcript = {
  id: string;
  callId: string;
  fullText: string;
  messages: TranscriptMessage[] | unknown;
  createdAt: string;
};

export type Recording = {
  id: string;
  callId: string;
  externalUrl: string;
  storageKey: string | null;
  storageUrl: string | null;
  reviewed: boolean;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Lead = {
  id: string;
  callId: string;
  type: string;
  data: Record<string, unknown> | unknown;
  isLead: boolean;
  createdAt: string;
};

export type CallBooking = {
  id: string;
  programedAt: string;
  durationMinutes: number;
  numberPeople: number;
  isCancelled: boolean;
  clientPhone: string | null;
  serviceIds: string[];
  professional?: { id: string; name: string } | null;
  /** Nombres resueltos de serviceIds — puede ser más de uno (ej. corte y mechas). */
  services?: {
    id: string;
    name: string;
    durationMinutes: number;
    /** Precio opcional: una cita solo muestra importe si todos lo conocen. */
    priceCents?: number | null;
  }[];
};

export type Call = {
  id: string;
  businessId: string;
  business?: Business;
  agentId: string | null;
  agent?: Agent | null;
  callId: string;
  fromNumber: string | null;
  status: CallStatus;
  outcome: CallOutcome | null;
  sentiment: CallSentiment | null;
  summary: string | null;
  successful: boolean | null;
  escalationReason: CallEscalationReason | null;
  toolFailureDetected: boolean | null;
  /** Nombre del servicio que pidió el cliente, tal y como lo llama el negocio. */
  requestedService: string | null;
  durationSecs: number | null;
  costCents: number | null;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  transcript?: Transcript | null;
  recording?: Recording | null;
  leads?: Lead[];
  booking?: CallBooking | null;
};

export type Paginated<T> = {
  data: T[];
  total: number;
  limit: number;
  offset: number;
};

export type AssistantOverrides = {
  backgroundSound?: "off" | "office" | string;
  maxDurationSeconds?: number;
  artifactPlan?: {
    recordingEnabled?: boolean;
    videoRecordingEnabled?: boolean;
    transcriptPlan?: {
      enabled?: boolean;
    };
    loggingEnabled?: boolean;
  };
  variableValues?: Record<string, string | number | boolean>;
};

export type CreateAgentPayload = {
  name: string;
};

export type OnboardingSteps = {
  schedule: boolean;
  services: boolean;
  professionals: boolean;
  calendar: boolean;
  /** Opcional: un backend anterior a la fase 1 de WhatsApp no lo devuelve. */
  whatsapp?: boolean;
  forwarding: boolean;
};

/**
 * `waiting_number`: el número aún no está activo (Telnyx tarda unos minutos
 * en aprobarlo), así que todavía no hay nada a lo que desviar.
 * `ready`: hay número activo y el desvío está pendiente.
 * `done`: entró una llamada real o el negocio confirmó haberlo activado.
 */
export type ForwardingStatus = "waiting_number" | "ready" | "done";

export type OnboardingForwarding = {
  status: ForwardingStatus;
  phoneNumber: string | null;
  confirmedAt: string | null;
  firstCallAt: string | null;
};

export type OnboardingState = {
  steps: OnboardingSteps;
  progress: number;
  dismissedAt: string | null;
  completedAt: string | null;
  isActive: boolean;
  forwarding: OnboardingForwarding;
  whatsapp?: {
    status: WhatsappOwnerStatus;
    ownerWhatsappNumber: string | null;
  };
};

export type AgendaService = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number | null;
};

/** Cita reservada por el agente, con cliente y servicios ya resueltos. */
export type AgendaBooking = {
  id: string;
  callId: string;
  programedAt: string;
  durationMinutes: number;
  numberPeople: number;
  clientPhone: string | null;
  professional: { id: string; name: string } | null;
  services: AgendaService[];
  externalEventId: string | null;
  externalCalendarProvider: string | null;
};

export type AgendaResponse = {
  from: string;
  until: string;
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  bookings: AgendaBooking[];
};

/** Cita que el cliente pidió y no llegó a reservarse por un fallo técnico. */
export type PendingBooking = {
  id: string;
  callId: string;
  createdAt: string;
  clientName: string | null;
  clientPhone: string | null;
  requestedAt: string | null;
  failureCode: string | null;
};

export type WeeklyStats = {
  from: string;
  to: string;
  calls: number;
  bookings: number;
  /** `null` si el negocio no tiene ningún precio configurado. */
  revenueCents: number | null;
  /** true si alguna cita del periodo incluye un servicio sin precio. */
  revenueIsPartial: boolean;
  pendingBookings: number;
  previous: {
    calls: number;
    bookings: number;
    revenueCents: number | null;
  };
};

export type BusinessStats = {
  totalCalls: number;
  totalMinutes: number;
  leads: number;
  bookings: number;
  week: WeeklyStats;
};

export type PhoneNumberStatus =
  | "pending"
  | "purchased"
  | "active"
  | "failed";

export type PhoneNumberInfo = {
  phoneNumber: string | null;
  sid: string | null;
  purchasedAt: string | null;
  status: PhoneNumberStatus | null;
};
