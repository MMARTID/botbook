import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  listMicrosoftBusyIntervals,
  refreshMicrosoftAccessToken,
  exchangeMicrosoftCode,
} from "../../src/lib/microsoftGraph.js";

function mockFetchOnce(body: unknown, ok = true, status?: number) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: status ?? (ok ? 200 : 500),
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("listMicrosoftBusyIntervals", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("interpreta start/end como UTC aunque Graph los devuelva sin sufijo de zona", async () => {
    // Con Prefer: outlook.timezone="UTC", Graph devuelve dateTime como
    // "2026-08-10T10:00:00.0000000" (SIN 'Z' ni offset) — new Date() sobre
    // ese string se interpretaría como hora LOCAL DEL PROCESO, no UTC, si no
    // le añadiéramos la 'Z' nosotros mismos antes de parsear.
    mockFetchOnce({
      value: [
        {
          start: { dateTime: "2026-08-10T10:00:00.0000000" },
          end: { dateTime: "2026-08-10T10:30:00.0000000" },
          showAs: "busy",
          isCancelled: false,
        },
      ],
    });

    const busy = await listMicrosoftBusyIntervals(
      "access_token",
      "calendar_1",
      new Date("2026-08-10T00:00:00Z"),
      new Date("2026-08-11T00:00:00Z")
    );

    expect(busy).toEqual([
      { start: new Date("2026-08-10T10:00:00Z"), end: new Date("2026-08-10T10:30:00Z") },
    ]);
  });

  it("descarta eventos cancelados y marcados como 'free'", async () => {
    mockFetchOnce({
      value: [
        { start: { dateTime: "2026-08-10T09:00:00.0000000" }, end: { dateTime: "2026-08-10T09:30:00.0000000" }, showAs: "free", isCancelled: false },
        { start: { dateTime: "2026-08-10T11:00:00.0000000" }, end: { dateTime: "2026-08-10T11:30:00.0000000" }, showAs: "busy", isCancelled: true },
        { start: { dateTime: "2026-08-10T13:00:00.0000000" }, end: { dateTime: "2026-08-10T13:30:00.0000000" }, showAs: "busy", isCancelled: false },
      ],
    });

    const busy = await listMicrosoftBusyIntervals(
      "access_token",
      "calendar_1",
      new Date("2026-08-10T00:00:00Z"),
      new Date("2026-08-11T00:00:00Z")
    );

    expect(busy).toEqual([
      { start: new Date("2026-08-10T13:00:00Z"), end: new Date("2026-08-10T13:30:00Z") },
    ]);
  });

  it("propaga el error si la petición a Graph falla (el caller decide degradar)", async () => {
    mockFetchOnce({ error: { code: "Forbidden", message: "no access" } }, false);

    await expect(
      listMicrosoftBusyIntervals("access_token", "calendar_1", new Date(), new Date())
    ).rejects.toThrow();
  });
});

describe("refreshMicrosoftAccessToken / exchangeMicrosoftCode (hallazgos #22 y #23 de la auditoría)", () => {
  beforeEach(() => {
    process.env.MICROSOFT_CLIENT_ID = "client_id_test";
    process.env.MICROSOFT_CLIENT_SECRET = "client_secret_test";
    process.env.MICROSOFT_REDIRECT_URI = "https://example.com/callback";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;
    delete process.env.MICROSOFT_REDIRECT_URI;
  });

  it("limita con un timeout la renovación del token (#23) — pasa un AbortSignal a fetch", async () => {
    const fetchMock = mockFetchOnce({ access_token: "token_123", expires_in: 3600 });

    await refreshMicrosoftAccessToken("refresh_token_123");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("limita con un timeout el intercambio del código de autorización (#23) — pasa un AbortSignal a fetch", async () => {
    const fetchMock = mockFetchOnce({ access_token: "token_123", refresh_token: "refresh_123", expires_in: 3600 });

    await exchangeMicrosoftCode("auth_code_123");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("adjunta status y oauthErrorCode estructurados al error de invalid_grant (#22) — no solo un mensaje de texto", async () => {
    mockFetchOnce({ error: "invalid_grant", error_description: "AADSTS700082: refresh token expired" }, false, 400);

    await expect(refreshMicrosoftAccessToken("refresh_token_expired")).rejects.toMatchObject({
      status: 400,
      oauthErrorCode: "invalid_grant",
    });
  });
});
