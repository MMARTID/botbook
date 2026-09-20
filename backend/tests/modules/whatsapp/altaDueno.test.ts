import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import { prisma } from "../../../src/lib/prisma.js";
import { reclamarEnvio } from "../../../src/lib/messageIdempotency.js";
import {
  audienciaDelNumero,
  enviarPlantilla,
  refrescarPlantilla,
  resolverPlantilla,
  resolverRemitente,
} from "../../../src/modules/whatsapp/service.js";
import {
  bajaVigente,
  revocarBaja,
  registrarBaja,
} from "../../../src/modules/whatsapp/bajas.js";
import {
  activarAvisosDelDueno,
  asegurarCodigoAlta,
  cambiarMovilDelDueno,
  construirEnlaceAlta,
  estadoWhatsappDelDueno,
  generarCodigoAlta,
  iniciarActivacionDelDueno,
  limpiarDuenoSinWhatsapp,
  marcarDuenoSinWhatsapp,
  nombreParaWhatsapp,
  normalizarCodigoAlta,
  NumeroDeAlhablaError,
  puedeRecibirAvisos,
  reactivarDueno,
  resumenWhatsappDelDueno,
} from "../../../src/modules/whatsapp/altaDueno.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    inboundMessage: { update: vi.fn() },
    sentMessage: { count: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("../../../src/lib/messageIdempotency.js", () => ({
  reclamarEnvio: vi.fn(),
}));

vi.mock("../../../src/modules/whatsapp/service.js", () => ({
  audienciaDelNumero: vi.fn(),
  enviarPlantilla: vi.fn(),
  refrescarPlantilla: vi.fn(),
  resolverPlantilla: vi.fn(),
  resolverRemitente: vi.fn(),
}));

vi.mock("../../../src/modules/whatsapp/bajas.js", () => ({
  bajaVigente: vi.fn(),
  revocarBaja: vi.fn(),
  registrarBaja: vi.fn(),
}));

const mockedFindUnique = vi.mocked(prisma.business.findUnique);
const mockedUpdate = vi.mocked(prisma.business.update);
const mockedUpdateMany = vi.mocked(prisma.business.updateMany);
const mockedInboundUpdate = vi.mocked(prisma.inboundMessage.update);
const mockedSentCount = vi.mocked(prisma.sentMessage.count);
const mockedSentUpdateMany = vi.mocked(prisma.sentMessage.updateMany);
const mockedReclamar = vi.mocked(reclamarEnvio);
const mockedAudiencia = vi.mocked(audienciaDelNumero);
const mockedEnviarPlantilla = vi.mocked(enviarPlantilla);
const mockedRefrescar = vi.mocked(refrescarPlantilla);
const mockedResolverPlantilla = vi.mocked(resolverPlantilla);
const mockedResolverRemitente = vi.mocked(resolverRemitente);
const mockedBajaVigente = vi.mocked(bajaVigente);
const mockedRevocarBaja = vi.mocked(revocarBaja);

const MOVIL = "+34600123456";
const OTRO_MOVIL = "+34692138456";
const NEGOCIOS = "+34930453218";
const AHORA = new Date("2026-09-20T12:00:00Z");
const EN_UNA_SEMANA = new Date("2026-09-27T12:00:00Z");

function negocio(overrides: Record<string, unknown> = {}) {
  return {
    id: "biz_1",
    name: "Peluquería Ana",
    active: true,
    subscriptionStatus: "ACTIVE",
    ownerWhatsappNumber: MOVIL,
    ownerWhatsappOptInAt: null,
    ownerWhatsappOptInVia: null,
    ownerWhatsappOptOutAt: null,
    ownerWhatsappUnreachableAt: null,
    ownerWhatsappActivationSentAt: null,
    ownerAltaCode: "7KP3MQ",
    ownerAltaCodeExpiresAt: EN_UNA_SEMANA,
    ...overrides,
  };
}

describe("generarCodigoAlta / normalizarCodigoAlta / construirEnlaceAlta", () => {
  it("genera seis símbolos del alfabeto sin 0/O/1/I con crypto.randomBytes", () => {
    const spy = vi.spyOn(crypto, "randomBytes");
    const codigos = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const codigo = generarCodigoAlta();
      expect(codigo).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      codigos.add(codigo);
    }
    expect(codigos.size).toBe(1000);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("normaliza lo que teclea la gente y rechaza lo que no es del alfabeto", () => {
    expect(normalizarCodigoAlta("7kp3mq")).toBe("7KP3MQ");
    expect(normalizarCodigoAlta("7KP-3MQ")).toBe("7KP3MQ");
    expect(normalizarCodigoAlta("7KP3M")).toBeNull();
    expect(normalizarCodigoAlta("7KP0MQ")).toBeNull();
  });

  it("construye el enlace wa.me con el mensaje ya escrito", () => {
    expect(construirEnlaceAlta("+34930453218", "7KP3MQ")).toBe(
      "https://wa.me/34930453218?text=ALTA%207KP3MQ"
    );
  });
});

describe("nombreParaWhatsapp", () => {
  it("deja un nombre normal tal cual y sanea el resto", () => {
    expect(nombreParaWhatsapp({ name: "Peluquería Ana" })).toBe(
      "Peluquería Ana"
    );
    expect(nombreParaWhatsapp({ name: "Negocio de juan@gmail.com" })).toBe(
      "tu negocio"
    );
    expect(nombreParaWhatsapp({ name: "Juan @ Peluquería" })).toBe(
      "tu negocio"
    );
    expect(nombreParaWhatsapp({ name: "Bar\n\nPepe" })).toBe("Bar Pepe");
    expect(nombreParaWhatsapp({ name: "  Bar   Pepe  " })).toBe("Bar Pepe");
    expect(nombreParaWhatsapp({ name: "a".repeat(100) })).toHaveLength(60);
    expect(nombreParaWhatsapp({ name: "   " })).toBe("tu negocio");
  });
});

describe("estadoWhatsappDelDueno / puedeRecibirAvisos", () => {
  const base = {
    ownerWhatsappNumber: MOVIL,
    ownerWhatsappOptInAt: AHORA,
    ownerWhatsappOptOutAt: null,
    ownerWhatsappUnreachableAt: null,
  };

  it("cubre los cinco estados y su prioridad", () => {
    expect(
      estadoWhatsappDelDueno({ ...base, ownerWhatsappNumber: null }, null)
    ).toBe("sin_numero");
    expect(
      estadoWhatsappDelDueno({ ...base, ownerWhatsappOptOutAt: AHORA }, null)
    ).toBe("baja");
    expect(
      estadoWhatsappDelDueno(
        { ...base, ownerWhatsappOptInAt: null },
        { optedOutAt: AHORA }
      )
    ).toBe("baja");
    expect(
      estadoWhatsappDelDueno(
        { ...base, ownerWhatsappUnreachableAt: AHORA },
        null
      )
    ).toBe("sin_whatsapp");
    expect(estadoWhatsappDelDueno(base, null)).toBe("activo");
    expect(
      estadoWhatsappDelDueno({ ...base, ownerWhatsappOptInAt: null }, null)
    ).toBe("pendiente");
    // optIn puesto y optOut null ⇒ activo aunque hubiera habido un STOP antes.
    expect(
      estadoWhatsappDelDueno({ ...base, ownerWhatsappOptOutAt: null }, null)
    ).toBe("activo");
  });

  it("solo recibe avisos un móvil activo", () => {
    expect(puedeRecibirAvisos(base, null)).toBe(true);
    expect(
      puedeRecibirAvisos({ ...base, ownerWhatsappOptInAt: null }, null)
    ).toBe(false);
    expect(puedeRecibirAvisos(base, { optedOutAt: AHORA })).toBe(false);
    expect(
      puedeRecibirAvisos({ ...base, ownerWhatsappUnreachableAt: AHORA }, null)
    ).toBe(false);
    expect(
      puedeRecibirAvisos({ ...base, ownerWhatsappNumber: null }, null)
    ).toBe(false);
  });
});

describe("cambiarMovilDelDueno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAudiencia.mockResolvedValue(null);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("el primer móvil (columna a NULL) se guarda: el where casa la fila en NULL o distinta", async () => {
    mockedUpdateMany.mockResolvedValue({ count: 1 });

    expect(await cambiarMovilDelDueno("biz_1", MOVIL)).toEqual({ count: 1 });
    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "biz_1",
        OR: [
          { ownerWhatsappNumber: null },
          { ownerWhatsappNumber: { not: MOVIL } },
        ],
      },
      data: expect.objectContaining({
        ownerWhatsappNumber: MOVIL,
        ownerWhatsappOptInAt: null,
        ownerWhatsappOptInVia: null,
        ownerWhatsappOptInMessageId: null,
        ownerWhatsappOptOutAt: null,
        ownerWhatsappUnreachableAt: null,
        ownerWhatsappActivationSentAt: null,
        ownerWindowOpenUntil: null,
        ownerAltaCode: expect.stringMatching(/^[A-HJ-NP-Z2-9]{6}$/),
        ownerAltaCodeExpiresAt: expect.any(Date),
      }),
    });
  });

  it("el mismo número no reinicia nada (count 0)", async () => {
    mockedUpdateMany.mockResolvedValue({ count: 0 });
    expect(await cambiarMovilDelDueno("biz_1", MOVIL)).toEqual({ count: 0 });
  });

  it("quitar el móvil reinicia el estado y deja el código a null", async () => {
    mockedUpdateMany.mockResolvedValue({ count: 1 });

    await cambiarMovilDelDueno("biz_1", null);

    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: { id: "biz_1", ownerWhatsappNumber: { not: null } },
      data: expect.objectContaining({
        ownerWhatsappNumber: null,
        ownerAltaCode: null,
        ownerAltaCodeExpiresAt: null,
        ownerWhatsappOptInAt: null,
      }),
    });
  });

  it("un número de Alhabla se rechaza sin tocar la base de datos", async () => {
    mockedAudiencia.mockResolvedValue("owner");

    await expect(
      cambiarMovilDelDueno("biz_1", NEGOCIOS)
    ).rejects.toBeInstanceOf(NumeroDeAlhablaError);
    expect(mockedUpdateMany).not.toHaveBeenCalled();
  });

  it("una colisión del código (P2002) se reintenta hasta tres veces", async () => {
    mockedUpdateMany
      .mockRejectedValueOnce({ code: "P2002" })
      .mockRejectedValueOnce({ code: "P2002" })
      .mockResolvedValueOnce({ count: 1 });

    expect(await cambiarMovilDelDueno("biz_1", MOVIL)).toEqual({ count: 1 });
    expect(mockedUpdateMany).toHaveBeenCalledTimes(3);

    mockedUpdateMany.mockReset();
    mockedUpdateMany.mockRejectedValue({ code: "P2002" });
    await expect(cambiarMovilDelDueno("biz_1", MOVIL)).rejects.toEqual({
      code: "P2002",
    });
    expect(mockedUpdateMany).toHaveBeenCalledTimes(3);
  });
});

describe("asegurarCodigoAlta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("con un código vigente no escribe", async () => {
    mockedFindUnique.mockResolvedValue(negocio() as never);

    expect(await asegurarCodigoAlta("biz_1")).toEqual({
      code: "7KP3MQ",
      expiresAt: EN_UNA_SEMANA,
    });
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("caducado o ausente ⇒ genera uno nuevo con caducidad a 7 días", async () => {
    mockedFindUnique.mockResolvedValue(
      negocio({ ownerAltaCodeExpiresAt: new Date(Date.now() - 1000) }) as never
    );
    mockedUpdate.mockResolvedValue({} as never);

    const antes = Date.now();
    const resultado = await asegurarCodigoAlta("biz_1");
    expect(resultado.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(resultado.expiresAt.getTime()).toBeGreaterThanOrEqual(
      antes + 7 * 24 * 60 * 60 * 1000 - 5
    );
    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: {
        ownerAltaCode: resultado.code,
        ownerAltaCodeExpiresAt: resultado.expiresAt,
      },
    });

    mockedFindUnique.mockResolvedValue(
      negocio({ ownerAltaCode: null, ownerAltaCodeExpiresAt: null }) as never
    );
    await asegurarCodigoAlta("biz_1");
    expect(mockedUpdate).toHaveBeenCalledTimes(2);
  });
});

describe("activarAvisosDelDueno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    mockedRevocarBaja.mockResolvedValue(0);
    mockedInboundUpdate.mockResolvedValue({} as never);
  });

  it("por código: el where lleva el código, y el data lo consume, limpia baja y 131026 y abre la ventana", async () => {
    mockedFindUnique.mockResolvedValue({ ownerWhatsappNumber: MOVIL } as never);
    mockedUpdateMany.mockResolvedValue({ count: 1 });

    const resultado = await activarAvisosDelDueno({
      businessId: "biz_1",
      from: MOVIL,
      via: "alta_codigo",
      inboundMessageId: "in_1",
      codigo: "7KP3MQ",
    });

    expect(resultado).toEqual({ count: 1, numeroAnterior: MOVIL });
    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: { id: "biz_1", active: true, ownerAltaCode: "7KP3MQ" },
      data: expect.objectContaining({
        ownerWhatsappNumber: MOVIL,
        ownerWhatsappOptInAt: expect.any(Date),
        ownerWhatsappOptInVia: "alta_codigo",
        ownerWhatsappOptInMessageId: "in_1",
        ownerWhatsappOptOutAt: null,
        ownerWhatsappUnreachableAt: null,
        ownerWindowOpenUntil: expect.any(Date),
        ownerAltaCode: null,
        ownerAltaCodeExpiresAt: null,
      }),
    });
    expect(mockedRevocarBaja).toHaveBeenCalledWith({
      phoneNumber: MOVIL,
      audience: "owner",
      inboundMessageId: "in_1",
    });
    expect(mockedInboundUpdate).toHaveBeenCalledWith({
      where: { id: "in_1" },
      data: { role: "owner", businessId: "biz_1" },
    });
  });

  it("por botón no exige código, pero el where lleva el móvil del remitente", async () => {
    mockedFindUnique.mockResolvedValue({ ownerWhatsappNumber: MOVIL } as never);
    mockedUpdateMany.mockResolvedValue({ count: 1 });

    await activarAvisosDelDueno({
      businessId: "biz_1",
      from: MOVIL,
      via: "boton_plantilla",
      inboundMessageId: "in_2",
    });

    expect(mockedUpdateMany.mock.calls[0][0].where).toEqual({
      id: "biz_1",
      active: true,
      ownerWhatsappNumber: MOVIL,
    });
  });

  it("por botón, si el negocio cambió de móvil entre la comprobación y la escritura ⇒ count 0 sin pisar el cambio", async () => {
    // El PATCH ya guardó otro número: el updateMany condicional no casa.
    mockedFindUnique.mockResolvedValue({
      ownerWhatsappNumber: OTRO_MOVIL,
    } as never);
    mockedUpdateMany.mockResolvedValue({ count: 0 });
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const resultado = await activarAvisosDelDueno({
      businessId: "biz_1",
      from: MOVIL,
      via: "boton_plantilla",
      inboundMessageId: "in_2b",
    });

    expect(resultado).toEqual({ count: 0, numeroAnterior: OTRO_MOVIL });
    expect(mockedUpdateMany.mock.calls[0][0].where).toMatchObject({
      ownerWhatsappNumber: MOVIL,
    });
    expect(mockedRevocarBaja).not.toHaveBeenCalled();
    expect(mockedInboundUpdate).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("count 0 (otro proceso consumió el código) ⇒ sin efectos", async () => {
    mockedFindUnique.mockResolvedValue({ ownerWhatsappNumber: MOVIL } as never);
    mockedUpdateMany.mockResolvedValue({ count: 0 });

    const resultado = await activarAvisosDelDueno({
      businessId: "biz_1",
      from: MOVIL,
      via: "alta_codigo",
      inboundMessageId: "in_3",
      codigo: "7KP3MQ",
    });

    expect(resultado.count).toBe(0);
    expect(mockedRevocarBaja).not.toHaveBeenCalled();
    expect(mockedInboundUpdate).not.toHaveBeenCalled();
  });

  it("si el móvil que consiente no es el tecleado, avisa del cambio (gancho, hoy un warn)", async () => {
    mockedFindUnique.mockResolvedValue({ ownerWhatsappNumber: MOVIL } as never);
    mockedUpdateMany.mockResolvedValue({ count: 1 });
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const resultado = await activarAvisosDelDueno({
      businessId: "biz_1",
      from: OTRO_MOVIL,
      via: "alta_codigo",
      inboundMessageId: "in_4",
      codigo: "7KP3MQ",
    });

    expect(resultado).toEqual({ count: 1, numeroAnterior: MOVIL });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `se activó desde ${OTRO_MOVIL}, distinto del móvil tecleado ${MOVIL}`
      )
    );
    warnSpy.mockRestore();
  });
});

describe("reactivarDueno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    mockedRevocarBaja.mockResolvedValue(1);
  });

  it("solo reactiva negocios que ya consintieron y están de baja, y consume el código", async () => {
    mockedUpdateMany.mockResolvedValue({ count: 2 });

    expect(
      await reactivarDueno({ from: MOVIL, inboundMessageId: "in_5" })
    ).toEqual({
      count: 2,
    });
    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: {
        ownerWhatsappNumber: MOVIL,
        active: true,
        ownerWhatsappOptInAt: { not: null },
        ownerWhatsappOptOutAt: { not: null },
      },
      data: expect.objectContaining({
        ownerWhatsappOptInVia: "alta_palabra",
        ownerWhatsappOptInMessageId: "in_5",
        ownerWhatsappOptOutAt: null,
        ownerAltaCode: null,
        ownerAltaCodeExpiresAt: null,
      }),
    });
    expect(mockedRevocarBaja).toHaveBeenCalledWith({
      phoneNumber: MOVIL,
      audience: "owner",
      inboundMessageId: "in_5",
    });
  });
});

describe("iniciarActivacionDelDueno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockedBajaVigente.mockResolvedValue(null);
    mockedResolverPlantilla.mockResolvedValue({
      telnyxTemplateId: "tpl-bienvenida",
      name: "bienvenida_negocio",
      language: "es",
    });
    mockedSentCount.mockResolvedValue(0);
    mockedUpdateMany.mockResolvedValue({ count: 1 });
    mockedUpdate.mockResolvedValue({} as never);
    mockedReclamar.mockResolvedValue(true);
    mockedEnviarPlantilla.mockResolvedValue({
      messageId: "msg-act-1",
      status: "queued",
      from: NEGOCIOS,
    });
  });

  it("sin número, ya activo y de baja se resuelven sin enviar nada", async () => {
    mockedFindUnique.mockResolvedValue(
      negocio({ ownerWhatsappNumber: null }) as never
    );
    expect(await iniciarActivacionDelDueno("biz_1")).toEqual({
      outcome: "sin_numero",
    });

    mockedFindUnique.mockResolvedValue(
      negocio({ ownerWhatsappOptInAt: AHORA }) as never
    );
    expect(await iniciarActivacionDelDueno("biz_1")).toEqual({
      outcome: "ya_activo",
    });

    mockedFindUnique.mockResolvedValue(negocio() as never);
    mockedBajaVigente.mockResolvedValue({ optedOutAt: AHORA, keyword: "STOP" });
    expect(await iniciarActivacionDelDueno("biz_1")).toEqual({
      outcome: "baja",
    });

    expect(mockedEnviarPlantilla).not.toHaveBeenCalled();
  });

  it("plantilla sin aprobar ⇒ solo el enlace (y el código queda asegurado)", async () => {
    mockedFindUnique.mockResolvedValue(negocio() as never);
    mockedResolverPlantilla.mockResolvedValue(null);

    expect(await iniciarActivacionDelDueno("biz_1")).toEqual({
      outcome: "plantilla_pendiente",
      sent: "link",
    });
    expect(mockedEnviarPlantilla).not.toHaveBeenCalled();
  });

  it("sin plan activo o en prueba no sale plantilla aunque esté aprobada", async () => {
    mockedFindUnique.mockResolvedValue(
      negocio({ subscriptionStatus: null }) as never
    );
    expect(await iniciarActivacionDelDueno("biz_1")).toEqual({
      outcome: "sin_plan",
      sent: "link",
    });

    mockedFindUnique.mockResolvedValue(
      negocio({ subscriptionStatus: "CANCELED" }) as never
    );
    expect(await iniciarActivacionDelDueno("biz_1")).toEqual({
      outcome: "sin_plan",
      sent: "link",
    });
    expect(mockedEnviarPlantilla).not.toHaveBeenCalled();
  });

  it("con TRIALING envía: freno atómico, fila reclamada con datos, plantilla con el nombre saneado", async () => {
    mockedFindUnique.mockResolvedValue(
      negocio({
        subscriptionStatus: "TRIALING",
        name: "Negocio de ana@x.es",
      }) as never
    );

    const resultado = await iniciarActivacionDelDueno("biz_1");

    expect(resultado).toEqual({ outcome: "enviada", sent: "template" });
    expect(mockedSentCount).toHaveBeenCalledWith({
      where: {
        toNumber: MOVIL,
        callbackData: { startsWith: "alta:" },
        sentAt: { gt: expect.any(Date) },
        NOT: { deliveryStatus: { in: ["failed", "suppressed"] } },
      },
    });
    // Orden: freno → reclamo → envío.
    const frenoCall = mockedUpdateMany.mock.invocationCallOrder[0];
    const reclamoCall = mockedReclamar.mock.invocationCallOrder[0];
    const envioCall = mockedEnviarPlantilla.mock.invocationCallOrder[0];
    expect(frenoCall).toBeLessThan(reclamoCall);
    expect(reclamoCall).toBeLessThan(envioCall);
    expect(mockedUpdateMany.mock.calls[0][0]).toEqual({
      where: {
        id: "biz_1",
        OR: [
          { ownerWhatsappActivationSentAt: null },
          { ownerWhatsappActivationSentAt: { lt: expect.any(Date) } },
        ],
      },
      data: { ownerWhatsappActivationSentAt: expect.any(Date) },
    });
    expect(mockedReclamar).toHaveBeenCalledWith(
      "whatsapp",
      expect.stringMatching(/^alta:biz_1:\d+$/),
      {
        businessId: "biz_1",
        audience: "owner",
        toNumber: MOVIL,
        callbackData: "alta:biz_1",
        kind: "template",
      }
    );
    expect(mockedEnviarPlantilla).toHaveBeenCalledWith({
      audience: "owner",
      to: MOVIL,
      template: { key: "bienvenida_negocio" },
      bodyParams: { negocio_nombre: "tu negocio" },
      businessId: "biz_1",
      idempotencyKey: expect.stringMatching(/^alta:biz_1:\d+$/),
      callbackData: "alta:biz_1",
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("msg-act-1")
    );
    // Tras enviar se limpia una marca de 131026 anterior.
    expect(mockedUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "biz_1" },
      data: { ownerWhatsappUnreachableAt: null },
    });
  });

  it("tope por destino: dos plantillas de activación a ese móvil en 24 h ⇒ no envía", async () => {
    mockedFindUnique.mockResolvedValue(negocio() as never);
    mockedSentCount.mockResolvedValue(2);

    expect(await iniciarActivacionDelDueno("biz_1")).toEqual({
      outcome: "limite_destino",
    });
    expect(mockedUpdateMany).not.toHaveBeenCalled();
    expect(mockedEnviarPlantilla).not.toHaveBeenCalled();
    // Solo cuentan las que salieron: ni fallidas ni suprimidas.
    expect(mockedSentCount).toHaveBeenCalledWith({
      where: {
        toNumber: MOVIL,
        callbackData: { startsWith: "alta:" },
        sentAt: { gt: expect.any(Date) },
        NOT: { deliveryStatus: { in: ["failed", "suppressed"] } },
      },
    });
  });

  it("dos fallos de Telnyx no agotan el tope: las filas fallidas quedan marcadas y la tercera activación envía", async () => {
    mockedFindUnique.mockResolvedValue(negocio() as never);
    mockedSentUpdateMany.mockResolvedValue({ count: 1 });
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    // El contador solo cuenta filas que no estén failed/suppressed: con las
    // dos marcadas como fallidas sigue en 0.
    const filas: Array<{ key: string; status: string | null }> = [];
    mockedReclamar.mockImplementation(async (_canal, key) => {
      filas.push({ key, status: null });
      return true;
    });
    mockedSentUpdateMany.mockImplementation(async (args) => {
      const key = (args.where as { idempotencyKey?: string }).idempotencyKey;
      const fila = filas.find((f) => f.key === key);
      if (fila)
        fila.status = (args.data as { deliveryStatus: string }).deliveryStatus;
      return { count: fila ? 1 : 0 };
    });
    mockedSentCount.mockImplementation(
      async () =>
        filas.filter((f) => f.status !== "failed" && f.status !== "suppressed")
          .length
    );

    mockedEnviarPlantilla
      .mockRejectedValueOnce(new Error("Telnyx 503"))
      .mockRejectedValueOnce(new Error("Telnyx 503"));

    expect((await iniciarActivacionDelDueno("biz_1")).outcome).toBe(
      "envio_fallido"
    );
    expect((await iniciarActivacionDelDueno("biz_1")).outcome).toBe(
      "envio_fallido"
    );
    expect(mockedSentUpdateMany).toHaveBeenCalledWith({
      where: { channel: "whatsapp", idempotencyKey: filas[0].key },
      data: {
        deliveryStatus: "failed",
        errorCode: "SEND_ERROR",
        errorDetail: "Telnyx 503",
      },
    });

    expect(await iniciarActivacionDelDueno("biz_1")).toEqual({
      outcome: "enviada",
      sent: "template",
    });
    expect(mockedEnviarPlantilla).toHaveBeenCalledTimes(3);
    errorSpy.mockRestore();
  });

  it("freno atómico: si el updateMany condicional no casa, es demasiado pronto", async () => {
    const hace2min = new Date(Date.now() - 2 * 60 * 1000);
    mockedFindUnique.mockResolvedValue(
      negocio({ ownerWhatsappActivationSentAt: hace2min }) as never
    );
    mockedUpdateMany.mockResolvedValue({ count: 0 });

    const resultado = await iniciarActivacionDelDueno("biz_1");

    expect(resultado.outcome).toBe("demasiado_pronto");
    const retry = (resultado as { retryAfterSeconds: number })
      .retryAfterSeconds;
    expect(retry).toBeGreaterThan(170);
    expect(retry).toBeLessThanOrEqual(181);
    expect(mockedReclamar).not.toHaveBeenCalled();
    expect(mockedEnviarPlantilla).not.toHaveBeenCalled();
  });

  it("si el adaptador falla: log, reversión del freno al valor anterior y enlace", async () => {
    const anterior = new Date("2026-09-20T11:00:00Z");
    mockedFindUnique.mockResolvedValue(
      negocio({ ownerWhatsappActivationSentAt: anterior }) as never
    );
    mockedEnviarPlantilla.mockRejectedValue(new Error("Telnyx 500"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(await iniciarActivacionDelDueno("biz_1")).toEqual({
      outcome: "envio_fallido",
      sent: "link",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Telnyx 500")
    );
    expect(mockedUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "biz_1", ownerWhatsappActivationSentAt: expect.any(Date) },
      data: { ownerWhatsappActivationSentAt: anterior },
    });
    errorSpy.mockRestore();
  });
});

describe("marcarDuenoSinWhatsapp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("solo marca si el móvil sigue siendo el del negocio, y avisa (gancho)", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    mockedUpdateMany.mockResolvedValue({ count: 1 });

    await marcarDuenoSinWhatsapp("biz_1", MOVIL, AHORA);

    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: { id: "biz_1", ownerWhatsappNumber: MOVIL },
      data: { ownerWhatsappUnreachableAt: AHORA },
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("131026"));
    warnSpy.mockRestore();
  });

  it("con otro número guardado solo lo deja en el log", async () => {
    mockedUpdateMany.mockResolvedValue({ count: 0 });
    await marcarDuenoSinWhatsapp("biz_1", MOVIL, AHORA);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("ya usa otro número")
    );
  });

  it("limpiarDuenoSinWhatsapp exige que el envío fuera al móvil actual del negocio", async () => {
    mockedUpdateMany.mockResolvedValue({ count: 0 });

    await limpiarDuenoSinWhatsapp("biz_1", OTRO_MOVIL);

    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "biz_1",
        ownerWhatsappNumber: OTRO_MOVIL,
        ownerWhatsappUnreachableAt: { not: null },
      },
      data: { ownerWhatsappUnreachableAt: null },
    });
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining("vuelve a ser alcanzable")
    );

    mockedUpdateMany.mockResolvedValue({ count: 1 });
    await limpiarDuenoSinWhatsapp("biz_1", MOVIL);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(
        `${MOVIL} del negocio biz_1 vuelve a ser alcanzable`
      )
    );
  });
});

describe("resumenWhatsappDelDueno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedBajaVigente.mockResolvedValue(null);
    mockedResolverRemitente.mockResolvedValue({
      phoneNumber: NEGOCIOS,
      source: "db",
    });
    mockedResolverPlantilla.mockResolvedValue(null);
    mockedUpdate.mockResolvedValue({} as never);
  });

  it("pendiente: sin plantilla aprobada refresca por si acaso y devuelve el bloque ALTA", async () => {
    mockedFindUnique.mockResolvedValue(negocio() as never);

    const estado = await resumenWhatsappDelDueno("biz_1");

    expect(mockedRefrescar).toHaveBeenCalledWith("bienvenida_negocio");
    expect(estado).toEqual({
      ownerWhatsappNumber: MOVIL,
      status: "pendiente",
      optInAt: null,
      optInVia: null,
      optOutAt: null,
      unreachableAt: null,
      activationSentAt: null,
      templateApproved: false,
      canSendTemplate: false,
      alhablaNumber: NEGOCIOS,
      alta: {
        code: "7KP3MQ",
        text: "ALTA 7KP3MQ",
        link: "https://wa.me/34930453218?text=ALTA%207KP3MQ",
        expiresAt: EN_UNA_SEMANA.toISOString(),
      },
    });
  });

  it("activo: sin bloque ALTA y canSendTemplate según plantilla y plan", async () => {
    mockedFindUnique.mockResolvedValue(
      negocio({
        ownerWhatsappOptInAt: AHORA,
        ownerWhatsappOptInVia: "alta_codigo",
      }) as never
    );
    mockedResolverPlantilla.mockResolvedValue({
      telnyxTemplateId: "tpl",
      name: "bienvenida_negocio",
      language: "es",
    });

    const estado = await resumenWhatsappDelDueno("biz_1");

    expect(estado).toEqual(
      expect.objectContaining({
        status: "activo",
        optInAt: AHORA.toISOString(),
        optInVia: "alta_codigo",
        templateApproved: true,
        canSendTemplate: true,
        alta: null,
      })
    );
    expect(mockedRefrescar).not.toHaveBeenCalled();
  });

  it("baja solo por la fila global ⇒ optOutAt sale de la fila", async () => {
    const optedOutAt = new Date("2026-09-19T09:00:00Z");
    mockedFindUnique.mockResolvedValue(negocio() as never);
    mockedBajaVigente.mockResolvedValue({ optedOutAt, keyword: "STOP" });

    const estado = await resumenWhatsappDelDueno("biz_1");

    expect(estado?.status).toBe("baja");
    expect(estado?.optOutAt).toBe(optedOutAt.toISOString());
  });

  it("negocio inexistente ⇒ null", async () => {
    mockedFindUnique.mockResolvedValue(null);
    expect(await resumenWhatsappDelDueno("biz_x")).toBeNull();
  });
});
