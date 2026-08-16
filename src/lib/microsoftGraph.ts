const MICROSOFT_AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";
const MICROSOFT_GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const OUTLOOK_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Calendars.ReadWrite",
].join(" ");

type MicrosoftOAuthErrorResponse = {
  error?: string;
  error_description?: string;
  error_codes?: number[];
  trace_id?: string;
  correlation_id?: string;
};

type MicrosoftGraphErrorResponse = {
  error?: {
    code?: string;
    message?: string;
    innerError?: {
      requestId?: string;
      "request-id"?: string;
    };
  };
};

export type MicrosoftCalendar = {
  id: string;
  name: string;
  canEdit: boolean;
  canShare: boolean;
  ownerEmail: string | null;
};

export type MicrosoftUpcomingEvent = {
  id: string;
  summary: string;
  start: string | null;
  end: string | null;
  location: string | null;
  htmlLink: string | null;
};

function getMicrosoftConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Microsoft Calendar OAuth is not configured");
  }

  return { clientId, clientSecret, redirectUri };
}

async function createMicrosoftOAuthError(response: Response, operation: "token exchange" | "token refresh") {
  let details: MicrosoftOAuthErrorResponse = {};
  try {
    details = await response.json() as MicrosoftOAuthErrorResponse;
  } catch {
    // Microsoft can occasionally return a non-JSON proxy response.
  }

  const safeDetails = [
    details.error,
    details.error_description,
    details.error_codes?.length ? `codes=${details.error_codes.join(",")}` : null,
    details.correlation_id ? `correlation_id=${details.correlation_id}` : null,
  ].filter(Boolean).join(" | ");

  return new Error(
    `Microsoft ${operation} failed: ${response.status}${safeDetails ? ` | ${safeDetails}` : ""}`,
  );
}

export function getMicrosoftAuthUrl(state: string) {
  const { clientId, redirectUri } = getMicrosoftConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: OUTLOOK_SCOPES,
    state,
    prompt: "select_account",
  });

  return `${MICROSOFT_AUTH_BASE}/authorize?${params.toString()}`;
}

export async function exchangeMicrosoftCode(code: string) {
  const { clientId, clientSecret, redirectUri } = getMicrosoftConfig();
  const response = await fetch(`${MICROSOFT_AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      scope: OUTLOOK_SCOPES,
    }).toString(),
  });

  if (!response.ok) {
    throw await createMicrosoftOAuthError(response, "token exchange");
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;
}

export async function refreshMicrosoftAccessToken(refreshToken: string) {
  const { clientId, clientSecret, redirectUri } = getMicrosoftConfig();
  const response = await fetch(`${MICROSOFT_AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      redirect_uri: redirectUri,
      scope: OUTLOOK_SCOPES,
    }).toString(),
  });

  if (!response.ok) {
    throw await createMicrosoftOAuthError(response, "token refresh");
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

async function graphFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${MICROSOFT_GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let details: MicrosoftGraphErrorResponse = {};
    try {
      details = await response.json() as MicrosoftGraphErrorResponse;
    } catch {
      // Keep the status-only fallback when Graph returns a non-JSON response.
    }

    const requestId = details.error?.innerError?.requestId ?? details.error?.innerError?.["request-id"];
    const safeDetails = [
      details.error?.code,
      details.error?.message,
      requestId ? `request_id=${requestId}` : null,
    ].filter(Boolean).join(" | ");

    throw new Error(
      `Microsoft Graph request failed for ${path.split("?")[0]}: ${response.status}${safeDetails ? ` | ${safeDetails}` : ""}`,
    );
  }

  return response.json() as Promise<T>;
}

export async function getMicrosoftProfile(accessToken: string) {
  return graphFetch<{ mail?: string | null; userPrincipalName?: string | null }>(accessToken, "/me?$select=mail,userPrincipalName");
}

export async function listMicrosoftCalendars(accessToken: string) {
  const data = await graphFetch<{ value: Array<{ id: string; name: string; canEdit: boolean; canShare: boolean; owner?: { address?: string | null } }> }>(
    accessToken,
    "/me/calendars?$select=id,name,canEdit,canShare,owner",
  );

  return data.value.map((calendar) => ({
    id: calendar.id,
    name: calendar.name,
    canEdit: calendar.canEdit,
    canShare: calendar.canShare,
    ownerEmail: calendar.owner?.address ?? null,
  })) satisfies MicrosoftCalendar[];
}

export async function listMicrosoftUpcomingEvents(accessToken: string, calendarId: string, limit: number) {
  const now = new Date().toISOString();
  const end = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  const data = await graphFetch<{ value: Array<{ id: string; subject?: string | null; webLink?: string | null; location?: { displayName?: string | null }; start?: { dateTime?: string | null }; end?: { dateTime?: string | null } }> }>(
    accessToken,
    `/me/calendars/${encodeURIComponent(calendarId)}/calendarView?startDateTime=${encodeURIComponent(now)}&endDateTime=${encodeURIComponent(end)}&$top=${limit}&$select=id,subject,webLink,location,start,end`,
    {
      headers: {
        Prefer: 'outlook.timezone="Europe/Madrid"',
      },
    },
  );

  return data.value.map((event) => ({
    id: event.id,
    summary: event.subject ?? "Sin título",
    start: event.start?.dateTime ?? null,
    end: event.end?.dateTime ?? null,
    location: event.location?.displayName ?? null,
    htmlLink: event.webLink ?? null,
  })) satisfies MicrosoftUpcomingEvent[];
}

export async function createMicrosoftCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  subject: string;
  startDateTime: string;
  endDateTime: string;
  attendeeEmail?: string;
  description?: string;
}) {
  const body: Record<string, unknown> = {
    subject: input.subject,
    start: {
      dateTime: input.startDateTime,
      timeZone: "Europe/Madrid",
    },
    end: {
      dateTime: input.endDateTime,
      timeZone: "Europe/Madrid",
    },
    body: {
      contentType: "text",
      content: input.description ?? "",
    },
  };

  if (input.attendeeEmail) {
    body.attendees = [
      {
        emailAddress: {
          address: input.attendeeEmail,
        },
        type: "required",
      },
    ];
  }

  const event = await graphFetch<{ id: string; webLink?: string | null }>(
    input.accessToken,
    `/me/calendars/${encodeURIComponent(input.calendarId)}/events`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );

  return {
    id: event.id,
    htmlLink: event.webLink ?? null,
  };
}
