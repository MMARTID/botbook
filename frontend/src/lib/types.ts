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
  /** Los idiomas que habla (códigos del catálogo del backend). No se
   * eligen: los da el principal (PrincipalDelCatalogo.idiomas). */
  languages: AgentLanguage[];
  /** El idioma principal: en él saluda y de él salen la voz y los idiomas
   * que habla (la clave se llama así por compatibilidad). */
  voiceLanguage: VoiceLanguage;
  /** La voz elegida entre las de su principal (id del catálogo del
   * backend; ver VistaPreviaDeIdiomas.voces). Sin valor, o si deja de
   * poder atender, atiende la de por defecto de su género. */
  voz?: string;
  /** «Cuándo pasarme llamadas» (fase 4 del plan de telefonía). Sin valor,
   * el backend aplica el de por defecto (ver lib/pasar-llamadas.ts). */
  pasarLlamadas?: ModoDePasarLlamadas;
};

export type ModoDePasarLlamadas = "nunca" | "si_lo_pide" | "siempre";

/** Código BCP-47 de un idioma de atención («es-ES», «ca-ES»…). Los define
 * el catálogo del backend (backend/src/lib/idiomas/catalogo.ts); el panel
 * los recibe de GET /business/me/idiomas en vez de repetirlos aquí. */
export type AgentLanguage = string;

/** El idioma principal: el español, una lengua cooficial o un idioma
 * extranjero (ver CatalogoDeIdiomas). */
export type VoiceLanguage = AgentLanguage;

/** De qué voces se elige: «ultra», las nativas del principal (español → las
 * de España, inglés → las británicas…); «soniox», las de un principal
 * cooficial (Marta y Sergio). */
export type FamiliaDeVoces = "ultra" | "soniox";

/** Una voz que se puede elegir. */
export type VozDelPanel = {
  id: string;
  nombre: string;
  genero: AgentSettings["voiceGender"];
  /** Cómo suena, en español («Cálida y acogedora»). */
  descripcion: string;
  /** De atención al cliente: se enseña sin desplegar «Ver todas las
   * voces». */
  recomendada: boolean;
  /** La que atiende si el dueño no elige (una por género). */
  porDefecto: boolean;
  /** Ruta de su muestra en la app (public/voces). */
  muestra: string;
};

/** Un idioma principal que se puede elegir, con lo que va con él. `idiomas`,
 * `entradilla` y `requiere` son opcionales: Vercel publica la app antes de
 * que Cloud Run sirva el backend que los manda. */
export type PrincipalDelCatalogo = {
  codigo: AgentLanguage;
  etiqueta: string;
  /** Cómo lo agrupa el panel: el obligatorio y las cooficiales a la vista;
   * los extranjeros bajo «Otro idioma». */
  tipo: "obligatorio" | "cooficial" | "extranjero";
  /** Los que habla con este principal, en el orden del catálogo: lo que se
   * guarda en `languages` al elegirlo. */
  idiomas?: AgentLanguage[];
  /** «Habla en 7 idiomas: español, inglés, … Saluda en español y sigue en
   * el idioma de quien llama.» */
  entradilla?: string;
  /** Si elegirlo exige una función del plan (catalán, euskera y gallego,
   * en Pro y Scale): la clave de `planFeatures` y el texto del candado. */
  requiere?: { funcion: PlanFeatureKey; texto: string } | null;
  /** De qué familia son sus `voces`. */
  familia: FamiliaDeVoces;
  /** Las voces que atienden con este principal. Por género, mujeres
   * primero: la de por defecto, luego las recomendadas y luego el resto. */
  voces: VozDelPanel[];
};

/** GET /business/me/idiomas: lo que se ofrece en el panel. */
export type CatalogoDeIdiomas = {
  obligatorio: { codigo: AgentLanguage; etiqueta: string };
  principales: PrincipalDelCatalogo[];
  /** Etiquetas de todos los idiomas, también los que ya no se ofrecen. */
  etiquetas: Record<AgentLanguage, string>;
};

/** POST /business/me/idiomas/previsualizar: qué hará la recepcionista. */
export type VistaPreviaDeIdiomas = {
  /** Los que habla con el principal, tal como se guardarán. */
  languages: AgentLanguage[];
  /** El idioma principal. */
  voiceLanguage: VoiceLanguage;
  /** La voz que atenderá y su género. */
  voz: string;
  voiceGender: AgentSettings["voiceGender"];
  /** De qué familia son `voces`: «soniox» con un principal cooficial. */
  familia: FamiliaDeVoces;
  /** Las voces que se pueden elegir con este principal (entre ellas,
   * `voz`). */
  voces: VozDelPanel[];
  /** «Habla en 7 idiomas: … Saluda en español y sigue en el idioma de
   * quien llama.» */
  entradilla: string;
  saludo: string;
  avisos: string[];
};

export type BusinessType =
  | "peluqueria"
  | "centro-de-estetica"
  | "salon-de-unas"
  | "barberia"
  | "fisioterapia"
  | "other";

/** Tipos de línea de clientes (docs/historico/PLAN-TELEFONIA-UX.md § 3): fijo
 * del local,
 * móvil de trabajo, móvil personal o el número de Alhabla como principal. */
export type CustomerLineType =
  | "fijo"
  | "movil_trabajo"
  | "movil_personal"
  | "alhabla";

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
  /** Preferencias de avisos por WhatsApp; el PATCH las fusiona con las guardadas. */
  notificationPrefs?: { avisoPorReserva?: boolean } | null;
  /** Conversaciones de la fase 2 (Beta): el Gestor y la recepcionista por chat. */
  ownerChatEnabled?: boolean;
  clientChatEnabled?: boolean;
  /**
   * Telefonía sin confusión (docs/historico/PLAN-TELEFONIA-UX.md § 1): tipo de
   * la línea de
   * clientes (`phone`). null = el dueño aún no lo ha confirmado.
   */
  customerLineType?: CustomerLineType | null;
  /** Caso C: los avisos van al mismo móvil al que llaman los clientes. */
  ownerPhoneIsCustomerLine?: boolean;
  /** Privacidad: la recepcionista no da el número del negocio; toma recado. */
  hideOwnerNumberFromClients?: boolean;
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
  /** Aviso por cada reserva nueva (por defecto `true`); el resto de avisos van siempre. */
  avisoPorReserva: boolean;
  /** Mensaje «ALTA <código>» listo para enviar; `null` solo cuando está activo. */
  alta: { code: string; text: string; link: string; expiresAt: string } | null;
};

/** «Tu Gestor» en el panel (fase 2 / PR 5): lo que devuelve GET /business/me/gestor. */
export type MensajeDelGestor = {
  de: "dueno" | "gestor";
  texto: string;
  en: string | null;
};

export type PropuestaDelGestor = {
  id: string;
  resumen: string;
  expiresAt: string;
  botones: { confirmar: string; cancelar: string };
};

export type EstadoDelGestor = {
  disponible: boolean;
  activoEnNegocio: boolean;
  whatsapp: WhatsappOwnerStatus;
  mensajes: MensajeDelGestor[];
  propuesta: PropuestaDelGestor | null;
};

export type RespuestaDelGestor = {
  ok: true;
  respuesta: string;
  propuesta: PropuestaDelGestor | null;
};

/** Una propuesta del Gestor y qué pasó con ella («Cambios del gestor»). */
export type CambioDelGestor = {
  id: string;
  resumen: string;
  estado: "pendiente" | "en_curso" | "hecho" | "fallido" | "descartado" | "sustituido" | "caducado";
  /** Cuándo pasó a ese estado; en «pendiente», cuándo se propuso. */
  en: string;
  /** Solo en «pendiente»: hasta cuándo vale el botón. */
  caduca: string | null;
};

export type DecisionDelGestor = {
  ok: true;
  estado: "ejecutada" | "fallida" | "rechazada";
  mensaje: string;
  propuesta: PropuestaDelGestor | null;
  seguimiento: string | null;
};

export type PlanId = "inicio" | "pro" | "scale";

export type PlaceSearchResult = {
  placeId: string;
  name: string;
  address: string;
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
  /** Día × hora local, solo celdas con llamadas. Opcional: un backend
   * anterior no lo manda y el mapa de calor sale vacío. */
  byWeekdayHour?: Array<{ weekday: number; hour: number; count: number }>;
  topServices: Array<{ service: string; count: number }>;
};

export type PlanFeatureKey =
  | "recordatorios_cita"
  | "resumen_semanal"
  /** Catalán, euskera o gallego como idioma principal (Pro y Scale). */
  | "lenguas_locales"
  /** La de antes de «lenguas_locales»: el backend la manda también durante
   * el despliegue del 2026-10-05 (y el anterior, en su lugar). */
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
  /** Opcional: un backend anterior al escritorio de octubre no lo manda. */
  clientName?: string | null;
  programedAt: string;
  durationMinutes: number;
  numberPeople: number;
  isCancelled: boolean;
  /** Cancelada porque el cliente la cambió: id de la reserva nueva. */
  rescheduledToId?: string | null;
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

/**
 * Recado que dejó la recepcionista en una llamada (Lead tipo `message`):
 * el cliente espera que le devuelvan la llamada. `atendidoAt` null = por
 * devolver. Opcional en `Call` porque un backend anterior no lo devuelve.
 */
export type CallRecado = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  motivo: string | null;
  atendidoAt: string | null;
};

export type FiltroDeLlamadas = "todas" | "con_cita" | "por_devolver" | "sin_cita";

export type CanalDeLlamada = "voz" | "whatsapp";
export type OrdenDeLlamadas = "reciente" | "antigua" | "mas_larga" | "mas_corta";

/** Los filtros del historial de escritorio; la exportación a CSV usa los
 * mismos, para que el fichero sea exactamente lo que se ve en la tabla. */
export type ConsultaDeLlamadas = {
  filtro?: FiltroDeLlamadas;
  canal?: CanalDeLlamada;
  sentimiento?: CallSentiment;
  desde?: string;
  hasta?: string;
  q?: string;
  orden?: OrdenDeLlamadas;
};

export type Call = {
  id: string;
  businessId: string;
  business?: Business;
  agentId: string | null;
  /** Solo lo que pinta el panel: el backend nunca manda la fila entera del
   * agente (ni su prompt) dentro de una llamada. */
  agent?: Pick<Agent, "id" | "name" | "voice"> | null;
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
  /** "telnyx" | "retell" para llamadas; "whatsapp" para chats con la recepcionista. */
  voiceProvider: string;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  transcript?: Transcript | null;
  recording?: Recording | null;
  leads?: Lead[];
  booking?: CallBooking | null;
  recado?: CallRecado | null;
};

export type Paginated<T> = {
  data: T[];
  total: number;
  limit: number;
  offset: number;
};

/** Página del historial de llamadas. `filtro` y `conteos` solo llegan de un
 * backend que ya sabe de recados (2026-10): sin ellos, la app móvil no
 * enseña los filtros ni la insignia de «por devolver». */
export type PaginaDeLlamadas = Paginated<Call> & {
  filtro?: FiltroDeLlamadas;
  conteos?: { todas: number; conCita: number; porDevolver: number };
  /** Solo con `resumen=hoy`: lo del día en la zona del negocio. */
  hoy?: { desde: string; llamadas: number; conCita: number; duracionMediaSecs: number | null };
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
  /** Última «Comprobar desvío» que entró de verdad; null = nunca. Opcional:
   * un backend anterior a la fase 3 del plan de telefonía no lo devuelve. */
  checkedAt?: string | null;
  /** Línea de clientes (`Business.phone`) a la que llama la comprobación;
   * null mientras sea el placeholder del registro. Opcional, como arriba. */
  customerLine?: string | null;
};

/** Por qué no ha funcionado «Comprobar desvío»
 * (docs/historico/PLAN-TELEFONIA-UX.md § 4). */
export type ForwardingCheckFailureReason =
  | "la_has_cogido"
  | "comunicando"
  | "sin_desvio"
  | "desconocido";

export type ForwardingCheckResult =
  | { estado: "ok" }
  | { estado: "fallo"; motivo: ForwardingCheckFailureReason };

/** Estado de una comprobación de desvío; `resultado` es null mientras dura. */
export type ForwardingCheck = {
  id: string;
  linea: string;
  startedAt: string;
  resultado: ForwardingCheckResult | null;
  resueltaAt: string | null;
};

/** `code` con el que el backend rechaza arrancar una comprobación. */
export type ForwardingCheckErrorCode =
  | "sin_numero"
  | "linea_de_clientes_invalida"
  | "linea_no_admitida"
  | "comprobacion_en_curso"
  | "limite_alcanzado"
  | "telefonia_no_configurada"
  | "no_se_pudo_llamar";

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
  /** Opcionales: un backend anterior al escritorio de octubre no los manda. */
  clientName?: string | null;
  createdAt?: string;
  /** "voice" (o null) | "client_chat" | "owner_chat" | "whatsapp_lista_espera". */
  createdVia?: string | null;
  /** La conversación en la que se reservó; null si la apuntó el dueño. */
  origen?: { canal: CanalDeLlamada; startedAt: string; durationSecs: number | null } | null;
};

/** Lo que vuelve al mover o cancelar una cita desde la agenda. */
export type ResultadoDeCita = {
  ok: true;
  mensaje: string;
  /** Solo si se le puede escribir por WhatsApp (móvil, número y sin baja). */
  avisoAlCliente: { telefono: string; cliente: string | null } | null;
  yaCancelada?: boolean;
  cita?: { id: string; programedAt: string; professional: { id: string; name: string } | null };
};

/** Resultados del buscador del panel (⌘K). */
export type ResultadosDeBusqueda = {
  citas: Array<{
    id: string;
    programedAt: string;
    durationMinutes: number;
    clientName: string | null;
    clientPhone: string | null;
    servicios: string[];
    profesional: string | null;
  }>;
  llamadas: Array<{
    id: string;
    startedAt: string;
    fromNumber: string | null;
    canal: CanalDeLlamada;
    durationSecs: number | null;
    resumen: string | null;
    conCita: boolean;
  }>;
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
  /** Llamadas de voz; los chats de WhatsApp van en `chats`. */
  calls: number;
  /** Conversaciones de WhatsApp con la recepcionista. */
  chats: number;
  /** Llamadas y chats que acabaron con cita, aunque luego se moviera o cancelara. */
  conversationsWithBooking: number;
  bookings: number;
  /** `null` si el negocio no tiene ningún precio configurado. */
  revenueCents: number | null;
  /** true si alguna cita del periodo incluye un servicio sin precio. */
  revenueIsPartial: boolean;
  pendingBookings: number;
  previous: {
    calls: number;
    chats: number;
    conversationsWithBooking: number;
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
