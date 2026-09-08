import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { listMicrosoftBusyIntervals } from "../../src/lib/microsoftGraph.js";

function mockFetchOnce(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
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
