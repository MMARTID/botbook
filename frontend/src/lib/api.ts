import axios from "axios";
import type {
  Agent,
  BookingProfessional,
  BookingProfessionalInput,
  BookingService,
  BookingServiceInput,
  BookingSettings,
  BillingSummary,
  Business,
  CalendarListResponse,
  Call,
  CreateAgentPayload,
  FileAttachment,
  OnboardingState,
  Paginated,
  PhoneNumberInfo,
  PlanId,
  PlaceDetails,
  PlaceSearchResult,
  UpcomingCalendarEventsResponse,
} from "./types";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/backend",
});

api.interceptors.request.use((config) => {
  if (typeof window === "undefined") {
    return config;
  }

  const token =
    window.localStorage.getItem("botbook_token") ??
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

export async function getGoogleAuthUrl() {
  const { data } = await api.get<{ url: string }>("/auth/google");
  return data.url;
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
  const { data } = await api.get<{
    totalCalls: number;
    totalMinutes: number;
    leads: number;
  }>("/business/me/stats");
  return data;
}

export async function getBillingSummary() {
  const { data } = await api.get<BillingSummary>("/billing/summary");
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
  const { data } = await api.get<Call>(`/calls/${id}`);
  return data;
}

type UploadAgentFileResponse = {
  success: boolean;
  file: FileAttachment;
  message?: string;
  note?: string;
};

export async function uploadAgentFile(agentId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await api.post<UploadAgentFileResponse>(`/agents/${agentId}/files`, formData);
  return data;
}

export async function getGoogleCalendarAuthUrl() {
  const { data } = await api.get<{ url: string }>("/calendar/auth/google");
  return data.url;
}

export async function getMicrosoftCalendarAuthUrl() {
  const { data } = await api.get<{ url: string }>("/calendar/auth/microsoft");
  return data.url;
}

export async function connectMicrosoftCalendar(calendarId: string) {
  const { data } = await api.post<Business>("/calendar/auth/microsoft/connect", { calendarId });
  return data;
}

export async function getUpcomingCalendarEvents(limit = 15) {
  const { data } = await api.get<UpcomingCalendarEventsResponse>("/calendar/events/upcoming", {
    params: { limit },
  });

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

export async function getOnboardingState() {
  const { data } = await api.get<OnboardingState>("/business/me/onboarding");
  return data;
}

export async function dismissOnboarding() {
  const { data } = await api.post<{ dismissedAt: string | null }>("/business/me/onboarding/dismiss");
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
