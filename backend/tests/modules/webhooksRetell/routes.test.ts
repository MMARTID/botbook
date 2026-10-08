import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance, type RouteOptions } from "fastify";
import rawBody from "fastify-raw-body";
import Retell from "retell-sdk";

// La clave tiene que estar antes de importar el adaptador: la lee al
// construirse. La firma se verifica DE VERDAD (RetellAdapter real, firma
// real del SDK): solo se sustituyen los handlers que hay detrás, para saber
// si llegaron a ejecutarse.
const CLAVE = vi.hoisted(() => {
  process.env.RETELL_API_KEY = "clave_de_prueba_retell";
  return "clave_de_prueba_retell";
});

vi.mock("../../../src/adapters/retell/webhookHandlers.js", () => ({
  handleCallStarted: vi.fn(),
  handleCallEnded: vi.fn(),
  handleCallAnalyzed: vi.fn(),
  normalizeRetellWebhookPayload: vi.fn((payload: unknown) => payload),
}));
vi.mock("../../../src/modules/voiceTools/service.js", () => ({
  executeVoiceTool: vi.fn(),
}));
vi.mock("../../../src/lib/agentBootstrap.js", () => ({
  buildInboundCallDynamicVariables: vi.fn(),
}));
vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    agent: { findFirst: vi.fn() },
    business: { findUnique: vi.fn() },
  },
}));

const { webhooksRetellRoutes } = await import(
  "../../../src/modules/webhooksRetell/routes.js"
);
const { handleCallEnded } = await import(
  "../../../src/adapters/retell/webhookHandlers.js"
);
const { executeVoiceTool } = await import(
  "../../../src/modules/voiceTools/service.js"
);
const { prisma } = await import("../../../src/lib/prisma.js");

const mockedHandleCallEnded = vi.mocked(handleCallEnded);
const mockedExecuteVoiceTool = vi.mocked(executeVoiceTool);
const mockedFindAgent = vi.mocked(prisma.agent.findFirst);
const mockedFindBusiness = vi.mocked(prisma.business.findUnique);

const firmar = async (cuerpo: string, clave = CLAVE) =>
  String(await Retell.sign(cuerpo, clave));

const CUERPO_EVENTO = JSON.stringify({
  event: "call_ended",
  event_type: "call_ended",
  call: { call_id: "call_1" },
});
const CUERPO_TOOL = JSON.stringify({
  name: "check_availability",
  call: { call_id: "call_1" },
  args: { date: "2026-10-01" },
});
const CUERPO_ENTRANTE = JSON.stringify({
  call_inbound: { to_number: "+34910000000" },
});

const RUTAS = [
  { url: "/webhooks/retell", cuerpo: CUERPO_EVENTO },
  { url: "/webhooks/retell/inbound", cuerpo: CUERPO_ENTRANTE },
  {
    url: "/webhooks/retell/tools/agent_1/check_availability",
    cuerpo: CUERPO_TOOL,
  },
];

describe("webhooks de Retell: la firma se comprueba en todas las rutas", () => {
  let app: FastifyInstance;
  let rutasRegistradas: string[];

  beforeEach(async () => {
    vi.clearAllMocks();
    mockedHandleCallEnded.mockResolvedValue({ success: true });
    mockedFindAgent.mockResolvedValue({ businessId: "negocio_1" } as never);
    mockedFindBusiness.mockResolvedValue(null);
    mockedExecuteVoiceTool.mockResolvedValue({
      success: true,
      result: { ok: true },
    } as never);

    app = Fastify();
    rutasRegistradas = [];
    app.addHook("onRoute", (ruta: RouteOptions) => {
      rutasRegistradas.push(ruta.url);
    });
    await app.register(rawBody, {
      field: "rawBody",
      global: false,
      encoding: false,
      runFirst: true,
    });
    await app.register(webhooksRetellRoutes);
    app.post("/fuera-del-plugin", async () => ({ ok: true }));
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("registra exactamente las tres rutas firmadas", () => {
    expect(rutasRegistradas.filter((r) => r.startsWith("/webhooks/"))).toEqual([
      "/webhooks/retell",
      "/webhooks/retell/inbound",
      "/webhooks/retell/tools/:retellAgentId/:toolName",
    ]);
  });

  for (const { url, cuerpo } of RUTAS) {
    it(`${url}: 400 sin firma y no ejecuta nada`, async () => {
      const res = await app.inject({
        method: "POST",
        url,
        headers: { "content-type": "application/json" },
        payload: cuerpo,
      });
      expect(res.statusCode).toBe(400);
      expect(mockedHandleCallEnded).not.toHaveBeenCalled();
      expect(mockedExecuteVoiceTool).not.toHaveBeenCalled();
      expect(mockedFindBusiness).not.toHaveBeenCalled();
    });

    it(`${url}: 401 con firma de otra clave y no ejecuta nada`, async () => {
      const res = await app.inject({
        method: "POST",
        url,
        headers: {
          "content-type": "application/json",
          "x-retell-signature": await firmar(cuerpo, "otra_clave"),
        },
        payload: cuerpo,
      });
      expect(res.statusCode).toBe(401);
      expect(mockedHandleCallEnded).not.toHaveBeenCalled();
      expect(mockedExecuteVoiceTool).not.toHaveBeenCalled();
      expect(mockedFindBusiness).not.toHaveBeenCalled();
    });

    it(`${url}: con firma válida llega al handler`, async () => {
      const res = await app.inject({
        method: "POST",
        url,
        headers: {
          "content-type": "application/json",
          "x-retell-signature": await firmar(cuerpo),
        },
        payload: cuerpo,
      });
      expect(res.statusCode).toBe(200);
      const llamados =
        mockedHandleCallEnded.mock.calls.length +
        mockedExecuteVoiceTool.mock.calls.length +
        mockedFindBusiness.mock.calls.length;
      expect(llamados).toBe(1);
    });
  }

  it("401 si el cuerpo cambia después de firmarlo", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/retell",
      headers: {
        "content-type": "application/json",
        "x-retell-signature": await firmar(CUERPO_EVENTO),
      },
      payload: CUERPO_EVENTO.replace("call_1", "call_2"),
    });
    expect(res.statusCode).toBe(401);
    expect(mockedHandleCallEnded).not.toHaveBeenCalled();
  });

  // La regresión: un 200 sin override_agent_id no rechaza en Retell, atiende
  // con el agente vinculado al número. La suspensión por impago no se cumplía.
  it("rechaza con reject: true la llamada de un negocio suspendido", async () => {
    mockedFindBusiness.mockResolvedValue({
      id: "negocio_1",
      callsSuspendedAt: new Date("2026-10-01T00:00:00Z"),
      paymentFailureSuspensionAt: null,
      agents: [{ retellAgentId: "agent_1" }],
    } as never);

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/retell/inbound",
      headers: {
        "content-type": "application/json",
        "x-retell-signature": await firmar(CUERPO_ENTRANTE),
      },
      payload: CUERPO_ENTRANTE,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ call_inbound: { reject: true } });
  });

  it("atiende con el agente del negocio cuando está al día", async () => {
    mockedFindBusiness.mockResolvedValue({
      id: "negocio_1",
      callsSuspendedAt: null,
      paymentFailureSuspensionAt: null,
      agents: [{ retellAgentId: "agent_1" }],
    } as never);

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/retell/inbound",
      headers: {
        "content-type": "application/json",
        "x-retell-signature": await firmar(CUERPO_ENTRANTE),
      },
      payload: CUERPO_ENTRANTE,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().call_inbound.override_agent_id).toBe("agent_1");
    expect(res.json().call_inbound.reject).toBeUndefined();
  });

  it("el hook no se escapa a rutas de fuera del plugin", async () => {
    const res = await app.inject({ method: "POST", url: "/fuera-del-plugin" });
    expect(res.statusCode).toBe(200);
  });
});
