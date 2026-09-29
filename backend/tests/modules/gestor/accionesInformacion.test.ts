import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { guardarInformacionDelNegocio } from "../../../src/modules/businesses/informacion.js";
import {
  ACCIONES_DE_INFORMACION,
  MAX_LARGO_DE_INFORMACION,
  aplicarCambioDeInformacion,
} from "../../../src/modules/gestor/accionesInformacion.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    agent: { findMany: vi.fn() },
  },
}));
vi.mock("../../../src/modules/businesses/informacion.js", () => ({
  guardarInformacionDelNegocio: vi.fn(),
}));

const mockedBizFindUnique = vi.mocked(prisma.business.findUnique);
const mockedAgentFindMany = vi.mocked(prisma.agent.findMany);
const mockedGuardar = vi.mocked(guardarInformacionDelNegocio);

const CTX = { businessId: "biz_1", timezone: "Europe/Madrid" };
const META = { inboundMessageId: "in_boton", accionId: "acc_1" };
const INFORMACION =
  "Estamos en la calle Mayor 1.\nSe puede pagar con tarjeta.\n\nNo hacemos keratina.";
const accion = ACCIONES_DE_INFORMACION.actualizar_informacion;

async function comprobar(params: unknown) {
  const parsed = accion.schema.safeParse(params);
  if (!parsed.success) {
    return {
      ok: false as const,
      motivo: `schema: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    };
  }
  return accion.comprobar(CTX, parsed.data);
}

async function ejecutar(params: unknown) {
  return accion.ejecutar(CTX, accion.schema.parse(params), META);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  mockedBizFindUnique.mockResolvedValue({
    businessDetails: INFORMACION,
  } as never);
  mockedAgentFindMany.mockResolvedValue([
    { promptManuallyEdited: false },
  ] as never);
  mockedGuardar.mockResolvedValue({ guardado: true, sincronizado: true });
});

describe("aplicarCambioDeInformacion", () => {
  it("solo nuevo lo añade al final en su propia línea, o como único texto si no había nada", () => {
    expect(
      aplicarCambioDeInformacion(INFORMACION, { nuevo: "Aceptamos Bizum." })
    ).toEqual({ ok: true, texto: `${INFORMACION}\nAceptamos Bizum.` });
    expect(
      aplicarCambioDeInformacion("", { nuevo: "Aceptamos Bizum." })
    ).toEqual({ ok: true, texto: "Aceptamos Bizum." });
  });

  it("solo anterior quita el fragmento sin dejar líneas en blanco de más ni espacios dobles", () => {
    expect(
      aplicarCambioDeInformacion(INFORMACION, {
        anterior: "Se puede pagar con tarjeta.",
      })
    ).toEqual({
      ok: true,
      texto: "Estamos en la calle Mayor 1.\n\nNo hacemos keratina.",
    });
    expect(
      aplicarCambioDeInformacion(
        "Abrimos pronto. Cerrado por obras. Llama antes.",
        { anterior: "Cerrado por obras." }
      )
    ).toEqual({ ok: true, texto: "Abrimos pronto. Llama antes." });
  });

  it("los dos sustituyen el fragmento en su sitio", () => {
    expect(
      aplicarCambioDeInformacion(INFORMACION, {
        anterior: "No hacemos keratina.",
        nuevo: "Hacemos keratina los sábados.",
      })
    ).toEqual({
      ok: true,
      texto:
        "Estamos en la calle Mayor 1.\nSe puede pagar con tarjeta.\n\nHacemos keratina los sábados.",
    });
  });

  it("encuentra el fragmento sin distinguir mayúsculas ni espaciado (un salto de línea copiado como espacio)", () => {
    expect(
      aplicarCambioDeInformacion(INFORMACION, {
        anterior: "estamos en la calle mayor 1. se puede pagar con tarjeta.",
      })
    ).toEqual({ ok: true, texto: "No hacemos keratina." });
  });

  it("rechaza lo que no encuentra, lo repetido, lo que ya está y lo que no cambia nada", () => {
    expect(
      aplicarCambioDeInformacion(INFORMACION, {
        anterior: "Aparcamiento gratis.",
      })
    ).toEqual({ ok: false, fallo: "no_encontrado" });
    expect(
      aplicarCambioDeInformacion("Cita previa. Cita previa.", {
        anterior: "Cita previa.",
      })
    ).toEqual({ ok: false, fallo: "repetido" });
    expect(
      aplicarCambioDeInformacion(INFORMACION, {
        nuevo: "se puede pagar con tarjeta.",
      })
    ).toEqual({ ok: false, fallo: "ya_esta" });
    expect(
      aplicarCambioDeInformacion(INFORMACION, {
        anterior: "No hacemos keratina.",
        nuevo: "No hacemos keratina.",
      })
    ).toEqual({ ok: false, fallo: "sin_cambios" });
  });

  it("no deja que crezca por encima del máximo, pero sí recortarla aunque siga siendo larga", () => {
    expect(
      aplicarCambioDeInformacion("a".repeat(MAX_LARGO_DE_INFORMACION), {
        nuevo: "Aceptamos Bizum.",
      })
    ).toEqual({ ok: false, fallo: "demasiado_largo" });
    expect(
      aplicarCambioDeInformacion(
        `${"b".repeat(MAX_LARGO_DE_INFORMACION + 100)} Sobra esto.`,
        { anterior: "Sobra esto." }
      )
    ).toMatchObject({ ok: true });
  });
});

describe("actualizar_informacion — parámetros", () => {
  it("hace falta anterior, nuevo o los dos; vacíos o null cuentan como ausentes y no admite claves de más", async () => {
    expect(await comprobar({})).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("hace falta anterior, nuevo o los dos"),
    });
    expect(await comprobar({ anterior: "  ", nuevo: null })).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("hace falta anterior, nuevo o los dos"),
    });
    expect(
      await comprobar({ nuevo: "Aceptamos Bizum.", texto: "otra cosa" })
    ).toMatchObject({ ok: false, motivo: expect.stringContaining("schema") });
    expect(await comprobar({ nuevo: "x".repeat(501) })).toMatchObject({
      ok: false,
    });
  });
});

describe("actualizar_informacion — comprobar", () => {
  it("describe el cambio para la propuesta", async () => {
    expect(await comprobar({ nuevo: "Aceptamos Bizum." })).toEqual({
      ok: true,
      descripcion: "añadir a lo que sabe la recepcionista «Aceptamos Bizum.»",
    });
    expect(
      await comprobar({
        anterior: "No hacemos keratina.",
        nuevo: "Hacemos keratina.",
      })
    ).toEqual({
      ok: true,
      descripcion:
        "cambiar «No hacemos keratina.» por «Hacemos keratina.» en lo que sabe la recepcionista",
    });
    expect(await comprobar({ anterior: "No hacemos keratina." })).toEqual({
      ok: true,
      descripcion: "quitar de lo que sabe la recepcionista «No hacemos keratina.»",
    });
  });

  it("si el fragmento no está, devuelve un motivo con el que el LLM puede corregirse", async () => {
    expect(await comprobar({ anterior: "Aparcamiento gratis." })).toMatchObject(
      { ok: false, motivo: expect.stringContaining("cópialo tal cual") }
    );
  });

  it("no propone nada si todas las recepcionistas tienen las instrucciones escritas a mano", async () => {
    mockedAgentFindMany.mockResolvedValue([
      { promptManuallyEdited: true },
    ] as never);
    expect(await comprobar({ nuevo: "Aceptamos Bizum." })).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("escritas a mano"),
    });

    // Sin recepcionista todavía, sí: la usará en cuanto se cree.
    mockedAgentFindMany.mockResolvedValue([] as never);
    expect(await comprobar({ nuevo: "Aceptamos Bizum." })).toMatchObject({
      ok: true,
    });
  });
});

describe("actualizar_informacion — ejecutar", () => {
  it("aplica el cambio sobre el texto de ahora y lo guarda con escritura optimista", async () => {
    expect(await ejecutar({ nuevo: "Aceptamos Bizum." })).toEqual({
      ok: true,
      mensaje:
        "Hecho: la recepcionista ya lo tiene en cuenta en las próximas llamadas.",
      nota: "Información del negocio actualizada: añadir a lo que sabe la recepcionista «Aceptamos Bizum.».",
    });
    expect(mockedGuardar).toHaveBeenCalledWith("biz_1", {
      esperado: INFORMACION,
      nuevo: `${INFORMACION}\nAceptamos Bizum.`,
    });
  });

  it("si queda vacía guarda null, y si la recepcionista no se pudo sincronizar lo dice", async () => {
    mockedBizFindUnique.mockResolvedValue({
      businessDetails: "Aceptamos Bizum.",
    } as never);
    mockedGuardar.mockResolvedValue({ guardado: true, sincronizado: false });

    expect(await ejecutar({ anterior: "Aceptamos Bizum." })).toMatchObject({
      ok: true,
      mensaje: expect.stringContaining("como tarde mañana"),
    });
    expect(mockedGuardar).toHaveBeenCalledWith("biz_1", {
      esperado: "Aceptamos Bizum.",
      nuevo: null,
    });
  });

  it("no toca nada si el texto cambió desde la propuesta o mientras se guardaba", async () => {
    mockedBizFindUnique.mockResolvedValue({
      businessDetails: "Otro texto.",
    } as never);
    expect(await ejecutar({ anterior: "No hacemos keratina." })).toMatchObject({
      ok: false,
      mensaje: expect.stringContaining("ha cambiado desde que te lo propuse"),
    });
    expect(mockedGuardar).not.toHaveBeenCalled();

    mockedBizFindUnique.mockResolvedValue({
      businessDetails: INFORMACION,
    } as never);
    mockedGuardar.mockResolvedValue({ guardado: false, sincronizado: false });
    expect(await ejecutar({ nuevo: "Aceptamos Bizum." })).toMatchObject({
      ok: false,
      mensaje: expect.stringContaining("mientras la guardaba"),
    });
  });

  it("si ya lo tenía así lo dice sin guardar", async () => {
    expect(await ejecutar({ nuevo: "Se puede pagar con tarjeta." })).toEqual({
      ok: false,
      mensaje: "La recepcionista ya lo tenía así: no he cambiado nada.",
    });
    expect(mockedGuardar).not.toHaveBeenCalled();
  });
});
