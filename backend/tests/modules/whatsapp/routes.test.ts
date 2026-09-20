import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { whatsappRoutes } from "../../../src/modules/whatsapp/routes.js";
import {
  iniciarActivacionDelDueno,
  resumenWhatsappDelDueno,
  type ResumenWhatsappDueno,
} from "../../../src/modules/whatsapp/altaDueno.js";

vi.mock("../../../src/modules/whatsapp/altaDueno.js", () => ({
  iniciarActivacionDelDueno: vi.fn(),
  resumenWhatsappDelDueno: vi.fn(),
}));

const mockedIniciar = vi.mocked(iniciarActivacionDelDueno);
const mockedResumen = vi.mocked(resumenWhatsappDelDueno);

function estado(
  overrides: Partial<ResumenWhatsappDueno> = {}
): ResumenWhatsappDueno {
  return {
    ownerWhatsappNumber: "+34600123456",
    status: "pendiente",
    optInAt: null,
    optInVia: null,
    optOutAt: null,
    unreachableAt: null,
    activationSentAt: null,
    templateApproved: false,
    canSendTemplate: false,
    alhablaNumber: "+34930453218",
    alta: {
      code: "7KP3MQ",
      text: "ALTA 7KP3MQ",
      link: "https://wa.me/34930453218?text=ALTA%207KP3MQ",
      expiresAt: "2026-09-27T12:00:00.000Z",
    },
    ...overrides,
  };
}

async function buildServer(autenticado = true) {
  const fastify = Fastify();
  fastify.decorate("authenticate", async (request: any, reply: any) => {
    if (!autenticado) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    request.user = { businessId: "biz_1" };
  });
  await fastify.register(whatsappRoutes);
  return fastify;
}

describe("GET /business/me/whatsapp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exige token", async () => {
    const fastify = await buildServer(false);
    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/whatsapp",
    });
    expect(response.statusCode).toBe(401);
    expect(mockedResumen).not.toHaveBeenCalled();
  });

  it("devuelve el estado del negocio del JWT con la forma completa", async () => {
    mockedResumen.mockResolvedValue(estado());
    const fastify = await buildServer();

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/whatsapp",
    });

    expect(response.statusCode).toBe(200);
    expect(mockedResumen).toHaveBeenCalledWith("biz_1");
    const body = response.json();
    expect(body).toEqual(estado());
    expect(body).not.toHaveProperty("ownerWhatsappOptInMessageId");
  });

  it("404 sin negocio y 500 si el resumen falla", async () => {
    const fastify = await buildServer();
    mockedResumen.mockResolvedValueOnce(null);
    expect(
      (await fastify.inject({ method: "GET", url: "/business/me/whatsapp" }))
        .statusCode
    ).toBe(404);

    mockedResumen.mockRejectedValueOnce(new Error("BD"));
    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/whatsapp",
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "No se pudo cargar el estado de WhatsApp",
    });
  });
});

describe("POST /business/me/whatsapp/activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedResumen.mockResolvedValue(estado());
  });

  it("traduce cada resultado del servicio a su código HTTP", async () => {
    const fastify = await buildServer();
    const post = () =>
      fastify.inject({
        method: "POST",
        url: "/business/me/whatsapp/activation",
      });

    mockedIniciar.mockResolvedValueOnce({ outcome: "sin_numero" });
    let response = await post();
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("OWNER_WHATSAPP_MISSING");

    mockedIniciar.mockResolvedValueOnce({ outcome: "ya_activo" });
    response = await post();
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("OWNER_WHATSAPP_ALREADY_ACTIVE");

    mockedResumen.mockResolvedValueOnce(
      estado({ status: "baja", optOutAt: "2026-09-19T09:00:00.000Z" })
    );
    mockedIniciar.mockResolvedValueOnce({ outcome: "baja" });
    response = await post();
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "OWNER_WHATSAPP_OPTED_OUT",
        status: "baja",
        optOutAt: "2026-09-19T09:00:00.000Z",
      })
    );

    mockedIniciar.mockResolvedValueOnce({ outcome: "limite_destino" });
    response = await post();
    expect(response.statusCode).toBe(429);
    expect(response.json().code).toBe("OWNER_WHATSAPP_DESTINATION_LIMIT");

    mockedIniciar.mockResolvedValueOnce({
      outcome: "demasiado_pronto",
      retryAfterSeconds: 180,
    });
    response = await post();
    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "OWNER_WHATSAPP_ACTIVATION_TOO_SOON",
        retryAfterSeconds: 180,
      })
    );
  });

  it("plantilla sin aprobar, sin plan o fallo del adaptador ⇒ 200 con sent: link; aprobada y con plan ⇒ template", async () => {
    const fastify = await buildServer();
    const post = () =>
      fastify.inject({
        method: "POST",
        url: "/business/me/whatsapp/activation",
      });

    for (const outcome of [
      "plantilla_pendiente",
      "sin_plan",
      "envio_fallido",
    ] as const) {
      mockedIniciar.mockResolvedValueOnce({ outcome, sent: "link" });
      const response = await post();
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ...estado(), sent: "link" });
    }

    mockedIniciar.mockResolvedValueOnce({
      outcome: "enviada",
      sent: "template",
    });
    mockedResumen.mockResolvedValueOnce(
      estado({
        templateApproved: true,
        canSendTemplate: true,
        activationSentAt: "2026-09-20T12:00:00.000Z",
      })
    );
    const response = await post();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        sent: "template",
        canSendTemplate: true,
        activationSentAt: "2026-09-20T12:00:00.000Z",
      })
    );
  });

  it("un businessId ajeno en el body se ignora: siempre el del JWT", async () => {
    const fastify = await buildServer();
    mockedIniciar.mockResolvedValueOnce({
      outcome: "plantilla_pendiente",
      sent: "link",
    });

    const response = await fastify.inject({
      method: "POST",
      url: "/business/me/whatsapp/activation",
      payload: { businessId: "biz_ajeno" },
    });

    expect(response.statusCode).toBe(200);
    expect(mockedIniciar).toHaveBeenCalledWith("biz_1");
    expect(mockedResumen).toHaveBeenCalledWith("biz_1");
  });

  it("exige token y devuelve 500 si el servicio lanza", async () => {
    let fastify = await buildServer(false);
    expect(
      (
        await fastify.inject({
          method: "POST",
          url: "/business/me/whatsapp/activation",
        })
      ).statusCode
    ).toBe(401);

    fastify = await buildServer();
    mockedIniciar.mockRejectedValueOnce(new Error("BD"));
    const response = await fastify.inject({
      method: "POST",
      url: "/business/me/whatsapp/activation",
    });
    expect(response.statusCode).toBe(500);
  });
});
