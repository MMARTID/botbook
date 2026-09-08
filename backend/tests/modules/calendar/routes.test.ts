import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { calendarRoutes } from "../../../src/modules/calendar/routes.js";
import { calendarService } from "../../../src/modules/calendar/service.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: { business: { findUnique: vi.fn(), update: vi.fn() } },
}));

vi.mock("../../../src/modules/calendar/service.js", () => ({
  CalendarBusinessError: class CalendarBusinessError extends Error {},
  calendarService: {
    getAuthUrl: vi.fn(),
    getMicrosoftAuthUrl: vi.fn(),
    handleCallback: vi.fn(),
    handleMicrosoftCallback: vi.fn(),
  },
}));

const mockedGetAuthUrl = vi.mocked(calendarService.getAuthUrl);
const mockedGetMicrosoftAuthUrl = vi.mocked(calendarService.getMicrosoftAuthUrl);
const mockedHandleCallback = vi.mocked(calendarService.handleCallback);
const mockedHandleMicrosoftCallback = vi.mocked(calendarService.handleMicrosoftCallback);

describe("calendarRoutes OAuth", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.FRONTEND_URL = "http://localhost:3001";
    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(calendarRoutes);
  });

  it("liga el state de Google al navegador que inició la autorización", async () => {
    mockedGetAuthUrl.mockResolvedValue("https://accounts.google.com/o/oauth2?state=google_state");

    const start = await fastify.inject({ method: "GET", url: "/auth/google" });
    expect(start.statusCode).toBe(200);
    expect(start.headers["set-cookie"]).toContain("alhabla_google_calendar_oauth_state=google_state");

    const rejected = await fastify.inject({
      method: "GET",
      url: "/auth/google/callback?code=code&state=google_state",
    });
    expect(rejected.headers.location).toContain("calendar_error=invalid_state");
    expect(mockedHandleCallback).not.toHaveBeenCalled();

    const accepted = await fastify.inject({
      method: "GET",
      url: "/auth/google/callback?code=code&state=google_state",
      headers: { cookie: "alhabla_google_calendar_oauth_state=google_state" },
    });
    expect(accepted.headers.location).toContain("calendar_success=true");
    expect(mockedHandleCallback).toHaveBeenCalledWith("code", "google_state");
  });

  it("liga también el state de Microsoft al navegador que inició la autorización", async () => {
    mockedGetMicrosoftAuthUrl.mockResolvedValue("https://login.microsoftonline.com/common?state=microsoft_state");
    mockedHandleMicrosoftCallback.mockResolvedValue({ calendars: [] } as any);

    const start = await fastify.inject({ method: "GET", url: "/auth/microsoft" });
    expect(start.headers["set-cookie"]).toContain("alhabla_microsoft_calendar_oauth_state=microsoft_state");

    const rejected = await fastify.inject({
      method: "GET",
      url: "/auth/microsoft/callback?code=code&state=microsoft_state",
    });
    expect(rejected.headers.location).toContain("outlook_error=invalid_state");
    expect(mockedHandleMicrosoftCallback).not.toHaveBeenCalled();
  });
});
