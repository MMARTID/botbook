import axios from "axios";
import type {
  Agent,
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
  CreateAgentPayload,
  OnboardingState,
  Paginated,
  PhoneNumberInfo,
  PlanId,
  PlaceDetails,
  PlaceSearchResult,
  DemoPlaceSearchResult,
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

export async function getGoogleAuthUrl(acceptedTerms?: boolean) {
  const { data } = await api.get<{ url: string }>("/auth/google", {
    params: acceptedTerms ? { acceptedTerms: "true" } : undefined,
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

export async function consumeGoogleSession() {
  const { data } = await api.post<{ token: string }>("/auth/google/session", undefined, {
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

/** Próximas citas reservadas por el agente, con cliente y servicios resueltos. */
export async function getAgenda(days = 7, limit = 20, offset = 0) {
  const { data } = await api.get<AgendaResponse>("/business/me/agenda", {
    params: { days, limit, offset },
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

export async function getAgents() {
  const { data } = await api.get<Agent[]>("/business/me/agents");
  return data;
}

export async function createAgent(payload: CreateAgentPayload) {
  const { data } = await api.post<Agent>("/agents", payload);
  return data;
}

export async function getCalls(limit = 100, offset = 0) {
  const { data } = await api.get<Paginated<Call>>(`/business/me/calls`, {
    params: { limit, offset },
  });
  return data;
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

/** Datos mínimos que la landing pública puede usar para contextualizar una demo. */
export type DemoPlaceDetails = Pick<PlaceDetails, "placeId" | "name" | "address" | "types">;

/**
 * Google Places para la demo pública. Se mantiene separado de la búsqueda de
 * registro, que requiere sesión y devuelve la ficha completa del negocio.
 */
export async function searchDemoPlaces(query: string) {
  const { data } = await api.get<{ results: DemoPlaceSearchResult[] }>("/demo/places/autocomplete", {
    params: { q: query },
  });
  return data.results;
}

export async function getDemoPlaceDetails(placeId: string) {
  const { data } = await api.get<DemoPlaceDetails>(`/demo/places/details/${encodeURIComponent(placeId)}`);
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

export async function completeOnboarding() {
  const { data } = await api.post<{ completedAt: string | null }>("/business/me/onboarding/complete");
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

export async function createDemoWebCall(niche?: string, placeId?: string, allowBusinessDataRetention?: boolean) {
  // Timeout explícito: sin uno, un fallo de red silencioso deja al visitante
  // mirando "Conectando demo…" indefinidamente en vez de ver un error
  // accionable. Al expirar, axios lanza un error cuyo mensaje contiene
  // "timeout" — el mismo texto en español que ya usa describeDemoError()
  // para el resto de fallos de red se muestra sin cambios adicionales.
  const { data } = await api.post<{ callId: string; accessToken: string }>(
    "/demo/web-call",
    {
      ...(niche ? { niche } : {}),
      ...(placeId ? { placeId } : {}),
      ...(allowBusinessDataRetention ? { allowBusinessDataRetention: true } : {}),
    },
    { timeout: 15000 },
  );
  return data;
}
