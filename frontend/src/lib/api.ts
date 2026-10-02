import axios from "axios";
import type {
  AgendaResponse,
  BusinessStats,
  PendingBooking,
  BookingProfessional,
  BookingProfessionalInput,
  BookingService,
  BookingServiceInput,
  BookingSettings,
  BillingSummary,
  Business,
  CalendarListResponse,
  Call,
  CallAnalytics,
  CallRecado,
  ConsultaDeLlamadas,
  FiltroDeLlamadas,
  OnboardingState,
  ForwardingCheck,
  PaginaDeLlamadas,
  ResultadoDeCita,
  ResultadosDeBusqueda,
  PhoneNumberInfo,
  PlanId,
  PlaceDetails,
  PlaceSearchResult,
  CalendarAccountConnected,
  EstadoWhatsappDueno,
  EstadoDelGestor,
  RespuestaDelGestor,
  DecisionDelGestor,
} from "./types";

const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

// Sin esta variable, el bundle cae en el rewrite de next.config.mjs, que
// apunta a http://localhost:3000 — en Vercel eso es la propia función
// serverless, así que ninguna pantalla carga nada y la app queda muda. Ya
// pasó dos veces en producción, así que ahora rompe el build en vez de
// desplegarse rota: es preferible un despliegue fallido a uno silencioso.
if (!configuredBaseUrl && process.env.NODE_ENV === "production") {
  throw new Error(
    "Falta NEXT_PUBLIC_API_BASE_URL. En producción el frontend tiene que apuntar al backend real (https://api.alhabla.ai); el rewrite a localhost:3000 solo vale en desarrollo.",
  );
}

export const api = axios.create({
  baseURL: configuredBaseUrl ?? "/api/backend",
});

api.interceptors.request.use((config) => {
  if (typeof window === "undefined") {
    return config;
  }

  const token =
    window.localStorage.getItem("alhabla_token") ??
    window.localStorage.getItem("token") ??
    window.localStorage.getItem("jwt");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export async function getMyBusiness() {
  const { data } = await api.get<Business>("/business/me");
  return data;
}

export async function getGoogleAuthUrl(
  acceptedTerms?: boolean,
  intent: "login" | "register" = "login"
) {
  const { data } = await api.get<{ url: string }>("/auth/google", {
    params: {
      intent,
      ...(acceptedTerms ? { acceptedTerms: "true" } : {}),
    },
  });
  return data.url;
}

/**
 * Pide el enlace de restablecimiento. El backend responde igual exista o no
 * la cuenta, así que aquí no hay nada que distinguir: solo confirmar que la
 * petición llegó.
 */
export async function requestPasswordReset(email: string) {
  const { data } = await api.post<{ message: string }>("/auth/forgot-password", { email });
  return data;
}

/** Devuelve la sesión ya iniciada: recibir el enlace demuestra que el buzón es suyo. */
export async function resetPassword(input: { token: string; password: string }) {
  const { data } = await api.post<{ message: string; token: string }>("/auth/reset-password", input);
  return data;
}

/** Canjea el pase de un solo uso con el que la web pública manda a la app
 * tras crear la cuenta (docs/historico/PLAN-APP-DOMINIO.md § 3). Devuelve el
 * JWT. */
export async function redeemPass(pase: string) {
  const { data } = await api.post<{ token: string }>("/auth/pase/canjear", { pase });
  return data.token;
}

export async function consumeGoogleSession() {
  const { data } = await api.post<{ token: string }>("/auth/google/session", undefined, {
    withCredentials: true,
  });
  return data.token;
}

export async function getFacebookAuthUrl(
  acceptedTerms?: boolean,
  intent: "login" | "register" = "login"
) {
  const { data } = await api.get<{ url: string }>("/auth/facebook", {
    params: {
      intent,
      ...(acceptedTerms ? { acceptedTerms: "true" } : {}),
    },
  });
  return data.url;
}

export async function consumeFacebookSession() {
  const { data } = await api.post<{ token: string }>("/auth/facebook/session", undefined, {
    withCredentials: true,
  });
  return data.token;
}

export async function updateMyBusiness(payload: Partial<Business>) {
  const { data } = await api.patch<Business>("/business/me", payload);
  return data;
}

export async function getStats() {
  const { data } = await api.get<BusinessStats>("/business/me/stats");
  return data;
}

/** Próximas citas reservadas por el agente, con cliente y servicios resueltos.
 * Con `desde` (un instante), la ventana de `days` empieza ahí y no ahora. */
export async function getAgenda(
  days = 7,
  limit = 20,
  offset = 0,
  desde?: string,
  profesionalId?: string
) {
  const { data } = await api.get<AgendaResponse>("/business/me/agenda", {
    params: {
      days,
      limit,
      offset,
      ...(desde ? { desde } : {}),
      ...(profesionalId ? { profesionalId } : {}),
    },
  });
  return data;
}

/** Mover una cita (o solo comprobar si cabe, con `soloComprobar`): la misma
 * operación que «mover_cita» del Gestor. `fechaHora` en hora del negocio. */
export async function moverCita(
  id: string,
  cuerpo: { fechaHora: string; profesionalId?: string; soloComprobar?: boolean }
) {
  const { data } = await api.post<ResultadoDeCita | { ok: true }>(
    `/business/me/bookings/${encodeURIComponent(id)}/mover`,
    cuerpo
  );
  return data;
}

export async function cancelarCita(id: string) {
  const { data } = await api.post<ResultadoDeCita>(
    `/business/me/bookings/${encodeURIComponent(id)}/cancelar`
  );
  return data;
}

/** «Avisar por WhatsApp» del cambio o la cancelación de una cita. */
export async function avisarClienteDeCita(id: string, tipo: "cambio" | "cancelacion") {
  const { data } = await api.post<{ ok: true; mensaje: string }>(
    `/business/me/bookings/${encodeURIComponent(id)}/avisar`,
    { tipo }
  );
  return data;
}

/** Buscador del panel (⌘K): citas y conversaciones. */
export async function buscarEnElNegocio(q: string) {
  const { data } = await api.get<ResultadosDeBusqueda>("/business/me/buscar", {
    params: { q },
  });
  return data;
}

/** Citas que se cayeron por un fallo técnico y siguen sin resolverse. */
export async function getPendingBookings() {
  const { data } = await api.get<{ pendingBookings: PendingBooking[] }>(
    "/business/me/pending-bookings"
  );
  return data.pendingBookings;
}

/** «Ya la he confirmado»: el dueño apuntó a mano la cita que se cayó. */
export async function resolverCitaPendiente(id: string) {
  const { data } = await api.post<{ ok: true; yaResuelta: boolean }>(
    `/business/me/pending-bookings/${encodeURIComponent(id)}/resolver`
  );
  return data;
}

export async function getBillingSummary() {
  const { data } = await api.get<BillingSummary>("/billing/summary");
  return data;
}

/** Analítica avanzada de llamadas (plan Scale) — 403 PLAN_LIMIT_ANALYTICS si el plan no la incluye. */
export async function getCallAnalytics(days = 30) {
  const { data } = await api.get<CallAnalytics>("/business/me/calls/analytics", {
    params: { days },
  });
  return data;
}

export async function createCheckoutSession(planId: PlanId) {
  const { data } = await api.post<{ clientSecret: string }>("/billing/checkout-session", {
    planId,
  });
  return data;
}

export async function createBillingPortalSession() {
  const { data } = await api.post<{ url: string }>("/billing/portal-session");
  return data;
}

export async function reconcileCheckoutSession(sessionId: string) {
  const { data } = await api.post<BillingSummary>(
    `/billing/checkout-session/${encodeURIComponent(sessionId)}/reconcile`,
  );
  return data;
}

export async function getCalls(
  limit = 100,
  offset = 0,
  filtro?: FiltroDeLlamadas
) {
  const { data } = await api.get<PaginaDeLlamadas>(`/business/me/calls`, {
    params: filtro ? { limit, offset, filtro } : { limit, offset },
  });
  return data;
}

/** Sin los valores vacíos: la URL de la petición queda limpia. */
function parametrosDeConsulta(consulta: ConsultaDeLlamadas) {
  return Object.fromEntries(
    Object.entries(consulta).filter(([, valor]) => valor !== undefined && valor !== "")
  );
}

/** El historial de escritorio: filtros combinables y el resumen de hoy. */
export async function getLlamadas(
  consulta: ConsultaDeLlamadas & { limit: number; offset: number; resumen?: "hoy" }
) {
  const { data } = await api.get<PaginaDeLlamadas>(`/business/me/calls`, {
    params: parametrosDeConsulta(consulta),
  });
  return data;
}

/** El historial filtrado en CSV. Va por axios (lleva el token), no por un
 * enlace: el fichero se descarga desde un blob. */
export async function exportarLlamadasCsv(consulta: ConsultaDeLlamadas) {
  const respuesta = await api.get<Blob>(`/business/me/calls/export.csv`, {
    params: parametrosDeConsulta(consulta),
    responseType: "blob",
  });
  const disposicion = String(respuesta.headers["content-disposition"] ?? "");
  const nombre = disposicion.match(/filename="([^"]+)"/)?.[1] ?? "llamadas.csv";
  const omitidas = Number(respuesta.headers["x-filas-omitidas"] ?? 0);
  return { blob: respuesta.data, nombre, omitidas };
}

/** «Marcar como devuelta» (y deshacer): cierra o reabre el recado de una
 * llamada, como el botón «Atendido» del aviso de WhatsApp. */
export async function marcarRecado(callId: string, atendido: boolean) {
  const { data } = await api.patch<{ recado: CallRecado }>(
    `/business/me/calls/${encodeURIComponent(callId)}/recado`,
    { atendido }
  );
  return data.recado;
}

export async function getCall(id: string) {
  const { data } = await api.get<Call>(`/business/me/calls/${id}`);
  return data;
}

export async function getGoogleCalendarAuthUrl() {
  const { data } = await api.get<{ url: string }>("/calendar/auth/google", {
    withCredentials: true,
  });
  return data.url;
}

export async function getMicrosoftCalendarAuthUrl() {
  const { data } = await api.get<{ url: string }>("/calendar/auth/microsoft", {
    withCredentials: true,
  });
  return data.url;
}

export async function connectMicrosoftCalendar(calendarId: string) {
  const { data } = await api.post<Business>("/calendar/auth/microsoft/connect", { calendarId });
  return data;
}

/** Alta del calendario de Apple (iCloud) con Apple ID + contraseña de
 * aplicación. El backend valida contra iCloud: credenciales incorrectas
 * llegan como 400 con code CALDAV_INVALID_CREDENTIALS. */
export async function connectAppleCalendar(input: {
  username: string;
  appPassword: string;
}) {
  const { data } = await api.post<CalendarAccountConnected>(
    "/calendar/auth/caldav/connect",
    input
  );
  return data;
}

export async function getCalendarList() {
  const { data } = await api.get<CalendarListResponse>("/calendar/calendars");
  return data;
}

export async function selectCalendar(calendarId: string) {
  const { data } = await api.post<Business>("/calendar/select", { calendarId });
  return data;
}

export async function getBookingSettings() {
  const { data } = await api.get<BookingSettings>("/booking-settings");
  return data;
}

export type PlaceSearchLocation =
  | { countryCode?: string; latitude?: undefined; longitude?: undefined }
  | { countryCode?: undefined; latitude: number; longitude: number };

export async function searchPlaces(query: string, location?: PlaceSearchLocation) {
  const params: Record<string, string> = { q: query };
  if (location?.countryCode) {
    params.country = location.countryCode;
  }
  if (location?.latitude !== undefined && location?.longitude !== undefined) {
    params.lat = String(location.latitude);
    params.lng = String(location.longitude);
  }
  const { data } = await api.get<{ results: PlaceSearchResult[] }>("/places/autocomplete", {
    params,
  });
  return data.results;
}

export async function getPlaceDetails(placeId: string) {
  const { data } = await api.get<PlaceDetails>(`/places/details/${encodeURIComponent(placeId)}`);
  return data;
}

export async function updateBookingCapacity(bookingCapacity: number) {
  const { data } = await api.patch<BookingSettings>("/booking-settings", { bookingCapacity });
  return data;
}

export async function createBookingService(payload: BookingServiceInput) {
  const { data } = await api.post<BookingService>("/booking-settings/services", payload);
  return data;
}

export async function updateBookingService(serviceId: string, payload: Partial<BookingServiceInput>) {
  const { data } = await api.patch<BookingService>(`/booking-settings/services/${serviceId}`, payload);
  return data;
}

export async function deleteBookingService(serviceId: string) {
  await api.delete(`/booking-settings/services/${serviceId}`);
}

export async function createBookingProfessional(payload: BookingProfessionalInput) {
  const { data } = await api.post<BookingProfessional>("/booking-settings/professionals", payload);
  return data;
}

export async function updateBookingProfessional(
  professionalId: string,
  payload: Partial<BookingProfessionalInput>,
) {
  const { data } = await api.patch<BookingProfessional>(
    `/booking-settings/professionals/${professionalId}`,
    payload,
  );
  return data;
}

export async function deleteBookingProfessional(professionalId: string) {
  await api.delete(`/booking-settings/professionals/${professionalId}`);
}

export type AccountOverview = {
  email: string;
  passwordConfigured: boolean;
  googleConnected: boolean;
};

export async function getAccountOverview() {
  const { data } = await api.get<AccountOverview>("/auth/account");
  return data;
}

export async function changeAccountPassword(payload: {
  currentPassword?: string;
  newPassword: string;
}) {
  const { data } = await api.post<{ passwordConfigured: true }>(
    "/auth/change-password",
    payload,
  );
  return data;
}

export async function deleteAccount(payload: {
  currentPassword?: string;
  confirmation: "ELIMINAR";
  forwardingCancelled: true;
}) {
  await api.delete("/auth/account", { data: payload });
}

export async function getOnboardingState() {
  const { data } = await api.get<OnboardingState>("/business/me/onboarding");
  return data;
}

export async function dismissOnboarding() {
  const { data } = await api.post<{ dismissedAt: string | null }>("/business/me/onboarding/dismiss");
  return data;
}

export async function confirmForwarding() {
  const { data } = await api.post<{ confirmedAt: string | null }>(
    "/business/me/onboarding/confirm-forwarding"
  );
  return data;
}

/** «Comprobar desvío»: nos llama al teléfono de clientes desde el número de
 * Alhabla; el resultado se consulta por polling con getForwardingCheck. */
export async function startForwardingCheck() {
  const { data } = await api.post<ForwardingCheck>(
    "/business/me/onboarding/forwarding/check"
  );
  return data;
}

export async function getForwardingCheck(id: string) {
  const { data } = await api.get<ForwardingCheck>(
    `/business/me/onboarding/forwarding/check/${encodeURIComponent(id)}`
  );
  return data;
}

/** Estado del móvil del dueño en WhatsApp (Ajustes › Teléfono). */
export async function getOwnerWhatsapp() {
  const { data } = await api.get<EstadoWhatsappDueno>("/business/me/whatsapp");
  return data;
}

/**
 * Pide la plantilla de activación al móvil guardado. `sent: "link"` significa
 * que no salió nada (plantilla sin aprobar, sin plan o fallo del proveedor)
 * y la persona tiene que escribir ALTA desde su móvil con el enlace o el QR.
 */
export async function sendOwnerWhatsappActivation() {
  const { data } = await api.post<
    EstadoWhatsappDueno & { sent: "template" | "link" }
  >("/business/me/whatsapp/activation");
  return data;
}

export async function getGestor() {
  const { data } = await api.get<EstadoDelGestor>("/business/me/gestor");
  return data;
}

export async function sendGestorMessage(texto: string) {
  const { data } = await api.post<RespuestaDelGestor>(
    "/business/me/gestor/mensajes",
    { texto }
  );
  return data;
}

export async function decideGestorAction(
  accionId: string,
  decision: "confirmar" | "cancelar"
) {
  const { data } = await api.post<DecisionDelGestor>(
    `/business/me/gestor/acciones/${encodeURIComponent(accionId)}`,
    { decision }
  );
  return data;
}

export async function getPhoneNumberInfo() {
  const { data } = await api.get<PhoneNumberInfo>("/phone/business/me/phone");
  return data;
}

export async function provisionPhoneNumber() {
  const { data } = await api.post<{
    success: boolean;
    phoneNumber?: string;
    status: string;
    error?: string;
  }>("/phone/business/me/phone/provision");
  return data;
}
