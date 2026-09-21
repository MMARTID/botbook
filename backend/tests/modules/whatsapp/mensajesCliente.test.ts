import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { enqueueWhatsappJob } from "../../../src/lib/cloudTasks.js";
import { reclamarEnvio } from "../../../src/lib/messageIdempotency.js";
import { PermanentJobError } from "../../../src/lib/jobErrors.js";
import {
  enviarPlantilla,
  refrescarPlantilla,
  resolverPlantilla,
  resolverRemitente,
} from "../../../src/modules/whatsapp/service.js";
import { nombreDeServicios } from "../../../src/modules/whatsapp/avisosNegocio.js";
import {
  estaDadoDeBaja,
  WhatsappOptOutError,
} from "../../../src/modules/whatsapp/bajas.js";
import {
  describirServicioParaCliente,
  elegirPlantillaCliente,
  enviarMensajeAlCliente,
  indiceDelBotonUrl,
  nombreParaCliente,
  parametrosAntiguos,
  parametrosConfirmacionConCabecera,
  parametrosConfirmacionV2,
  parametrosHoraDisponible,
  parametrosHuecoLibre,
  parametrosRecordatorioV2,
  placeIdValido,
  programarAvisoAlCliente,
  programarMensajesAlCliente,
  reiniciarAvisoDeIndiceUrl,
  sanearNombre,
  TARJETA_ALHABLA_RESERVAS,
  telefonoDeContacto,
  type ContextoCita,
} from "../../../src/modules/whatsapp/mensajesCliente.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    booking: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    business: { findUnique: vi.fn() },
    lead: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    professional: { findFirst: vi.fn() },
    sentMessage: { updateMany: vi.fn() },
  },
}));
vi.mock("../../../src/lib/cloudTasks.js", () => ({
  enqueueWhatsappJob: vi.fn(),
}));
vi.mock("../../../src/lib/messageIdempotency.js", () => ({
  reclamarEnvio: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/service.js", () => ({
  enviarPlantilla: vi.fn(),
  refrescarPlantilla: vi.fn(),
  resolverPlantilla: vi.fn(),
  resolverRemitente: vi.fn(),
}));
vi.mock(
  "../../../src/modules/whatsapp/avisosNegocio.js",
  async (importActual) => {
    const actual =
      await importActual<
        typeof import("../../../src/modules/whatsapp/avisosNegocio.js")
      >();
    return {
      formatearCita: actual.formatearCita,
      describirServicio: actual.describirServicio,
      nombreDeServicios: vi.fn(),
    };
  }
);
vi.mock("../../../src/modules/whatsapp/bajas.js", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../../src/modules/whatsapp/bajas.js")
    >();
  return { ...actual, estaDadoDeBaja: vi.fn() };
});

const mockedBookingFindUnique = vi.mocked(prisma.booking.findUnique);
const mockedBookingFindFirst = vi.mocked(prisma.booking.findFirst);
const mockedBookingUpdate = vi.mocked(prisma.booking.update);
const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedLeadFindFirst = vi.mocked(prisma.lead.findFirst);
const mockedLeadUpdate = vi.mocked(prisma.lead.update);
const mockedLeadUpdateMany = vi.mocked(prisma.lead.updateMany);
const mockedProfessionalFindFirst = vi.mocked(prisma.professional.findFirst);
const mockedSentUpdateMany = vi.mocked(prisma.sentMessage.updateMany);
const mockedEnqueue = vi.mocked(enqueueWhatsappJob);
const mockedReclamar = vi.mocked(reclamarEnvio);
const mockedEnviar = vi.mocked(enviarPlantilla);
const mockedRefrescar = vi.mocked(refrescarPlantilla);
const mockedResolver = vi.mocked(resolverPlantilla);
const mockedRemitente = vi.mocked(resolverRemitente);
const mockedNombreDeServicios = vi.mocked(nombreDeServicios);
const mockedBaja = vi.mocked(estaDadoDeBaja);

const CITA = new Date("2026-09-24T15:00:00Z"); // jueves 24 sept, 17:00 Madrid
const NEGOCIO: ContextoCita["negocio"] = {
  id: "biz_1",
  name: "Peluquería Ana",
  timezone: "Europe/Madrid",
  telnyxPhoneNumber: "+34930454394",
  phone: "+34930000000",
  placeId: "ChIJd8BlQ2BZwokRAFUEcm_qrcA",
};
const CTX: ContextoCita = {
  negocio: NEGOCIO,
  startDateTime: CITA,
  serviceNames: ["Corte", "Mechas"],
  professionalName: "Laura",
};

const FILA_V2 = {
  telnyxTemplateId: "tpl-conf-v2",
  name: "confirmacion_cita_v2",
  language: "es",
  components: [
    { type: "BODY", text: "Hola…" },
    {
      type: "BUTTONS",
      buttons: [
        { type: "QUICK_REPLY", text: "Guardar contacto" },
        {
          type: "URL",
          text: "Cómo llegar",
          url: "https://www.google.com/maps/search/?api=1&query=place_id:{{1}}",
        },
      ],
    },
  ],
};
const FILA_APROBADA = {
  telnyxTemplateId: "tpl-conf",
  name: "confirmacion_cita",
  language: "es_ES",
  components: null,
};

function sinPlantillas() {
  mockedResolver.mockResolvedValue(null);
}

function plantillas(porClave: Record<string, unknown>) {
  mockedResolver.mockImplementation(async (ref) =>
    "key" in ref ? ((porClave[ref.key] as never) ?? null) : null
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  delete process.env.WHATSAPP_TEMPLATE_CONFIRMATION_NAME;
  delete process.env.WHATSAPP_TEMPLATE_REMINDER_NAME;
  delete process.env.WHATSAPP_TEMPLATE_SLOT_AVAILABLE_NAME;
  delete process.env.WHATSAPP_TEMPLATE_LANGUAGE;
  mockedRefrescar.mockResolvedValue(undefined);
  mockedBaja.mockResolvedValue(false);
  mockedSentUpdateMany.mockResolvedValue({ count: 1 });
  mockedLeadUpdateMany.mockResolvedValue({ count: 1 });
  mockedEnqueue.mockResolvedValue(undefined);
  mockedReclamar.mockResolvedValue(true);
  mockedNombreDeServicios.mockResolvedValue(["Corte", "Mechas"]);
  reiniciarAvisoDeIndiceUrl();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

describe("helpers puros", () => {
  it("indiceDelBotonUrl: con components de Meta (QUICK_REPLY en 0, URL en 1) devuelve 1; con el URL en 0 devuelve 0; sin components devuelve 1 con warn", () => {
    expect(indiceDelBotonUrl(FILA_V2.components)).toBe(1);
    expect(
      indiceDelBotonUrl([
        {
          type: "BUTTONS",
          buttons: [{ type: "URL" }, { type: "QUICK_REPLY" }],
        },
      ])
    ).toBe(0);
    expect(console.warn).not.toHaveBeenCalled();
    expect(indiceDelBotonUrl(null)).toBe(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
    // Una vez por proceso.
    expect(indiceDelBotonUrl([{ type: "BODY" }])).toBe(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("placeIdValido acepta [A-Za-z0-9_-] y trata como ausente cualquier otro con warn", () => {
    expect(placeIdValido("ChIJd8BlQ2BZwokRAFUEcm_qrcA")).toBe(
      "ChIJd8BlQ2BZwokRAFUEcm_qrcA"
    );
    expect(placeIdValido(null)).toBeNull();
    expect(placeIdValido("")).toBeNull();
    expect(placeIdValido("abc&query=x", "biz_1")).toBeNull();
    expect(placeIdValido("a/b")).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(vi.mocked(console.warn).mock.calls[0][0]).toContain("biz_1");
  });

  it("telefonoDeContacto prefiere el número Telnyx formateado (+34 930 454 394), después phone E.164, nunca TEMP-, y sin ninguno devuelve null", () => {
    expect(telefonoDeContacto(NEGOCIO)).toBe("+34 930 454 394");
    expect(
      telefonoDeContacto({ telnyxPhoneNumber: null, phone: "+34930000000" })
    ).toBe("+34930000000");
    expect(
      telefonoDeContacto({ telnyxPhoneNumber: null, phone: "TEMP-abc" })
    ).toBeNull();
    expect(
      telefonoDeContacto({ telnyxPhoneNumber: null, phone: "" })
    ).toBeNull();
  });

  // Privacidad (PLAN-TELEFONIA-UX.md § 3, caso C): «no des mi número a los
  // clientes» oculta la línea del dueño (phone), nunca el número de Alhabla,
  // que atiende la recepcionista: sin él ninguna plantilla de confirmación,
  // cambio o cancelación podría salir.
  it("telefonoDeContacto con hideOwnerNumberFromClients sigue dando el número de Alhabla y solo sin él devuelve null (nunca phone)", () => {
    expect(
      telefonoDeContacto({ ...NEGOCIO, hideOwnerNumberFromClients: true })
    ).toBe("+34 930 454 394");
    expect(
      telefonoDeContacto({
        telnyxPhoneNumber: null,
        phone: "+34930000000",
        hideOwnerNumberFromClients: true,
      })
    ).toBeNull();
    // Sin la opción (o en false) todo sigue igual.
    expect(
      telefonoDeContacto({ ...NEGOCIO, hideOwnerNumberFromClients: false })
    ).toBe("+34 930 454 394");
  });

  it("nombreParaCliente: recorta a 60, y con «Negocio de Ana» o un nombre con @ devuelve «el negocio», nunca «tu negocio»", () => {
    expect(nombreParaCliente({ name: "  Peluquería\n  Ana " })).toBe(
      "Peluquería Ana"
    );
    expect(nombreParaCliente({ name: "x".repeat(70) })).toHaveLength(60);
    expect(nombreParaCliente({ name: "Negocio de Ana" })).toBe("el negocio");
    expect(nombreParaCliente({ name: "ana@correo.es" })).toBe("el negocio");
    expect(nombreParaCliente({ name: "   " })).toBe("el negocio");
    expect(nombreParaCliente({ name: "Negocio de Ana" })).not.toContain(
      "tu negocio"
    );
  });

  it("sanearNombre: 200 caracteres con saltos y emojis quedan en una línea de 80; vacío o no string ⇒ null", () => {
    const largo = `  Marta\n\n  ${"🌸 x".repeat(60)}`;
    const limpio = sanearNombre(largo)!;
    expect(limpio.length).toBeLessThanOrEqual(80);
    expect(limpio).not.toContain("\n");
    expect(limpio.startsWith("Marta 🌸")).toBe(true);
    expect(sanearNombre("   ")).toBeNull();
    expect(sanearNombre(undefined)).toBeNull();
    expect(sanearNombre(42)).toBeNull();
  });

  it("describirServicioParaCliente nunca devuelve vacío y no pone coma antes de con", () => {
    expect(describirServicioParaCliente(["Corte", "Mechas"], "Laura")).toBe(
      "Corte y Mechas con Laura"
    );
    expect(describirServicioParaCliente(["Corte"], null)).toBe("Corte");
    expect(describirServicioParaCliente([], "Laura")).toBe(
      "lo que pediste con Laura"
    );
    expect(describirServicioParaCliente([], null)).toBe("lo que pediste");
    expect(describirServicioParaCliente(["", " "], "")).toBe("lo que pediste");
    expect(describirServicioParaCliente(["Corte"], "Laura")).not.toContain(
      ", con"
    );
  });

  it("ningún parámetro lleva cadena vacía ni saltos de línea", () => {
    const sucio: ContextoCita = {
      negocio: { ...NEGOCIO, name: "Peluquería\nAna  " },
      startDateTime: CITA,
      serviceNames: ["Corte\nlargo"],
      professionalName: " Laura\n ",
    };
    const todos = [
      parametrosConfirmacionV2(sucio, "+34 930 454 394"),
      parametrosConfirmacionConCabecera(sucio, "+34 930 454 394"),
      parametrosAntiguos(
        { ...sucio, serviceNames: [], professionalName: null },
        "+34 930 454 394"
      ),
      parametrosRecordatorioV2(sucio),
      parametrosHuecoLibre(sucio),
      parametrosHoraDisponible(sucio, "+34 930 454 394"),
    ];
    for (const params of todos) {
      for (const valor of Object.values(params)) {
        expect(valor).not.toBe("");
        expect(valor).not.toMatch(/\n/);
        expect(valor).not.toMatch(/\s{2,}/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Cascada
// ---------------------------------------------------------------------------

describe("elegirPlantillaCliente", () => {
  it("confirmación: con v2 aprobada y placeId elige confirmacion_cita_v2 por id con exactamente {negocio_nombre, servicio, cita, negocio_telefono}, templateName/templateLanguage de la fila y buttonUrlParams [{index: <posición del URL en components>, text: placeId}]", async () => {
    plantillas({
      confirmacion_cita_v2: FILA_V2,
      confirmacion_cita: FILA_APROBADA,
    });

    const elegida = await elegirPlantillaCliente("confirmacion", CTX);

    expect(elegida).toEqual({
      etiqueta: "confirmacion_cita_v2",
      template: { id: "tpl-conf-v2" },
      templateName: "confirmacion_cita_v2",
      templateLanguage: "es",
      bodyParams: {
        negocio_nombre: "Peluquería Ana",
        servicio: "Corte y Mechas con Laura",
        cita: "jueves 24 de septiembre a las 17:00",
        negocio_telefono: "+34 930 454 394",
      },
      buttonUrlParams: [{ index: 1, text: "ChIJd8BlQ2BZwokRAFUEcm_qrcA" }],
      conBotones: true,
    });
    expect(
      Object.keys((elegida as { bodyParams: object }).bodyParams).sort()
    ).toEqual(["cita", "negocio_nombre", "negocio_telefono", "servicio"]);
  });

  it("confirmación: v2 aprobada sin placeId cae a confirmacion_cita con exactamente 5 parámetros, el profesional dentro de servicios y sin buttonUrlParams", async () => {
    plantillas({
      confirmacion_cita_v2: FILA_V2,
      confirmacion_cita: FILA_APROBADA,
    });

    const elegida = await elegirPlantillaCliente(
      "confirmacion",
      { ...CTX, negocio: { ...NEGOCIO, placeId: null } },
      { recursoId: "booking_1" }
    );

    expect(elegida).toEqual({
      etiqueta: "confirmacion_cita",
      template: { id: "tpl-conf" },
      templateName: "confirmacion_cita",
      templateLanguage: "es_ES",
      bodyParams: {
        negocio_nombre: "Peluquería Ana",
        servicios: "Corte y Mechas, con Laura",
        fecha_cita: "jue, 24 sept",
        hora_cita: "17:00",
        negocio_telefono: "+34 930 454 394",
      },
      conBotones: false,
    });
    expect(
      Object.keys((elegida as { bodyParams: object }).bodyParams)
    ).toHaveLength(5);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(
        "sin placeId: la confirmación de la reserva booking_1"
      )
    );
  });

  it("confirmación con sinV2: true salta la v2 aunque esté aprobada y haya placeId", async () => {
    plantillas({
      confirmacion_cita_v2: FILA_V2,
      confirmacion_cita: FILA_APROBADA,
    });

    const elegida = await elegirPlantillaCliente("confirmacion", CTX, {
      sinV2: true,
    });

    expect((elegida as { etiqueta: string }).etiqueta).toBe(
      "confirmacion_cita"
    );
    expect(mockedResolver).not.toHaveBeenCalledWith({
      key: "confirmacion_cita_v2",
    });
  });

  it("confirmación: sin fila aprobada usa WHATSAPP_TEMPLATE_CONFIRMATION_NAME + es con los 6 parámetros de siempre; sin variable devuelve motivo SIN_PLANTILLA", async () => {
    sinPlantillas();
    process.env.WHATSAPP_TEMPLATE_CONFIRMATION_NAME = "confirmacion_cita";

    const elegida = await elegirPlantillaCliente("confirmacion", CTX);

    expect(elegida).toEqual({
      etiqueta: "env:confirmacion_cita",
      template: { name: "confirmacion_cita", language: "es" },
      templateName: "confirmacion_cita",
      templateLanguage: "es",
      bodyParams: {
        negocio_nombre: "Peluquería Ana",
        servicios: "Corte + Mechas",
        fecha_cita: "jue, 24 sept",
        hora_cita: "17:00",
        profesional: "Laura",
        negocio_telefono: "+34 930 454 394",
      },
      conBotones: false,
    });

    delete process.env.WHATSAPP_TEMPLATE_CONFIRMATION_NAME;
    expect(await elegirPlantillaCliente("confirmacion", CTX)).toEqual({
      motivo: "SIN_PLANTILLA",
    });
  });

  it("la cascada llama a refrescarPlantilla(key) antes de resolver cada clave y usa la v2 si el WABA la devuelve APPROVED", async () => {
    // La fila estaba PENDING en la tabla; el refresco la pone APPROVED.
    const estado: Record<string, unknown> = {
      confirmacion_cita: FILA_APROBADA,
    };
    mockedRefrescar.mockImplementation(async (key) => {
      if (key === "confirmacion_cita_v2") estado.confirmacion_cita_v2 = FILA_V2;
    });
    mockedResolver.mockImplementation(async (ref) =>
      "key" in ref ? ((estado[ref.key] as never) ?? null) : null
    );

    const elegida = await elegirPlantillaCliente("confirmacion", CTX);

    expect((elegida as { etiqueta: string }).etiqueta).toBe(
      "confirmacion_cita_v2"
    );
    expect(mockedRefrescar.mock.invocationCallOrder[0]).toBeLessThan(
      mockedResolver.mock.invocationCallOrder[0]
    );
    expect(mockedRefrescar).toHaveBeenCalledWith("confirmacion_cita_v2");
  });

  it("recordatorio: recordatorio_cita_v2 ⇒ {negocio_nombre, servicio, cita}; recordatorio_cita ⇒ 6; env ⇒ 6", async () => {
    plantillas({
      recordatorio_cita_v2: {
        ...FILA_V2,
        telnyxTemplateId: "tpl-rec-v2",
        name: "recordatorio_cita_v2",
      },
    });
    const v2 = await elegirPlantillaCliente("recordatorio", CTX);
    expect(v2).toEqual({
      etiqueta: "recordatorio_cita_v2",
      template: { id: "tpl-rec-v2" },
      templateName: "recordatorio_cita_v2",
      templateLanguage: "es",
      bodyParams: {
        negocio_nombre: "Peluquería Ana",
        servicio: "Corte y Mechas con Laura",
        cita: "jueves 24 de septiembre a las 17:00",
      },
      conBotones: true,
    });

    plantillas({
      recordatorio_cita: {
        telnyxTemplateId: "tpl-rec",
        name: "recordatorio_cita",
        language: "es",
        components: null,
      },
    });
    const aprobada = await elegirPlantillaCliente("recordatorio", CTX);
    expect((aprobada as { etiqueta: string }).etiqueta).toBe(
      "recordatorio_cita"
    );
    expect(
      Object.keys((aprobada as { bodyParams: object }).bodyParams).sort()
    ).toEqual([
      "fecha_cita",
      "hora_cita",
      "negocio_nombre",
      "negocio_telefono",
      "profesional",
      "servicios",
    ]);

    sinPlantillas();
    process.env.WHATSAPP_TEMPLATE_REMINDER_NAME = "recordatorio_cita";
    const env = await elegirPlantillaCliente("recordatorio", CTX);
    expect((env as { etiqueta: string }).etiqueta).toBe(
      "env:recordatorio_cita"
    );
    expect(
      Object.keys((env as { bodyParams: object }).bodyParams)
    ).toHaveLength(6);
    delete process.env.WHATSAPP_TEMPLATE_REMINDER_NAME;
    expect(await elegirPlantillaCliente("recordatorio", CTX)).toEqual({
      motivo: "SIN_PLANTILLA",
    });
  });

  it("hueco libre: hueco_libre ⇒ {negocio_nombre, cita}; hora_disponible ⇒ {negocio_nombre, fecha_cita, hora_cita, negocio_telefono}", async () => {
    plantillas({
      hueco_libre: {
        telnyxTemplateId: "tpl-hueco",
        name: "hueco_libre",
        language: "es",
        components: null,
      },
    });
    const hueco = await elegirPlantillaCliente("hueco_libre", CTX);
    expect(hueco).toEqual({
      etiqueta: "hueco_libre",
      template: { id: "tpl-hueco" },
      templateName: "hueco_libre",
      templateLanguage: "es",
      bodyParams: {
        negocio_nombre: "Peluquería Ana",
        cita: "jueves 24 de septiembre a las 17:00",
      },
      conBotones: true,
    });

    plantillas({
      hora_disponible: {
        telnyxTemplateId: "tpl-hora",
        name: "hora_disponible",
        language: "es",
        components: null,
      },
    });
    const hora = await elegirPlantillaCliente("hueco_libre", CTX);
    expect(hora).toEqual({
      etiqueta: "hora_disponible",
      template: { id: "tpl-hora" },
      templateName: "hora_disponible",
      templateLanguage: "es",
      bodyParams: {
        negocio_nombre: "Peluquería Ana",
        fecha_cita: "jue, 24 sept",
        hora_cita: "17:00",
        negocio_telefono: "+34 930 454 394",
      },
      conBotones: false,
    });

    sinPlantillas();
    process.env.WHATSAPP_TEMPLATE_SLOT_AVAILABLE_NAME = "hora_disponible";
    const env = await elegirPlantillaCliente("hueco_libre", CTX);
    expect((env as { etiqueta: string }).etiqueta).toBe("env:hora_disponible");
    expect(
      Object.keys((env as { bodyParams: object }).bodyParams)
    ).toHaveLength(4);
  });

  // Privacidad (caso C): la recepcionista promete el WhatsApp al reservar,
  // así que la cascada no puede quedarse sin plantilla por la opción; el
  // número que va en `negocio_telefono` es el de Alhabla (lo atiende la
  // recepcionista), nunca la línea del dueño.
  it("con hideOwnerNumberFromClients la confirmación, el cambio y la cancelación salen con el número de Alhabla; solo sin número de Alhabla devuelve SIN_TELEFONO", async () => {
    plantillas({
      confirmacion_cita_v2: FILA_V2,
      confirmacion_cita: FILA_APROBADA,
      cambio_cita_cliente: {
        telnyxTemplateId: "tpl-cambio",
        name: "cambio_cita_cliente",
        language: "es",
        components: [],
      },
    });
    const privado = {
      ...CTX,
      negocio: { ...NEGOCIO, hideOwnerNumberFromClients: true },
    };

    const confirmacion = await elegirPlantillaCliente("confirmacion", privado);
    expect((confirmacion as { etiqueta: string }).etiqueta).toBe(
      "confirmacion_cita_v2"
    );
    expect(
      (confirmacion as { bodyParams: Record<string, string> }).bodyParams
        .negocio_telefono
    ).toBe("+34 930 454 394");

    const cambio = await elegirPlantillaCliente("cambio", privado);
    expect((cambio as { etiqueta: string }).etiqueta).toBe(
      "cambio_cita_cliente"
    );
    expect(
      (cambio as { bodyParams: Record<string, string> }).bodyParams
        .negocio_telefono
    ).toBe("+34 930 454 394");

    // Sin número de Alhabla, la línea del dueño NO se usa aunque sea E.164.
    expect(
      await elegirPlantillaCliente("confirmacion", {
        ...CTX,
        negocio: {
          ...NEGOCIO,
          telnyxPhoneNumber: null,
          hideOwnerNumberFromClients: true,
        },
      })
    ).toEqual({ motivo: "SIN_TELEFONO" });
  });

  it("sin teléfono de contacto se salta la plantilla que lo exige y devuelve SIN_TELEFONO", async () => {
    plantillas({
      confirmacion_cita_v2: FILA_V2,
      confirmacion_cita: FILA_APROBADA,
    });
    process.env.WHATSAPP_TEMPLATE_CONFIRMATION_NAME = "confirmacion_cita";
    const sinTelefono = {
      ...CTX,
      negocio: { ...NEGOCIO, telnyxPhoneNumber: null, phone: "TEMP-1" },
    };

    expect(await elegirPlantillaCliente("confirmacion", sinTelefono)).toEqual({
      motivo: "SIN_TELEFONO",
    });
    // hueco_libre no exige teléfono: sale igual.
    plantillas({
      hueco_libre: {
        telnyxTemplateId: "tpl-hueco",
        name: "hueco_libre",
        language: "es",
        components: null,
      },
    });
    expect(
      (
        (await elegirPlantillaCliente("hueco_libre", sinTelefono)) as {
          etiqueta: string;
        }
      ).etiqueta
    ).toBe("hueco_libre");
  });
});

// ---------------------------------------------------------------------------
// Programación
// ---------------------------------------------------------------------------

describe("cambio y cancelación (avisos que pide el dueño, fase 2 / PR 4)", () => {
  it("elige cambio_cita_cliente (4 parámetros, la hora nueva) y cancelacion_cita_cliente (3), ambas con botones y sin variable de entorno de respaldo", async () => {
    plantillas({
      cambio_cita_cliente: {
        telnyxTemplateId: "tpl-cambio",
        name: "cambio_cita_cliente",
        language: "es",
        components: null,
      },
      cancelacion_cita_cliente: {
        telnyxTemplateId: "tpl-cancel",
        name: "cancelacion_cita_cliente",
        language: "es",
        components: null,
      },
    });
    expect(await elegirPlantillaCliente("cambio", CTX)).toEqual({
      etiqueta: "cambio_cita_cliente",
      template: { id: "tpl-cambio" },
      templateName: "cambio_cita_cliente",
      templateLanguage: "es",
      bodyParams: {
        negocio_nombre: "Peluquería Ana",
        servicio: "Corte y Mechas con Laura",
        cita: "jueves 24 de septiembre a las 17:00",
        negocio_telefono: "+34 930 454 394",
      },
      conBotones: true,
    });
    expect(await elegirPlantillaCliente("cancelacion", CTX)).toEqual({
      etiqueta: "cancelacion_cita_cliente",
      template: { id: "tpl-cancel" },
      templateName: "cancelacion_cita_cliente",
      templateLanguage: "es",
      bodyParams: {
        negocio_nombre: "Peluquería Ana",
        cita: "jueves 24 de septiembre a las 17:00",
        negocio_telefono: "+34 930 454 394",
      },
      conBotones: true,
    });
    // Sin teléfono del negocio no salen; sin fila aprobada, SIN_PLANTILLA.
    expect(
      await elegirPlantillaCliente("cambio", {
        ...CTX,
        negocio: { ...NEGOCIO, telnyxPhoneNumber: null, phone: "TEMP-1" },
      })
    ).toEqual({ motivo: "SIN_TELEFONO" });
    sinPlantillas();
    expect(await elegirPlantillaCliente("cancelacion", CTX)).toEqual({
      motivo: "SIN_PLANTILLA",
    });
  });

  it("programarAvisoAlCliente encola una tarea por petición; la cancelación solo sobre una reserva cancelada, el cambio solo sobre una activa", async () => {
    const reserva = {
      id: "booking_1",
      programedAt: CITA,
      smsConsent: true,
      clientPhone: "+34600111222",
      isCancelled: true,
      call: { fromNumber: null, businessId: "biz_1" },
    };
    mockedBookingFindUnique.mockResolvedValue(reserva as never);
    mockedBusinessFindUnique.mockResolvedValue({
      id: "biz_1",
      telnyxPhoneNumber: "+34930454394",
      active: true,
    } as never);

    expect(
      await programarAvisoAlCliente({
        bookingId: "booking_1",
        proposito: "cancelacion",
        etiqueta: "t",
      })
    ).toEqual({ programado: true });
    expect(mockedEnqueue).toHaveBeenCalledWith(
      {
        proposito: "cancelacion",
        bookingId: "booking_1",
        toNumber: "+34600111222",
        businessId: "biz_1",
        audience: "client",
      },
      { taskId: expect.stringMatching(/^booking-booking_1-cancelacion-\d+$/) }
    );
    expect(
      await programarAvisoAlCliente({
        bookingId: "booking_1",
        proposito: "cambio",
        etiqueta: "t",
      })
    ).toEqual({ programado: false, motivo: "reserva cancelada" });

    mockedBookingFindUnique.mockResolvedValue({
      ...reserva,
      isCancelled: false,
    } as never);
    expect(
      await programarAvisoAlCliente({
        bookingId: "booking_1",
        proposito: "cambio",
        etiqueta: "t",
      })
    ).toEqual({ programado: true });
    expect(mockedEnqueue).toHaveBeenLastCalledWith(
      expect.objectContaining({
        proposito: "cambio",
        programedAtMs: CITA.getTime(),
      }),
      expect.anything()
    );
    expect(
      await programarAvisoAlCliente({
        bookingId: "booking_1",
        proposito: "cancelacion",
        etiqueta: "t",
      })
    ).toEqual({ programado: false, motivo: "la reserva sigue activa" });

    mockedBookingFindUnique.mockResolvedValue({
      ...reserva,
      isCancelled: false,
      smsConsent: false,
    } as never);
    expect(
      await programarAvisoAlCliente({
        bookingId: "booking_1",
        proposito: "cambio",
        etiqueta: "t",
      })
    ).toEqual({ programado: false, motivo: "sin consentimiento" });
    mockedBookingFindUnique.mockResolvedValue({
      ...reserva,
      isCancelled: false,
    } as never);
    mockedBaja.mockResolvedValue(true);
    expect(
      await programarAvisoAlCliente({
        bookingId: "booking_1",
        proposito: "cambio",
        etiqueta: "t",
      })
    ).toEqual({ programado: false, motivo: "el número pidió STOP" });
  });
});

describe("programarMensajesAlCliente", () => {
  const EN_DOS_DIAS = new Date(Date.now() + 48 * 60 * 60_000);
  const EPOCH = Math.floor(EN_DOS_DIAS.getTime() / 1000);

  function reserva(overrides: Record<string, unknown> = {}) {
    return {
      id: "booking_1",
      programedAt: EN_DOS_DIAS,
      smsConsent: true,
      clientPhone: null,
      isCancelled: false,
      call: { fromNumber: "+34600111222", businessId: "biz_1" },
      ...overrides,
    };
  }
  function negocio(overrides: Record<string, unknown> = {}) {
    return {
      id: "biz_1",
      plan: "pro",
      stripePriceId: null,
      telnyxPhoneNumber: "+34930454394",
      phone: "+34930000000",
      active: true,
      ...overrides,
    };
  }

  beforeEach(() => {
    mockedBookingFindUnique.mockResolvedValue(reserva() as never);
    mockedBusinessFindUnique.mockResolvedValue(negocio() as never);
  });

  it("no encola nada y devuelve confirmacion: no sin smsConsent, sin número válido, sin telnyxPhoneNumber, con la reserva cancelada o con el número dado de baja (STOP)", async () => {
    const casos: Array<() => void> = [
      () =>
        mockedBookingFindUnique.mockResolvedValue(
          reserva({ smsConsent: false }) as never
        ),
      () =>
        mockedBookingFindUnique.mockResolvedValue(
          reserva({ call: { fromNumber: "600", businessId: "biz_1" } }) as never
        ),
      () =>
        mockedBusinessFindUnique.mockResolvedValue(
          negocio({ telnyxPhoneNumber: null }) as never
        ),
      () =>
        mockedBookingFindUnique.mockResolvedValue(
          reserva({ isCancelled: true }) as never
        ),
      () => mockedBaja.mockResolvedValue(true),
    ];
    for (const preparar of casos) {
      vi.clearAllMocks();
      mockedBookingFindUnique.mockResolvedValue(reserva() as never);
      mockedBusinessFindUnique.mockResolvedValue(negocio() as never);
      mockedBaja.mockResolvedValue(false);
      preparar();
      const r = await programarMensajesAlCliente({
        bookingId: "booking_1",
        etiqueta: "test",
      });
      expect(r.confirmacion).toBe("no");
      expect(r.motivo).toBeTruthy();
      expect(mockedEnqueue).not.toHaveBeenCalled();
    }
  });

  it("encola la confirmación con taskId booking-<id>-confirmacion-<epoch> (devuelve programada) y el recordatorio 24 h antes con booking-<id>-recordatorio-<epoch> solo con plan que permite recordatorios", async () => {
    expect(
      await programarMensajesAlCliente({
        bookingId: "booking_1",
        etiqueta: "test",
      })
    ).toEqual({ confirmacion: "programada" });

    expect(mockedEnqueue).toHaveBeenCalledTimes(2);
    expect(mockedEnqueue).toHaveBeenNthCalledWith(
      1,
      {
        proposito: "confirmacion",
        bookingId: "booking_1",
        programedAtMs: EN_DOS_DIAS.getTime(),
        toNumber: "+34600111222",
        businessId: "biz_1",
        audience: "client",
      },
      { taskId: `booking-booking_1-confirmacion-${EPOCH}` }
    );
    const [recordatorio, opciones] = mockedEnqueue.mock.calls[1];
    expect(recordatorio).toEqual(
      expect.objectContaining({
        proposito: "recordatorio",
        bookingId: "booking_1",
        saltos: 0,
      })
    );
    expect(opciones?.taskId).toBe(`booking-booking_1-recordatorio-${EPOCH}`);
    expect(opciones?.scheduleTime?.getTime()).toBe(
      EN_DOS_DIAS.getTime() - 24 * 60 * 60_000
    );

    // Plan Inicio: sin recordatorio, pero sí confirmación.
    vi.clearAllMocks();
    mockedBookingFindUnique.mockResolvedValue(reserva() as never);
    mockedBusinessFindUnique.mockResolvedValue(
      negocio({ plan: "basic" }) as never
    );
    expect(
      await programarMensajesAlCliente({
        bookingId: "booking_1",
        etiqueta: "test",
      })
    ).toEqual({ confirmacion: "programada" });
    expect(mockedEnqueue).toHaveBeenCalledTimes(1);
    expect(mockedEnqueue.mock.calls[0][0]).toEqual(
      expect.objectContaining({ proposito: "confirmacion" })
    );
  });

  it("no programa el recordatorio a menos de 5 min; a más de 29 días lo programa a now + 29 d con saltos: 0", async () => {
    const enUnDia = new Date(Date.now() + 24 * 60 * 60_000 + 2 * 60_000);
    mockedBookingFindUnique.mockResolvedValue(
      reserva({ programedAt: enUnDia }) as never
    );
    await programarMensajesAlCliente({
      bookingId: "booking_1",
      etiqueta: "test",
    });
    expect(mockedEnqueue).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    const enSesentaDias = new Date(Date.now() + 60 * 24 * 60 * 60_000);
    mockedBookingFindUnique.mockResolvedValue(
      reserva({ programedAt: enSesentaDias }) as never
    );
    mockedBusinessFindUnique.mockResolvedValue(negocio() as never);
    const antes = Date.now();
    await programarMensajesAlCliente({
      bookingId: "booking_1",
      etiqueta: "test",
    });
    const [job, opciones] = mockedEnqueue.mock.calls[1];
    expect(job).toEqual(
      expect.objectContaining({ proposito: "recordatorio", saltos: 0 })
    );
    const programado = opciones!.scheduleTime!.getTime();
    expect(programado).toBeGreaterThanOrEqual(
      antes + 29 * 24 * 60 * 60_000 - 1000
    );
    expect(programado).toBeLessThanOrEqual(
      Date.now() + 29 * 24 * 60 * 60_000 + 1000
    );
  });

  it("trata ALREADY_EXISTS (code 6) como «ya programado» sin error y sigue devolviendo programada; otro error del enqueue loguea y devuelve no", async () => {
    mockedEnqueue.mockRejectedValue(
      Object.assign(new Error("ALREADY_EXISTS"), { code: 6 })
    );
    expect(
      await programarMensajesAlCliente({
        bookingId: "booking_1",
        etiqueta: "test",
      })
    ).toEqual({ confirmacion: "programada" });
    expect(console.error).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("confirmacion ya programado (tarea repetida)")
    );

    mockedEnqueue.mockRejectedValue(new Error("Cloud Tasks caído"));
    const r = await programarMensajesAlCliente({
      bookingId: "booking_1",
      etiqueta: "test",
    });
    expect(r.confirmacion).toBe("no");
    expect(r.motivo).toBe("Cloud Tasks caído");
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("no se pudo encolar la confirmación al cliente")
    );
  });

  it("con confirmacion: false solo encola el recordatorio", async () => {
    expect(
      await programarMensajesAlCliente({
        bookingId: "booking_1",
        etiqueta: "test",
        confirmacion: false,
      })
    ).toEqual({ confirmacion: "programada" });
    expect(mockedEnqueue).toHaveBeenCalledTimes(1);
    expect(mockedEnqueue.mock.calls[0][0]).toEqual(
      expect.objectContaining({ proposito: "recordatorio" })
    );
  });
});

// ---------------------------------------------------------------------------
// Envío (job)
// ---------------------------------------------------------------------------

describe("enviarMensajeAlCliente", () => {
  const EN_DOS_DIAS = new Date(Date.now() + 48 * 60 * 60_000);
  const NEGOCIO_BD = {
    id: "biz_1",
    name: "Peluquería Ana",
    timezone: "Europe/Madrid",
    telnyxPhoneNumber: "+34930454394",
    phone: "+34930000000",
    placeId: null,
    active: true,
  };
  const CLAVE = "booking-booking_1-confirmacion-1";

  function reservaBd(overrides: Record<string, unknown> = {}) {
    return {
      id: "booking_1",
      programedAt: EN_DOS_DIAS,
      isCancelled: false,
      smsConsent: true,
      serviceIds: ["s1"],
      call: { fromNumber: "+34600111222" },
      professional: { name: "Laura" },
      ...overrides,
    };
  }

  function jobConfirmacion(overrides: Record<string, unknown> = {}) {
    return {
      proposito: "confirmacion" as const,
      bookingId: "booking_1",
      programedAtMs: EN_DOS_DIAS.getTime(),
      toNumber: "+34600111222",
      businessId: "biz_1",
      audience: "client" as const,
      idempotencyKey: CLAVE,
      ...overrides,
    };
  }

  beforeEach(() => {
    mockedBusinessFindUnique.mockResolvedValue(NEGOCIO_BD as never);
    mockedBookingFindFirst.mockResolvedValue(reservaBd() as never);
    mockedBookingUpdate.mockResolvedValue({} as never);
    mockedLeadUpdate.mockResolvedValue({} as never);
    plantillas({ confirmacion_cita: FILA_APROBADA });
    mockedEnviar.mockResolvedValue({
      messageId: "msg-1",
      status: "queued",
      from: "+34930454394",
    });
  });

  it("la cancelación se manda sobre la reserva YA cancelada (y no sobre una activa) y anota clientNotifiedAt", async () => {
    plantillas({
      cancelacion_cita_cliente: {
        telnyxTemplateId: "tpl-cancel",
        name: "cancelacion_cita_cliente",
        language: "es",
        components: null,
      },
    });
    mockedBookingFindFirst.mockResolvedValue(
      reservaBd({ isCancelled: true }) as never
    );
    await enviarMensajeAlCliente(
      jobConfirmacion({
        proposito: "cancelacion",
        programedAtMs: undefined,
        idempotencyKey: "booking-booking_1-cancelacion-1",
      })
    );
    expect(mockedEnviar).toHaveBeenCalledWith(
      expect.objectContaining({
        template: { id: "tpl-cancel" },
        callbackData: "cliente:cancelacion:booking_1",
      })
    );
    expect(mockedBookingUpdate).toHaveBeenCalledWith({
      where: { id: "booking_1" },
      data: { clientNotifiedAt: expect.any(Date) },
    });

    vi.clearAllMocks();
    mockedReclamar.mockResolvedValue(true);
    mockedBusinessFindUnique.mockResolvedValue(NEGOCIO_BD as never);
    mockedBookingFindFirst.mockResolvedValue(reservaBd() as never);
    await enviarMensajeAlCliente(
      jobConfirmacion({
        proposito: "cancelacion",
        programedAtMs: undefined,
        idempotencyKey: "booking-booking_1-cancelacion-2",
      })
    );
    expect(mockedEnviar).not.toHaveBeenCalled();
    expect(mockedSentUpdateMany).toHaveBeenCalledWith({
      where: {
        channel: "whatsapp",
        idempotencyKey: "booking-booking_1-cancelacion-2",
      },
      data: expect.objectContaining({
        deliveryStatus: "skipped",
        errorCode: "RESERVA_ACTIVA",
      }),
    });
  });

  it("cancelada ⇒ skipped RESERVA_CANCELADA sin enviar; hora cambiada ⇒ HORA_CAMBIADA; sin consentimiento ⇒ SIN_CONSENTIMIENTO; recordatorio a menos de 60 min ⇒ RECORDATORIO_TARDIO", async () => {
    const casos: Array<
      [Record<string, unknown>, Record<string, unknown>, string]
    > = [
      [{ isCancelled: true }, {}, "RESERVA_CANCELADA"],
      [{}, { programedAtMs: EN_DOS_DIAS.getTime() + 1 }, "HORA_CAMBIADA"],
      [{ smsConsent: false }, {}, "SIN_CONSENTIMIENTO"],
      [
        { programedAt: new Date(Date.now() + 30 * 60_000) },
        { proposito: "recordatorio", programedAtMs: Date.now() + 30 * 60_000 },
        "RECORDATORIO_TARDIO",
      ],
    ];
    for (const [reservaOverrides, jobOverrides, codigo] of casos) {
      vi.clearAllMocks();
      mockedReclamar.mockResolvedValue(true);
      mockedBusinessFindUnique.mockResolvedValue(NEGOCIO_BD as never);
      mockedBookingFindFirst.mockResolvedValue(
        reservaBd(reservaOverrides) as never
      );
      await enviarMensajeAlCliente(jobConfirmacion(jobOverrides));
      expect(mockedEnviar).not.toHaveBeenCalled();
      expect(mockedSentUpdateMany).toHaveBeenCalledWith({
        where: { channel: "whatsapp", idempotencyKey: CLAVE },
        data: expect.objectContaining({
          deliveryStatus: "skipped",
          errorCode: codigo,
        }),
      });
    }
  });

  it("si la reserva ya no es del número de la tarea (clientPhone corregido en la misma llamada) ⇒ skipped DESTINO_CAMBIADO sin enviar; en hueco_libre, un aviso de otro número también", async () => {
    // La reserva pasó a ser de B; la tarea encolada llevaba A.
    mockedBookingFindFirst.mockResolvedValue(
      reservaBd({ clientPhone: "+34600999888" }) as never
    );
    await enviarMensajeAlCliente(jobConfirmacion());
    expect(mockedEnviar).not.toHaveBeenCalled();
    expect(mockedSentUpdateMany).toHaveBeenCalledWith({
      where: { channel: "whatsapp", idempotencyKey: CLAVE },
      data: expect.objectContaining({
        deliveryStatus: "skipped",
        errorCode: "DESTINO_CAMBIADO",
      }),
    });

    // Sin clientPhone el titular es el número de la llamada: sigue valiendo.
    vi.clearAllMocks();
    mockedReclamar.mockResolvedValue(true);
    mockedBusinessFindUnique.mockResolvedValue(NEGOCIO_BD as never);
    mockedBookingFindFirst.mockResolvedValue(
      reservaBd({ clientPhone: null }) as never
    );
    mockedEnviar.mockResolvedValue({
      messageId: "msg-1",
      status: "queued",
      from: "+34930454394",
    });
    await enviarMensajeAlCliente(jobConfirmacion());
    expect(mockedEnviar).toHaveBeenCalledTimes(1);

    // hueco_libre con el lead de otro número.
    vi.clearAllMocks();
    mockedReclamar.mockResolvedValue(true);
    mockedBusinessFindUnique.mockResolvedValue(NEGOCIO_BD as never);
    mockedLeadFindFirst.mockResolvedValue({
      id: "lead_1",
      resolvedAt: null,
      data: {
        clientPhone: "+34600999888",
        startDateTime: EN_DOS_DIAS.toISOString(),
        durationMinutes: 30,
        serviceIds: [],
      },
    } as never);
    await enviarMensajeAlCliente({
      proposito: "hueco_libre",
      leadId: "lead_1",
      toNumber: "+34600111222",
      businessId: "biz_1",
      audience: "client",
      idempotencyKey: "espera-lead_1-1",
    });
    expect(mockedEnviar).not.toHaveBeenCalled();
    expect(mockedSentUpdateMany).toHaveBeenCalledWith({
      where: { channel: "whatsapp", idempotencyKey: "espera-lead_1-1" },
      data: expect.objectContaining({ errorCode: "DESTINO_CAMBIADO" }),
    });
  });

  it("recordatorio entregado a la 01:00 del día de la cita (reloj falso, Europe/Madrid) ⇒ RECORDATORIO_TARDIO", async () => {
    // 01:00 en Madrid del 24-09 = 23:00Z del 23-09; la cita es a las 10:00 Madrid.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T23:00:00Z"));
    const cita = new Date("2026-09-24T08:00:00Z");
    mockedBookingFindFirst.mockResolvedValue(
      reservaBd({ programedAt: cita }) as never
    );

    await enviarMensajeAlCliente(
      jobConfirmacion({
        proposito: "recordatorio",
        programedAtMs: cita.getTime(),
      })
    );

    expect(mockedEnviar).not.toHaveBeenCalled();
    expect(mockedSentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorCode: "RECORDATORIO_TARDIO" }),
      })
    );
  });

  it("recordatorio con más de 24 h + 5 min por delante se reencola con -s<n> sin reclamar fila; con saltos 12 no reencola y loguea", async () => {
    const enCuarentaDias = Date.now() + 40 * 24 * 60 * 60_000;
    const epoch = Math.floor(enCuarentaDias / 1000);
    await enviarMensajeAlCliente(
      jobConfirmacion({
        proposito: "recordatorio",
        programedAtMs: enCuarentaDias,
        idempotencyKey: `booking-booking_1-recordatorio-${epoch}`,
        saltos: 0,
      })
    );
    expect(mockedReclamar).not.toHaveBeenCalled();
    expect(mockedEnviar).not.toHaveBeenCalled();
    // El payload conserva la clave documentada (sin `-s<n>`): la fila final
    // de sent_messages se busca por ella, el taskId solo nombra la tarea.
    expect(mockedEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        proposito: "recordatorio",
        saltos: 1,
        idempotencyKey: `booking-booking_1-recordatorio-${epoch}`,
      }),
      expect.objectContaining({
        taskId: `booking-booking_1-recordatorio-${epoch}-s1`,
        scheduleTime: expect.any(Date),
      })
    );

    vi.clearAllMocks();
    await enviarMensajeAlCliente(
      jobConfirmacion({
        proposito: "recordatorio",
        programedAtMs: enCuarentaDias,
        saltos: 12,
      })
    );
    expect(mockedEnqueue).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("más de un año")
    );
  });

  it("confirmación enviada marca clientNotifiedAt y pasa templateName/templateLanguage a enviarPlantilla", async () => {
    await enviarMensajeAlCliente(jobConfirmacion());

    expect(mockedReclamar).toHaveBeenCalledWith(
      "whatsapp",
      CLAVE,
      {
        businessId: "biz_1",
        audience: "client",
        toNumber: "+34600111222",
        callbackData: "cliente:confirmacion:booking_1",
        kind: "template",
      },
      { reintentarFallidos: true }
    );
    expect(mockedEnviar).toHaveBeenCalledWith({
      audience: "client",
      to: "+34600111222",
      businessId: "biz_1",
      template: { id: "tpl-conf" },
      templateName: "confirmacion_cita",
      templateLanguage: "es_ES",
      bodyParams: expect.objectContaining({ negocio_nombre: "Peluquería Ana" }),
      buttonUrlParams: undefined,
      idempotencyKey: CLAVE,
      callbackData: "cliente:confirmacion:booking_1",
    });
    expect(mockedBookingUpdate).toHaveBeenCalledWith({
      where: { id: "booking_1" },
      data: { clientNotifiedAt: expect.any(Date) },
    });
  });

  it("sin plantilla ⇒ fila skipped y PermanentJobError; en hueco_libre además revierte notifiedAt y deja ninguna:SIN_PLANTILLA (idem SIN_TELEFONO)", async () => {
    sinPlantillas();
    await expect(
      enviarMensajeAlCliente(jobConfirmacion())
    ).rejects.toBeInstanceOf(PermanentJobError);
    expect(mockedSentUpdateMany).toHaveBeenCalledWith({
      where: { channel: "whatsapp", idempotencyKey: CLAVE },
      data: expect.objectContaining({
        deliveryStatus: "skipped",
        errorCode: "SIN_PLANTILLA",
      }),
    });

    vi.clearAllMocks();
    mockedReclamar.mockResolvedValue(true);
    mockedBusinessFindUnique.mockResolvedValue({
      ...NEGOCIO_BD,
      telnyxPhoneNumber: null,
      phone: "TEMP-1",
    } as never);
    mockedLeadFindFirst.mockResolvedValue({
      id: "lead_1",
      resolvedAt: null,
      data: {
        clientPhone: "+34600111222",
        startDateTime: EN_DOS_DIAS.toISOString(),
        durationMinutes: 30,
        serviceIds: [],
      },
    } as never);
    plantillas({
      hora_disponible: {
        telnyxTemplateId: "tpl-hora",
        name: "hora_disponible",
        language: "es",
        components: null,
      },
    });
    await expect(
      enviarMensajeAlCliente({
        proposito: "hueco_libre",
        leadId: "lead_1",
        toNumber: "+34600111222",
        businessId: "biz_1",
        audience: "client",
        idempotencyKey: "espera-lead_1-1",
      })
    ).rejects.toMatchObject({ reason: "sin_telefono" });
    expect(mockedLeadUpdateMany).toHaveBeenCalledWith({
      where: { id: "lead_1", resolvedAt: null, notifiedVia: "encolado" },
      data: { notifiedAt: null, notifiedVia: "ninguna:SIN_TELEFONO" },
    });
  });

  it("error de Telnyx marca la fila failed/SEND_ERROR (where providerMessageId null), revierte el lead en hueco_libre y relanza; baja no relanza y cierra el lead baja", async () => {
    const leadData = {
      clientPhone: "+34600111222",
      startDateTime: EN_DOS_DIAS.toISOString(),
      durationMinutes: 30,
      serviceIds: [],
    };
    mockedLeadFindFirst.mockResolvedValue({
      id: "lead_1",
      resolvedAt: null,
      data: leadData,
    } as never);
    plantillas({
      hueco_libre: {
        telnyxTemplateId: "tpl-hueco",
        name: "hueco_libre",
        language: "es",
        components: null,
      },
    });
    const job = {
      proposito: "hueco_libre" as const,
      leadId: "lead_1",
      toNumber: "+34600111222",
      businessId: "biz_1",
      audience: "client" as const,
      idempotencyKey: "espera-lead_1-1",
    };

    mockedEnviar.mockRejectedValue(new Error("Telnyx 502"));
    await expect(enviarMensajeAlCliente(job)).rejects.toThrow("Telnyx 502");
    expect(mockedSentUpdateMany).toHaveBeenCalledWith({
      where: {
        channel: "whatsapp",
        idempotencyKey: "espera-lead_1-1",
        providerMessageId: null,
      },
      data: {
        deliveryStatus: "failed",
        errorCode: "SEND_ERROR",
        errorDetail: "Telnyx 502",
      },
    });
    expect(mockedLeadUpdateMany).toHaveBeenCalledWith({
      where: { id: "lead_1", resolvedAt: null, notifiedVia: "encolado" },
      data: { notifiedAt: null, notifiedVia: "ninguna:SEND_ERROR" },
    });

    vi.clearAllMocks();
    mockedReclamar.mockResolvedValue(true);
    mockedEnviar.mockRejectedValue(
      new WhatsappOptOutError("client", "+34600111222")
    );
    await expect(enviarMensajeAlCliente(job)).resolves.toBeUndefined();
    expect(mockedLeadUpdate).toHaveBeenCalledWith({
      where: { id: "lead_1" },
      data: {
        resolvedAt: expect.any(Date),
        data: { ...leadData, resolvedBy: "baja" },
      },
    });
    expect(mockedSentUpdateMany).not.toHaveBeenCalled();
  });

  it("si falla booking.update tras enviar, la fila sigue queued, no se relanza y se loguea", async () => {
    mockedBookingUpdate.mockRejectedValue(new Error("BD caída"));

    await expect(
      enviarMensajeAlCliente(jobConfirmacion())
    ).resolves.toBeUndefined();

    expect(mockedEnviar).toHaveBeenCalledTimes(1);
    expect(mockedSentUpdateMany).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("enviado, pero no se pudieron anotar sus efectos")
    );
  });

  it("hueco_libre: con hueco_libre escribe notifiedAt y notifiedVia plantilla:hueco_libre sin cerrar el lead; con hora_disponible cierra el lead; lead ya cerrado ⇒ AVISO_CERRADO; hora pasada ⇒ HORA_PASADA y cierra pasado", async () => {
    const leadData = {
      clientPhone: "+34600111222",
      startDateTime: EN_DOS_DIAS.toISOString(),
      durationMinutes: 30,
      serviceIds: ["s1"],
      professionalId: "p1",
    };
    mockedLeadFindFirst.mockResolvedValue({
      id: "lead_1",
      resolvedAt: null,
      data: leadData,
    } as never);
    mockedProfessionalFindFirst.mockResolvedValue({ name: "Laura" } as never);
    const job = {
      proposito: "hueco_libre" as const,
      leadId: "lead_1",
      toNumber: "+34600111222",
      businessId: "biz_1",
      audience: "client" as const,
      idempotencyKey: "espera-lead_1-1",
    };

    plantillas({
      hueco_libre: {
        telnyxTemplateId: "tpl-hueco",
        name: "hueco_libre",
        language: "es",
        components: null,
      },
    });
    await enviarMensajeAlCliente(job);
    expect(mockedEnviar).toHaveBeenCalledWith(
      expect.objectContaining({
        template: { id: "tpl-hueco" },
        callbackData: "cliente:hueco:lead_1",
        bodyParams: {
          negocio_nombre: "Peluquería Ana",
          cita: expect.stringContaining(" a las "),
        },
      })
    );
    expect(mockedProfessionalFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1", businessId: "biz_1" } })
    );
    expect(mockedLeadUpdate).toHaveBeenCalledWith({
      where: { id: "lead_1" },
      data: {
        notifiedAt: expect.any(Date),
        notifiedVia: "plantilla:hueco_libre",
      },
    });

    vi.clearAllMocks();
    mockedReclamar.mockResolvedValue(true);
    mockedBusinessFindUnique.mockResolvedValue(NEGOCIO_BD as never);
    mockedLeadFindFirst.mockResolvedValue({
      id: "lead_1",
      resolvedAt: null,
      data: leadData,
    } as never);
    plantillas({
      hora_disponible: {
        telnyxTemplateId: "tpl-hora",
        name: "hora_disponible",
        language: "es",
        components: null,
      },
    });
    await enviarMensajeAlCliente(job);
    expect(mockedLeadUpdate).toHaveBeenCalledWith({
      where: { id: "lead_1" },
      data: {
        notifiedAt: expect.any(Date),
        notifiedVia: "plantilla:hora_disponible",
        resolvedAt: expect.any(Date),
      },
    });

    vi.clearAllMocks();
    mockedReclamar.mockResolvedValue(true);
    mockedBusinessFindUnique.mockResolvedValue(NEGOCIO_BD as never);
    mockedLeadFindFirst.mockResolvedValue({
      id: "lead_1",
      resolvedAt: new Date(),
      data: leadData,
    } as never);
    await enviarMensajeAlCliente(job);
    expect(mockedEnviar).not.toHaveBeenCalled();
    expect(mockedSentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorCode: "AVISO_CERRADO" }),
      })
    );

    vi.clearAllMocks();
    mockedReclamar.mockResolvedValue(true);
    mockedBusinessFindUnique.mockResolvedValue(NEGOCIO_BD as never);
    const pasada = {
      ...leadData,
      startDateTime: new Date(Date.now() - 60_000).toISOString(),
    };
    mockedLeadFindFirst.mockResolvedValue({
      id: "lead_1",
      resolvedAt: null,
      data: pasada,
    } as never);
    await enviarMensajeAlCliente(job);
    expect(mockedEnviar).not.toHaveBeenCalled();
    expect(mockedSentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorCode: "HORA_PASADA" }),
      })
    );
    expect(mockedLeadUpdate).toHaveBeenCalledWith({
      where: { id: "lead_1" },
      data: {
        resolvedAt: expect.any(Date),
        data: { ...pasada, resolvedBy: "pasado" },
      },
    });
  });
});

describe("TARJETA_ALHABLA_RESERVAS", () => {
  it("usa el número del remitente de clientes y solo datos de Alhabla", async () => {
    mockedRemitente.mockResolvedValue({
      phoneNumber: "+34930454394",
      source: "db",
    });
    const { numeroDeClientes } =
      await import("../../../src/modules/whatsapp/mensajesCliente.js");
    const tarjeta = TARJETA_ALHABLA_RESERVAS(await numeroDeClientes());
    expect(tarjeta).toEqual({
      formattedName: "Alhabla Reservas",
      firstName: "Alhabla Reservas",
      company: "Alhabla",
      phones: [{ number: "+34930454394", type: "WORK" }],
      urls: [{ url: "https://alhabla.ai", type: "WORK" }],
    });
    expect(JSON.stringify(tarjeta)).not.toContain("Peluquería");
    expect(mockedRemitente).toHaveBeenCalledWith("client");
  });
});
