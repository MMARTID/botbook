import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("sendZohoMail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    // El access token se cachea en una variable de módulo — reimportamos en
    // frío en cada test para que el caché de un test no contamine el siguiente.
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    process.env.ZOHO_REFRESH_TOKEN = "refresh_token_test";
    process.env.ZOHO_CLIENT_ID = "client_id_test";
    process.env.ZOHO_CLIENT_SECRET = "client_secret_test";
    process.env.ZOHO_ACCOUNT_ID = "account_id_test";
    // Estos tests comprueban el envío en sí, no el guardarraíl de entorno:
    // sin esto, todos caerían en el "no se manda fuera de producción". El
    // guardarraíl tiene sus propios tests al final.
    process.env.ZOHO_DEV_ALLOWED_RECIPIENTS = "*";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function loadSendZohoMail() {
    const mod = await import("../../src/lib/zohoMail.js");
    return mod.sendZohoMail;
  }

  function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; json?: unknown; text?: string }>) {
    const fetchMock = vi.fn();
    for (const response of responses) {
      fetchMock.mockResolvedValueOnce({
        ok: response.ok,
        status: response.status ?? (response.ok ? 200 : 500),
        json: async () => response.json,
        text: async () => response.text ?? "",
      });
    }
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("obtiene un access token y envía el correo con los datos correctos", async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, json: { access_token: "access_token_1", expires_in: 3600 } },
      { ok: true, json: { data: { messageId: "msg_1" } } },
    ]);
    const sendZohoMail = await loadSendZohoMail();

    await sendZohoMail({
      fromAddress: "welcome@alhabla.ai",
      toAddress: "cliente@example.com",
      subject: "Bienvenido",
      html: "<p>hola</p>",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [tokenCall, sendCall] = fetchMock.mock.calls;
    expect(String(tokenCall[0])).toContain("accounts.zoho.eu/oauth/v2/token");
    expect(String(sendCall[0])).toBe("https://mail.zoho.eu/api/accounts/account_id_test/messages");
    expect(sendCall[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Zoho-oauthtoken access_token_1" }),
      })
    );
    expect(JSON.parse(sendCall[1].body)).toEqual({
      fromAddress: "welcome@alhabla.ai",
      toAddress: "cliente@example.com",
      subject: "Bienvenido",
      content: "<p>hola</p>",
      mailFormat: "html",
    });
  });

  it("reutiliza el access token cacheado en el siguiente envío", async () => {
    const fetchMock = mockFetchSequence([
      { ok: true, json: { access_token: "access_token_1", expires_in: 3600 } },
      { ok: true, json: {} },
      { ok: true, json: {} },
    ]);
    const sendZohoMail = await loadSendZohoMail();

    await sendZohoMail({ fromAddress: "welcome@alhabla.ai", toAddress: "a@b.com", subject: "s", html: "h" });
    await sendZohoMail({ fromAddress: "welcome@alhabla.ai", toAddress: "a@b.com", subject: "s", html: "h" });

    // 1 refresco de token + 2 envíos = 3 llamadas, no 4: el segundo envío no
    // debería volver a pedir un access token todavía vigente.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("pide un access token nuevo cuando el cacheado ya caducó", async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetchSequence([
      { ok: true, json: { access_token: "access_token_1", expires_in: 3600 } },
      { ok: true, json: {} },
      { ok: true, json: { access_token: "access_token_2", expires_in: 3600 } },
      { ok: true, json: {} },
    ]);
    const sendZohoMail = await loadSendZohoMail();

    await sendZohoMail({ fromAddress: "welcome@alhabla.ai", toAddress: "a@b.com", subject: "s", html: "h" });
    vi.advanceTimersByTime(3601 * 1000);
    await sendZohoMail({ fromAddress: "welcome@alhabla.ai", toAddress: "a@b.com", subject: "s", html: "h" });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const secondSendAuth = fetchMock.mock.calls[3][1].headers.Authorization;
    expect(secondSendAuth).toBe("Zoho-oauthtoken access_token_2");
  });

  it("lanza si Zoho no devuelve access_token al refrescar", async () => {
    mockFetchSequence([{ ok: false, status: 401, json: { error: "invalid_client" } }]);
    const sendZohoMail = await loadSendZohoMail();

    await expect(
      sendZohoMail({ fromAddress: "welcome@alhabla.ai", toAddress: "a@b.com", subject: "s", html: "h" })
    ).rejects.toThrow("Zoho OAuth token refresh failed");
  });

  it("lanza con el cuerpo del error si el envío del correo falla", async () => {
    mockFetchSequence([
      { ok: true, json: { access_token: "access_token_1", expires_in: 3600 } },
      { ok: false, status: 500, text: "Internal error" },
    ]);
    const sendZohoMail = await loadSendZohoMail();

    await expect(
      sendZohoMail({ fromAddress: "welcome@alhabla.ai", toAddress: "a@b.com", subject: "s", html: "h" })
    ).rejects.toThrow("Zoho Mail send failed (500): Internal error");
  });

  it("lanza si falta una variable de entorno requerida", async () => {
    delete process.env.ZOHO_ACCOUNT_ID;
    mockFetchSequence([{ ok: true, json: { access_token: "access_token_1", expires_in: 3600 } }]);
    const sendZohoMail = await loadSendZohoMail();

    await expect(
      sendZohoMail({ fromAddress: "welcome@alhabla.ai", toAddress: "a@b.com", subject: "s", html: "h" })
    ).rejects.toThrow("ZOHO_ACCOUNT_ID is not configured");
  });
  // Dev y producción comparten las credenciales de Zoho: un envío desde el
  // portátil sale del buzón corporativo real (auditoría del 2026-09-19).
  describe("guardarraíl de entorno", () => {
    it("no manda nada fuera de producción si el destinatario no está permitido", async () => {
      process.env.NODE_ENV = "development";
      process.env.ZOHO_DEV_ALLOWED_RECIPIENTS = "";
      const fetchMock = mockFetchSequence([]);
      const avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
      const sendZohoMail = await loadSendZohoMail();

      await sendZohoMail({
        fromAddress: "welcome@alhabla.ai",
        toAddress: "cliente.real@gmail.com",
        subject: "Tu cita",
        html: "<p>hola</p>",
      });

      // Ni siquiera pide el access token.
      expect(fetchMock).not.toHaveBeenCalled();
      const mensaje = avisos.mock.calls[0]?.[0] as string;
      expect(mensaje).toContain("CORREO NO ENVIADO");
      expect(mensaje).toContain("cliente.real@gmail.com");
      expect(mensaje).toContain("Tu cita");
    });

    it("manda si el destinatario está en la lista, sin distinguir mayúsculas ni espacios", async () => {
      process.env.NODE_ENV = "development";
      process.env.ZOHO_DEV_ALLOWED_RECIPIENTS = " yo@alhabla.ai , otro@alhabla.ai ";
      const fetchMock = mockFetchSequence([
        { ok: true, json: { access_token: "access_token_1", expires_in: 3600 } },
        { ok: true, json: { data: { messageId: "msg_1" } } },
      ]);
      const sendZohoMail = await loadSendZohoMail();

      await sendZohoMail({
        fromAddress: "welcome@alhabla.ai",
        toAddress: "YO@Alhabla.ai",
        subject: "s",
        html: "h",
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("en producción manda a cualquiera aunque la lista esté vacía", async () => {
      process.env.NODE_ENV = "production";
      process.env.ZOHO_DEV_ALLOWED_RECIPIENTS = "";
      const fetchMock = mockFetchSequence([
        { ok: true, json: { access_token: "access_token_1", expires_in: 3600 } },
        { ok: true, json: { data: { messageId: "msg_1" } } },
      ]);
      const sendZohoMail = await loadSendZohoMail();

      await sendZohoMail({
        fromAddress: "welcome@alhabla.ai",
        toAddress: "cliente.real@gmail.com",
        subject: "s",
        html: "h",
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
