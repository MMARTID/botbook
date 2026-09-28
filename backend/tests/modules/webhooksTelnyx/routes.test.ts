import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance, type RouteOptions } from "fastify";
import rawBody from "fastify-raw-body";
import { generateKeyPairSync, sign as firmarEd25519 } from "node:crypto";
import { webhooksTelnyxRoutes } from "../../../src/modules/webhooksTelnyx/routes.js";
import {
  extractTelnyxEventEnvelope,
  handleCallHangup,
  handleTelnyxToolInvocation,
} from "../../../src/adapters/telnyx/webhookHandlers.js";
import { handleGestorToolInvocation } from "../../../src/modules/gestor/tools.js";
import {
  claimVoiceWebhookEvent,
  completeVoiceWebhookEvent,
} from "../../../src/lib/voiceWebhookIdempotency.js";

// La firma se verifica DE VERDAD (TelnyxAiAdapter real, Ed25519 real): solo
// se sustituyen los handlers que hay detrás, para saber si llegaron a
// ejecutarse.
vi.mock("../../../src/adapters/telnyx/webhookHandlers.js", () => ({
  handleCallInitiated: vi.fn(),
  handleCallAnswered: vi.fn(),
  handleCallHangup: vi.fn(),
  handleCallConversationEnded: vi.fn(),
  handleCallRecordingSaved: vi.fn(),
  handleCallConversationInsightsGenerated: vi.fn(),
  handleCallCost: vi.fn(),
  handleTelnyxToolInvocation: vi.fn(),
  extractTelnyxEventEnvelope: vi.fn(),
}));
vi.mock("../../../src/modules/gestor/tools.js", () => ({
  handleGestorToolInvocation: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/webhooks.js", () => ({
  handleWhatsappMessages: vi.fn(),
  handleMessageStatusEvent: vi.fn(),
  handleTemplateStatusEvent: vi.fn(),
}));
vi.mock("../../../src/lib/voiceWebhookIdempotency.js", () => ({
  claimVoiceWebhookEvent: vi.fn(),
  completeVoiceWebhookEvent: vi.fn(),
}));

const mockedExtractEnvelope = vi.mocked(extractTelnyxEventEnvelope);
const mockedHandleCallHangup = vi.mocked(handleCallHangup);
const mockedHandleTool = vi.mocked(handleTelnyxToolInvocation);
const mockedHandleGestorTool = vi.mocked(handleGestorToolInvocation);
const mockedClaim = vi.mocked(claimVoiceWebhookEvent);
const mockedComplete = vi.mocked(completeVoiceWebhookEvent);

/** Par de claves con la pública como la entrega Telnyx: los 32 bytes
 * crudos en base64 (ver tests/adapters/telnyx/TelnyxAiAdapter.test.ts). */
function clavesComoLasDeTelnyx() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ type: "spki", format: "der" });
  return {
    privateKey,
    publicaBase64: spki.subarray(spki.length - 32).toString("base64"),
  };
}

function firmar(
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
  marcaDeTiempo: string,
  cuerpo: string
) {
  return firmarEd25519(
    null,
    Buffer.from(`${marcaDeTiempo}|${cuerpo}`, "utf8"),
    privateKey
  ).toString("base64");
}

const ahora = () => Math.floor(Date.now() / 1000).toString();

const CUERPO = JSON.stringify({
  data: { id: "evt_1", event_type: "call.hangup" },
});

describe("webhooks de Telnyx: la firma se comprueba en todas las rutas", () => {
  const claveOriginal = process.env.TELNYX_PUBLIC_KEY;
  let app: FastifyInstance;
  let rutasDelPlugin: RouteOptions[];
  let claves: ReturnType<typeof clavesComoLasDeTelnyx>;

  beforeEach(async () => {
    vi.clearAllMocks();
    claves = clavesComoLasDeTelnyx();
    process.env.TELNYX_PUBLIC_KEY = claves.publicaBase64;

    mockedExtractEnvelope.mockReturnValue({
      id: "evt_1",
      eventType: "call.hangup",
    } as never);
    mockedClaim.mockResolvedValue(true as never);
    mockedComplete.mockResolvedValue(undefined as never);
    mockedHandleCallHangup.mockResolvedValue({ success: true });
    mockedHandleTool.mockResolvedValue({ status: 200, body: { ok: true } });
    mockedHandleGestorTool.mockResolvedValue({
      status: 200,
      body: { ok: true },
    });

    app = Fastify();
    // Mismas opciones que server.ts.
    await app.register(rawBody, { global: false, encoding: false, runFirst: true });
    rutasDelPlugin = [];
    await app.register(async (contexto) => {
      contexto.addHook("onRoute", (ruta) => {
        if (ruta.url.startsWith("/webhooks/telnyx")) rutasDelPlugin.push(ruta);
      });
      await contexto.register(webhooksTelnyxRoutes);
      // Hermana del plugin en el mismo contexto: si alguien lo envolviera en
      // fastify-plugin, el hook de firma se le escaparía a esta ruta.
      contexto.post("/fuera-del-plugin", async () => ({ ok: true }));
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    if (claveOriginal === undefined) delete process.env.TELNYX_PUBLIC_KEY;
    else process.env.TELNYX_PUBLIC_KEY = claveOriginal;
  });

  /** Las URL reales del plugin, con los parámetros rellenos. */
  function urlsDelPlugin(): string[] {
    return rutasDelPlugin.map((ruta) =>
      ruta.url.replace(":toolName", "check_availability")
    );
  }

  function ningunHandlerSeEjecuto() {
    expect(mockedClaim).not.toHaveBeenCalled();
    expect(mockedHandleCallHangup).not.toHaveBeenCalled();
    expect(mockedHandleTool).not.toHaveBeenCalled();
    expect(mockedHandleGestorTool).not.toHaveBeenCalled();
  }

  it("registra las tres rutas firmadas y ninguna más", () => {
    expect(rutasDelPlugin.map((ruta) => `${ruta.method} ${ruta.url}`)).toEqual([
      "POST /webhooks/telnyx",
      "POST /webhooks/telnyx/tools/:toolName",
      "POST /webhooks/telnyx/gestor/:toolName",
    ]);
  });

  it("sin cabeceras de firma responde 400 en cada ruta y no ejecuta nada", async () => {
    for (const url of urlsDelPlugin()) {
      const respuesta = await app.inject({
        method: "POST",
        url,
        headers: { "content-type": "application/json" },
        payload: CUERPO,
      });
      expect(respuesta.statusCode, url).toBe(400);
      expect(respuesta.json()).toEqual({
        error: "Missing webhook signature or body",
      });
    }
    ningunHandlerSeEjecuto();
  });

  it("con firma de otra clave responde 401 en cada ruta y no ejecuta nada", async () => {
    const atacante = clavesComoLasDeTelnyx();
    for (const url of urlsDelPlugin()) {
      const marcaDeTiempo = ahora();
      const respuesta = await app.inject({
        method: "POST",
        url,
        headers: {
          "content-type": "application/json",
          "telnyx-timestamp": marcaDeTiempo,
          "telnyx-signature-ed25519": firmar(
            atacante.privateKey,
            marcaDeTiempo,
            CUERPO
          ),
        },
        payload: CUERPO,
      });
      expect(respuesta.statusCode, url).toBe(401);
      expect(respuesta.json()).toEqual({ error: "Invalid webhook signature" });
    }
    ningunHandlerSeEjecuto();
  });

  it("rechaza con 401 un cuerpo modificado después de firmarlo", async () => {
    const marcaDeTiempo = ahora();
    const respuesta = await app.inject({
      method: "POST",
      url: "/webhooks/telnyx/tools/book_appointment",
      headers: {
        "content-type": "application/json",
        "telnyx-timestamp": marcaDeTiempo,
        "telnyx-signature-ed25519": firmar(
          claves.privateKey,
          marcaDeTiempo,
          JSON.stringify({ clientName: "Ana" })
        ),
      },
      payload: JSON.stringify({ clientName: "Otra persona" }),
    });

    expect(respuesta.statusCode).toBe(401);
    ningunHandlerSeEjecuto();
  });

  it("rechaza con 401 una firma válida pero caducada (replay)", async () => {
    const hace1h = (Math.floor(Date.now() / 1000) - 3600).toString();
    const respuesta = await app.inject({
      method: "POST",
      url: "/webhooks/telnyx",
      headers: {
        "content-type": "application/json",
        "telnyx-timestamp": hace1h,
        "telnyx-signature-ed25519": firmar(claves.privateKey, hace1h, CUERPO),
      },
      payload: CUERPO,
    });

    expect(respuesta.statusCode).toBe(401);
    ningunHandlerSeEjecuto();
  });

  it("sin TELNYX_PUBLIC_KEY responde 500 en cada ruta: falla cerrado, nunca abierto", async () => {
    delete process.env.TELNYX_PUBLIC_KEY;
    for (const url of urlsDelPlugin()) {
      const marcaDeTiempo = ahora();
      const respuesta = await app.inject({
        method: "POST",
        url,
        headers: {
          "content-type": "application/json",
          "telnyx-timestamp": marcaDeTiempo,
          "telnyx-signature-ed25519": firmar(
            claves.privateKey,
            marcaDeTiempo,
            CUERPO
          ),
        },
        payload: CUERPO,
      });
      expect(respuesta.statusCode, url).toBe(500);
      expect(respuesta.json()).toEqual({
        error: "Signature verification not configured",
      });
    }
    ningunHandlerSeEjecuto();
  });

  it("con firma válida procesa el evento del Call Control App", async () => {
    const marcaDeTiempo = ahora();
    const respuesta = await app.inject({
      method: "POST",
      url: "/webhooks/telnyx",
      headers: {
        "content-type": "application/json",
        "telnyx-timestamp": marcaDeTiempo,
        "telnyx-signature-ed25519": firmar(
          claves.privateKey,
          marcaDeTiempo,
          CUERPO
        ),
      },
      payload: CUERPO,
    });

    expect(respuesta.statusCode).toBe(200);
    expect(mockedClaim).toHaveBeenCalledWith("telnyx", "evt_1", "call.hangup");
    expect(mockedHandleCallHangup).toHaveBeenCalledWith(JSON.parse(CUERPO));
  });

  it("con firma válida ejecuta la tool de voz con la llamada de la cabecera", async () => {
    const cuerpo = JSON.stringify({ startDateTime: "2026-10-01T10:00:00+02:00" });
    const marcaDeTiempo = ahora();
    const respuesta = await app.inject({
      method: "POST",
      url: "/webhooks/telnyx/tools/check_availability",
      headers: {
        "content-type": "application/json",
        "telnyx-timestamp": marcaDeTiempo,
        "telnyx-signature-ed25519": firmar(
          claves.privateKey,
          marcaDeTiempo,
          cuerpo
        ),
        "x-alhabla-call-control-id": "v3:llamada",
      },
      payload: cuerpo,
    });

    expect(respuesta.statusCode).toBe(200);
    expect(mockedHandleTool).toHaveBeenCalledWith({
      callControlId: "v3:llamada",
      toolName: "check_availability",
      params: JSON.parse(cuerpo),
    });
  });

  it("con firma válida ejecuta la tool del Gestor con el negocio de la cabecera", async () => {
    const cuerpo = JSON.stringify({ fecha: "2026-10-01" });
    const marcaDeTiempo = ahora();
    const respuesta = await app.inject({
      method: "POST",
      url: "/webhooks/telnyx/gestor/ver_agenda",
      headers: {
        "content-type": "application/json",
        "telnyx-timestamp": marcaDeTiempo,
        "telnyx-signature-ed25519": firmar(
          claves.privateKey,
          marcaDeTiempo,
          cuerpo
        ),
        "x-alhabla-business": "biz_1",
        "x-alhabla-role": "owner",
      },
      payload: cuerpo,
    });

    expect(respuesta.statusCode).toBe(200);
    expect(mockedHandleGestorTool).toHaveBeenCalledWith({
      businessId: "biz_1",
      role: "owner",
      toolName: "ver_agenda",
      params: JSON.parse(cuerpo),
    });
  });

  it("el hook no sale del plugin: una ruta de fuera no pide firma", async () => {
    const respuesta = await app.inject({
      method: "POST",
      url: "/fuera-del-plugin",
      headers: { "content-type": "application/json" },
      payload: "{}",
    });

    expect(respuesta.statusCode).toBe(200);
  });
});
