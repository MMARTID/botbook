export type CallStatus = "INITIATED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "TIMED_OUT";

export type CallOutcome =
  | "RESOLVED"
  | "FRUSTRATED"
  | "NO_ANSWER"
  | "ESCALATED"
  | "LEAD_CAPTURED";

export type CallSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

export type WeekDay = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
export type ScheduleInterval = { start: string; end: string };
export type ScheduleDay = { enabled: boolean; intervals: ScheduleInterval[] };
export type BusinessSchedule = {
  version: 1;
  week: Record<WeekDay, ScheduleDay>;
};
export type AgentSettings = {
  version: 1;
  tone: "warm" | "professional" | "direct";
  primaryGoal: "bookings" | "customer_service" | "lead_capture";
  responseStyle: "concise" | "balanced";
  escalation: "take_message" | "request_callback";
  voiceGender: "femenina" | "masculina";
};

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
  agents?: Agent[];
  calls?: Call[];
};

export type PlanId = "inicio" | "pro" | "scale";

export type PlaceSearchResult = {
  placeId: string;
  name: string;
  address: string;
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
};

export type BookingService = {
  id: string;
  name: string;
  durationMinutes: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BookingProfessional = {
  id: string;
  name: string;
  active: boolean;
  serviceIds: string[];
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
  active?: boolean;
};

export type BookingProfessionalInput = {
  name: string;
  active?: boolean;
  serviceIds: string[];
};

export type CalendarEvent = {
  id: string | null;
  summary: string;
  start: string | null;
  end: string | null;
  location: string | null;
  htmlLink: string | null;
};

export type MicrosoftCalendarOption = {
  id: string;
  name: string;
  canEdit: boolean;
  canShare: boolean;
  ownerEmail: string | null;
};

export type UpcomingCalendarEventsResponse = {
  events: CalendarEvent[];
  provider: "google" | "outlook";
};

export type CalendarListItem = {
  id: string;
  name: string;
  primary: boolean;
};

export type CalendarListResponse = {
  provider: "google" | "outlook";
  selectedCalendarId: string | null;
  calendars: CalendarListItem[];
};

export type FileAttachment = {
  id: string;
  name: string;
  url?: string;
  pending?: boolean;
};

export type Agent = {
  id: string;
  businessId: string;
  vapiAssistantId: string | null;
  name: string;
  voice: string;
  language: string;
  systemPrompt: string;
  promptVersion: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  files?: FileAttachment[];
  calls?: Call[];
};

export type TranscriptMessage = {
  role?: string;
  content?: string;
  timestamp?: string;
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
  vapiUrl: string;
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
  professional?: { id: string; name: string } | null;
  service?: { id: string; name: string; durationMinutes: number } | null;
};

export type Call = {
  id: string;
  businessId: string;
  business?: Business;
  agentId: string | null;
  agent?: Agent | null;
  vapiCallId: string;
  status: CallStatus;
  outcome: CallOutcome | null;
  sentiment: CallSentiment | null;
  summary: string | null;
  successful: boolean | null;
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
};

export type OnboardingState = {
  steps: OnboardingSteps;
  progress: number;
  dismissedAt: string | null;
  completedAt: string | null;
  isActive: boolean;
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
  vapiPhoneNumberId: string | null;
};
