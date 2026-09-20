import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { PlanLimitError } from "../../../src/lib/planFeatures.js";
import { DEFAULT_BUSINESS_SCHEDULE } from "../../../src/lib/businessSchedule.js";
import {
  createProfessional,
  createService,
  deleteProfessional,
  deleteService,
  syncBookingConfiguration,
  updateProfessional,
  updateService,
} from "../../../src/modules/bookings/service.js";
import { guardarHorarioDelNegocio } from "../../../src/modules/businesses/horario.js";
import {
  ACCIONES_DEL_GESTOR,
  decidirPropuesta,
  registrarPropuesta,
} from "../../../src/modules/gestor/acciones.js";
import { describirSemana } from "../../../src/modules/gestor/accionesCatalogo.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    service: { findMany: vi.fn() },
    professional: { findMany: vi.fn(), count: vi.fn() },
    business: { findUnique: vi.fn() },
    lead: { findFirst: vi.fn(), updateMany: vi.fn() },
    ownerPendingAction: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("../../../src/modules/bookings/service.js", () => ({
  createService: vi.fn(),
  updateService: vi.fn(),
  deleteService: vi.fn(),
  createProfessional: vi.fn(),
  updateProfessional: vi.fn(),
  deleteProfessional: vi.fn(),
  syncBookingConfiguration: vi.fn(),
}));
vi.mock("../../../src/modules/businesses/horario.js", () => ({
  guardarHorarioDelNegocio: vi.fn(),
}));
vi.mock("../../../src/lib/bookingLock.js", () => ({
  acquireLock: vi.fn(async () => "token"),
  releaseLock: vi.fn(async () => undefined),
}));

const mockedServiceFindMany = vi.mocked(prisma.service.findMany);
const mockedProFindMany = vi.mocked(prisma.professional.findMany);
const mockedProCount = vi.mocked(prisma.professional.count);
const mockedBizFindUnique = vi.mocked(prisma.business.findUnique);
const mockedCreate = vi.mocked(prisma.ownerPendingAction.create);
const mockedCreateService = vi.mocked(createService);
const mockedUpdateService = vi.mocked(updateService);
const mockedDeleteService = vi.mocked(deleteService);
const mockedCreatePro = vi.mocked(createProfessional);
const mockedUpdatePro = vi.mocked(updateProfessional);
const mockedDeletePro = vi.mocked(deleteProfessional);
const mockedSync = vi.mocked(syncBookingConfiguration);
const mockedGuardarHorario = vi.mocked(guardarHorarioDelNegocio);

const CTX = { businessId: "biz_1", timezone: "Europe/Madrid" };
const META = { inboundMessageId: "in_boton", accionId: "acc_1" };
const SERVICIOS = [
  { id: "svc_corte", name: "Corte", durationMinutes: 30, priceCents: 1500 },
  { id: "svc_color", name: "Color", durationMinutes: 90, priceCents: 6050 },
];
const PROFESIONALES = [
  {
    id: "pro_laura",
    name: "Laura",
    serviceLinks: [{ serviceId: "svc_color", level: "ESPECIALISTA" }],
  },
  { id: "pro_marta", name: "Marta", serviceLinks: [] },
];

function accion(tipo: string) {
  const a = ACCIONES_DEL_GESTOR[tipo];
  if (!a) throw new Error(`acción desconocida ${tipo}`);
  return a;
}

async function comprobar(tipo: string, params: unknown) {
  const a = accion(tipo);
  const parsed = a.schema.safeParse(params);
  if (!parsed.success)
    return {
      ok: false as const,
      motivo: `schema: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    };
  return a.comprobar(CTX, parsed.data);
}

async function ejecutar(tipo: string, params: unknown) {
  const a = accion(tipo);
  return a.ejecutar(CTX, a.schema.parse(params), META);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mockedServiceFindMany.mockResolvedValue(SERVICIOS as never);
  mockedProFindMany.mockResolvedValue(PROFESIONALES as never);
  mockedProCount.mockResolvedValue(2);
  mockedBizFindUnique.mockResolvedValue({
    plan: null,
    stripePriceId: null,
    schedule: DEFAULT_BUSINESS_SCHEDULE,
  } as never);
  mockedSync.mockResolvedValue(undefined);
  mockedGuardarHorario.mockResolvedValue({ sincronizado: true });
  vi.mocked(prisma.ownerPendingAction.updateMany).mockResolvedValue({
    count: 0,
  });
});

describe("registro", () => {
  it("expone las acciones de catálogo, horario y agenda", () => {
    expect(Object.keys(ACCIONES_DEL_GESTOR).sort()).toEqual([
      "anadir_cita",
      "avisar_cliente",
      "añadir_cita",
      "bloquear_franja",
      "cancelar_cita",
      "cerrar_dia",
      "crear_profesionales",
      "crear_servicios",
      "editar_servicio",
      "fijar_especialidad",
      "fijar_horario",
      "marcar_ausencia",
      "mover_cita",
      "resolver_pendiente",
      "retirar_profesional",
      "retirar_servicio",
    ]);
  });

  it("los parámetros son estrictos: una clave de más se rechaza con su ruta", async () => {
    const r = await comprobar("crear_servicios", {
      servicios: [{ nombre: "Barba", duracionMinutos: 20, precio: 10 }],
    });
    expect(r).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("servicios.0"),
    });
  });
});

describe("crear_servicios", () => {
  it("describe el lote con duración y precio, y rechaza nombres ya existentes o repetidos en la lista", async () => {
    expect(
      await comprobar("crear_servicios", {
        servicios: [
          { nombre: "Barba", duracionMinutos: 20, precioEuros: 10 },
          { nombre: "Mechas", duracionMinutos: 120, precioEuros: 60.5 },
          { nombre: "Lavado", duracionMinutos: 15 },
        ],
      })
    ).toMatchObject({
      ok: true,
      descripcion:
        "los servicios Barba (20 min, 10 €), Mechas (120 min, 60,50 €) y Lavado (15 min)",
    });

    expect(
      await comprobar("crear_servicios", {
        servicios: [{ nombre: "corte", duracionMinutos: 30 }],
      })
    ).toEqual({
      ok: false,
      motivo:
        "Ya existe un servicio llamado corte. Si quiere cambiarlo, es una edición, no un alta.",
    });

    expect(
      await comprobar("crear_servicios", {
        servicios: [
          { nombre: "Barba", duracionMinutos: 20 },
          { nombre: "barba ", duracionMinutos: 25 },
        ],
      })
    ).toEqual({
      ok: false,
      motivo: "Hay dos servicios con el mismo nombre en la lista.",
    });
  });

  it("al confirmar crea cada servicio sin sincronizar y sincroniza una vez al final; la nota lleva los ids", async () => {
    mockedCreateService
      .mockResolvedValueOnce({ id: "svc_barba", name: "Barba" } as never)
      .mockResolvedValueOnce({ id: "svc_mechas", name: "Mechas" } as never);

    const r = await ejecutar("crear_servicios", {
      servicios: [
        { nombre: "Barba", duracionMinutos: 20, precioEuros: 10 },
        { nombre: "Mechas", duracionMinutos: 120, precioEuros: 60.5 },
      ],
    });

    expect(r).toEqual({
      ok: true,
      mensaje:
        "Hecho: he creado Barba y Mechas. La recepcionista ya los ofrece.",
      nota: "Servicios creados: Barba (id svc_barba), Mechas (id svc_mechas).",
    });
    expect(mockedCreateService).toHaveBeenNthCalledWith(
      1,
      "biz_1",
      { name: "Barba", durationMinutes: 20, priceCents: 1000 },
      { sync: false }
    );
    expect(mockedCreateService).toHaveBeenNthCalledWith(
      2,
      "biz_1",
      { name: "Mechas", durationMinutes: 120, priceCents: 6050 },
      { sync: false }
    );
    expect(mockedSync).toHaveBeenCalledTimes(1);
  });

  it("revalida los duplicados al confirmar (hasta 24 h después) y no crea nada si aparece uno", async () => {
    mockedServiceFindMany.mockResolvedValue([
      ...SERVICIOS,
      { id: "svc_barba", name: "Barba", durationMinutes: 20, priceCents: null },
    ] as never);
    const r = await ejecutar("crear_servicios", {
      servicios: [{ nombre: "Barba", duracionMinutos: 20 }],
    });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain("Ya existe un servicio llamado Barba");
    expect(mockedCreateService).not.toHaveBeenCalled();
  });

  it("un fallo a mitad del lote deja los creados, sincroniza y lo dice", async () => {
    mockedCreateService
      .mockResolvedValueOnce({ id: "svc_barba", name: "Barba" } as never)
      .mockRejectedValueOnce(new Error("bd caída"));
    const r = await ejecutar("crear_servicios", {
      servicios: [
        { nombre: "Barba", duracionMinutos: 20 },
        { nombre: "Mechas", duracionMinutos: 120 },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toBe(
      "He creado Barba, pero el resto no se pudo guardar. Revísalo en el panel."
    );
    expect(mockedSync).toHaveBeenCalledTimes(1);
  });

  it("si la sincronización falla, el resultado sigue siendo «hecho» (best-effort con log)", async () => {
    mockedCreateService.mockResolvedValueOnce({
      id: "svc_barba",
      name: "Barba",
    } as never);
    mockedSync.mockRejectedValueOnce(new Error("Retell caído"));
    const r = await ejecutar("crear_servicios", {
      servicios: [{ nombre: "Barba", duracionMinutos: 20 }],
    });
    expect(r.ok).toBe(true);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("no se pudo sincronizar")
    );
  });
});

describe("resolución por nombre: ids normalizados, ambigüedad y renombrar", () => {
  it("al proponer, los nombres se convierten en ids para que el botón actúe sobre el recurso descrito", async () => {
    expect(
      await comprobar("editar_servicio", { servicio: "CORTE", precioEuros: 18 })
    ).toMatchObject({
      parametros: { servicio: "svc_corte", precioEuros: 18 },
    });
    expect(
      await comprobar("retirar_profesional", { profesional: "marta" })
    ).toMatchObject({
      parametros: { profesional: "pro_marta" },
    });
    expect(
      await comprobar("fijar_especialidad", {
        profesional: "Laura",
        servicio: "Corte",
        nivel: "normal",
      })
    ).toMatchObject({
      parametros: {
        profesional: "pro_laura",
        servicio: "svc_corte",
        nivel: "normal",
      },
    });
    mockedProCount.mockResolvedValue(0);
    expect(
      await comprobar("crear_profesionales", {
        profesionales: [{ nombre: "Pedro", especialidades: ["corte"] }],
      })
    ).toMatchObject({
      parametros: {
        profesionales: [{ nombre: "Pedro", especialidades: ["svc_corte"] }],
      },
    });
  });

  it("renombrar a un nombre que ya existe se rechaza y dos activos con el mismo nombre se declaran ambiguos", async () => {
    expect(
      await comprobar("editar_servicio", { servicio: "Corte", nombre: "color" })
    ).toEqual({
      ok: false,
      motivo: "Ya hay otro servicio llamado «color».",
    });
    mockedServiceFindMany.mockResolvedValue([
      ...SERVICIOS,
      {
        id: "svc_corte2",
        name: "corte",
        durationMinutes: 20,
        priceCents: null,
      },
    ] as never);
    expect(
      (await comprobar("retirar_servicio", { servicio: "Corte" })).motivo
    ).toContain("Hay más de un servicio llamado");
    expect(
      (await comprobar("retirar_servicio", { servicio: "svc_corte2" })).ok
    ).toBe(true);
  });

  it("un error inesperado no llega crudo al dueño", async () => {
    mockedDeleteService.mockRejectedValueOnce(
      new Error("PrismaClientKnownRequestError P2002")
    );
    const r = await ejecutar("retirar_servicio", { servicio: "svc_corte" });
    expect(r.ok).toBe(false);
    expect(r.mensaje).not.toContain("Prisma");
    expect(r.mensaje).toContain("por nuestra parte");
  });
});

describe("editar_servicio / retirar_servicio", () => {
  it("resuelve el servicio por id o por nombre sin acentos ni mayúsculas", async () => {
    expect(
      await comprobar("editar_servicio", {
        servicio: "svc_corte",
        precioEuros: 18,
      })
    ).toMatchObject({ ok: true, descripcion: "el servicio Corte: 18 €" });
    expect(
      await comprobar("editar_servicio", {
        servicio: "CORTE",
        duracionMinutos: 45,
        nombre: "Corte y peinado",
      })
    ).toMatchObject({
      ok: true,
      descripcion: "el servicio Corte: nombre «Corte y peinado» y 45 min",
    });
    expect(
      await comprobar("editar_servicio", { servicio: "Cejas", precioEuros: 5 })
    ).toEqual({
      ok: false,
      motivo: "No encuentro el servicio «Cejas» en este negocio.",
    });
    expect((await comprobar("editar_servicio", { servicio: "Corte" })).ok).toBe(
      false
    );
  });

  it("editar convierte euros a céntimos, null quita el precio, y sincroniza aparte", async () => {
    mockedUpdateService.mockResolvedValueOnce({
      id: "svc_corte",
      name: "Corte",
      durationMinutes: 30,
      priceCents: null,
    } as never);
    const r = await ejecutar("editar_servicio", {
      servicio: "corte",
      precioEuros: null,
    });
    expect(mockedUpdateService).toHaveBeenCalledWith(
      "biz_1",
      "svc_corte",
      { priceCents: null },
      { sync: false }
    );
    expect(r).toEqual({
      ok: true,
      mensaje: "Hecho: Corte, 30 min, sin precio.",
      nota: "Servicio Corte (id svc_corte) actualizado: 30 min, sin precio.",
    });
    expect(mockedSync).toHaveBeenCalledTimes(1);
  });

  it("retirar borra (lógico) y avisa de que las citas se mantienen", async () => {
    mockedDeleteService.mockResolvedValueOnce({ id: "svc_color" } as never);
    expect(
      await comprobar("retirar_servicio", { servicio: "color" })
    ).toMatchObject({
      ok: true,
      descripcion:
        "retirar el servicio Color (la recepcionista dejará de ofrecerlo)",
    });
    const r = await ejecutar("retirar_servicio", { servicio: "color" });
    expect(mockedDeleteService).toHaveBeenCalledWith("biz_1", "svc_color", {
      sync: false,
    });
    expect(r.ok).toBe(true);
    expect(r.mensaje).toBe(
      "Hecho: he retirado Color. Las citas ya reservadas se mantienen."
    );
  });
});

describe("crear_profesionales", () => {
  it("resuelve especialidades por nombre, describe el lote y rechaza nombres repetidos", async () => {
    mockedProCount.mockResolvedValue(0);
    expect(
      await comprobar("crear_profesionales", {
        profesionales: [
          { nombre: "Pedro", especialidades: ["corte", "svc_color"] },
          { nombre: "Ana" },
        ],
      })
    ).toMatchObject({
      ok: true,
      descripcion:
        "añadir al equipo a Pedro (especialista en Corte y Color) y Ana",
    });

    expect(
      await comprobar("crear_profesionales", {
        profesionales: [{ nombre: "laura" }],
      })
    ).toEqual({
      ok: false,
      motivo: "laura ya está en el equipo.",
    });
    expect(
      await comprobar("crear_profesionales", {
        profesionales: [{ nombre: "Pedro", especialidades: ["Cejas"] }],
      })
    ).toEqual({
      ok: false,
      motivo:
        "No encuentro el servicio «Cejas». Crea primero los servicios o usa los nombres exactos.",
    });
  });

  it("respeta el límite del plan al proponer: inicio admite 3 activos", async () => {
    mockedProCount.mockResolvedValue(2);
    expect(
      await comprobar("crear_profesionales", {
        profesionales: [{ nombre: "Pedro" }, { nombre: "Ana" }],
      })
    ).toEqual({
      ok: false,
      motivo:
        "El plan actual solo admite 1 profesional más. Reduce la lista o amplía el plan desde el panel.",
    });
    mockedProCount.mockResolvedValue(3);
    expect(
      (
        await comprobar("crear_profesionales", {
          profesionales: [{ nombre: "Pedro" }],
        })
      ).ok
    ).toBe(false);
    // Plan sin tope (legado `enterprise` = scale): no hay límite.
    mockedBizFindUnique.mockResolvedValue({
      plan: "enterprise",
      stripePriceId: null,
    } as never);
    mockedProCount.mockResolvedValue(50);
    expect(
      (
        await comprobar("crear_profesionales", {
          profesionales: [{ nombre: "Pedro" }],
        })
      ).ok
    ).toBe(true);
  });

  it("al confirmar crea con los ids de servicio resueltos, sin sincronizar, y sincroniza una vez", async () => {
    mockedCreatePro.mockResolvedValueOnce({
      id: "pro_pedro",
      name: "Pedro",
    } as never);
    const r = await ejecutar("crear_profesionales", {
      profesionales: [{ nombre: "Pedro", especialidades: ["corte"] }],
    });
    expect(mockedCreatePro).toHaveBeenCalledWith(
      "biz_1",
      { name: "Pedro", serviceIds: ["svc_corte"] },
      { sync: false }
    );
    expect(r).toEqual({
      ok: true,
      mensaje: "Hecho: Pedro ya está en el equipo.",
      nota: "Profesionales creados: Pedro (id pro_pedro).",
    });
    expect(mockedSync).toHaveBeenCalledTimes(1);
  });

  it("el límite del plan al confirmar (PlanLimitError) se cuenta con su propio mensaje", async () => {
    mockedCreatePro.mockRejectedValueOnce(
      new PlanLimitError({
        code: "PLAN_LIMIT_PROFESSIONALS",
        planId: "inicio",
        limit: 3,
        message: "Tu plan incluye hasta 3 profesionales activos.",
      })
    );
    const r = await ejecutar("crear_profesionales", {
      profesionales: [{ nombre: "Pedro" }],
    });
    expect(r).toEqual({
      ok: false,
      mensaje:
        "No he podido añadir a nadie: Tu plan incluye hasta 3 profesionales activos..",
    });
    expect(mockedSync).not.toHaveBeenCalled();
  });
});

describe("retirar_profesional / fijar_especialidad", () => {
  it("retirar resuelve por nombre y conserva las citas", async () => {
    mockedDeletePro.mockResolvedValueOnce({ id: "pro_marta" } as never);
    expect(
      await comprobar("retirar_profesional", { profesional: "MARTA" })
    ).toMatchObject({
      ok: true,
      descripcion:
        "retirar a Marta del equipo (la recepcionista dejará de asignarle citas)",
    });
    const r = await ejecutar("retirar_profesional", { profesional: "Marta" });
    expect(mockedDeletePro).toHaveBeenCalledWith("biz_1", "pro_marta", {
      sync: false,
    });
    expect(r.mensaje).toBe(
      "Hecho: Marta ya no está en el equipo. Sus citas ya reservadas se mantienen."
    );
  });

  it("fijar_especialidad conserva los demás niveles y «normal» borra la fila", async () => {
    mockedUpdatePro.mockResolvedValue({} as never);
    expect(
      await comprobar("fijar_especialidad", {
        profesional: "Laura",
        servicio: "Corte",
        nivel: "no_sugerir",
      })
    ).toMatchObject({
      ok: true,
      descripcion: "Laura en Corte: solo si el cliente lo pide por su nombre",
    });

    await ejecutar("fijar_especialidad", {
      profesional: "Laura",
      servicio: "Corte",
      nivel: "no_sugerir",
    });
    expect(mockedUpdatePro).toHaveBeenLastCalledWith(
      "biz_1",
      "pro_laura",
      { serviceLevels: { svc_color: "especialista", svc_corte: "no_sugerir" } },
      { sync: false }
    );

    await ejecutar("fijar_especialidad", {
      profesional: "Laura",
      servicio: "Color",
      nivel: "normal",
    });
    expect(mockedUpdatePro).toHaveBeenLastCalledWith(
      "biz_1",
      "pro_laura",
      { serviceLevels: {} },
      { sync: false }
    );
    expect(mockedSync).toHaveBeenCalledTimes(2);
  });
});

describe("fijar_horario", () => {
  const SEMANA = {
    lunes: { abierto: true, tramos: [{ inicio: "09:30", fin: "20:00" }] },
    martes: { abierto: true, tramos: [{ inicio: "09:30", fin: "20:00" }] },
    miercoles: { abierto: true, tramos: [{ inicio: "09:30", fin: "20:00" }] },
    jueves: { abierto: true, tramos: [{ inicio: "09:30", fin: "20:00" }] },
    viernes: { abierto: true, tramos: [{ inicio: "09:30", fin: "20:00" }] },
    sabado: { abierto: true, tramos: [{ inicio: "09:30", fin: "14:00" }] },
    domingo: { abierto: false, tramos: [] },
  };

  it("describe la semana agrupando días iguales", () => {
    expect(describirSemana(SEMANA)).toBe(
      "lunes a viernes 09:30-20:00; sábado 09:30-14:00; domingo cerrado"
    );
    expect(
      describirSemana({
        ...SEMANA,
        martes: {
          abierto: true,
          tramos: [
            { inicio: "09:00", fin: "14:00" },
            { inicio: "16:00", fin: "20:00" },
          ],
        },
      })
    ).toBe(
      "lunes 09:30-20:00; martes 09:00-14:00 y 16:00-20:00; miércoles a viernes 09:30-20:00; sábado 09:30-14:00; domingo cerrado"
    );
  });

  it("exige los siete días y valida con el esquema real (tramos solapados, día abierto sin tramos)", async () => {
    const { domingo: _d, ...seis } = SEMANA;
    void _d;
    expect(
      (await comprobar("fijar_horario", { semana: seis })).motivo
    ).toContain("semana.domingo");
    expect(
      await comprobar("fijar_horario", {
        semana: { ...SEMANA, lunes: { abierto: true, tramos: [] } },
      })
    ).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("al menos un tramo"),
    });
    expect(
      await comprobar("fijar_horario", {
        semana: {
          ...SEMANA,
          lunes: {
            abierto: true,
            tramos: [
              { inicio: "09:00", fin: "14:00" },
              { inicio: "13:00", fin: "18:00" },
            ],
          },
        },
      })
    ).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("solaparse"),
    });
    expect(await comprobar("fijar_horario", { semana: SEMANA })).toMatchObject({
      ok: true,
      descripcion:
        "el horario: lunes a viernes 09:30-20:00; sábado 09:30-14:00; domingo cerrado",
    });
  });

  it("al confirmar guarda la semana entera conservando las excepciones que ya había", async () => {
    mockedBizFindUnique.mockResolvedValue({
      schedule: {
        ...DEFAULT_BUSINESS_SCHEDULE,
        exceptions: [
          { date: "2026-12-25", closed: true, intervals: [], label: "Navidad" },
        ],
      },
    } as never);
    const r = await ejecutar("fijar_horario", { semana: SEMANA });
    expect(r.ok).toBe(true);
    const guardado = mockedGuardarHorario.mock.calls[0]![1];
    expect(guardado.week.monday).toEqual({
      enabled: true,
      intervals: [{ start: "09:30", end: "20:00" }],
    });
    expect(guardado.week.sunday).toEqual({ enabled: false, intervals: [] });
    expect(guardado.exceptions).toEqual([
      { date: "2026-12-25", closed: true, intervals: [], label: "Navidad" },
    ]);
  });

  it("un negocio sin horario válido (schedule {}) también puede fijarlo", async () => {
    mockedBizFindUnique.mockResolvedValue({ schedule: {} } as never);
    const r = await ejecutar("fijar_horario", { semana: SEMANA });
    expect(r.ok).toBe(true);
    expect(mockedGuardarHorario.mock.calls[0]![1].exceptions).toEqual([]);
  });
});

describe("cerrar_dia", () => {
  it("rechaza fechas pasadas, inexistentes y un negocio sin horario semanal", async () => {
    expect(await comprobar("cerrar_dia", { fecha: "2020-01-01" })).toEqual({
      ok: false,
      motivo: "Esa fecha ya ha pasado.",
    });
    expect(
      (await comprobar("cerrar_dia", { fecha: "2027-02-31" })).motivo
    ).toContain("no existe");
    mockedBizFindUnique.mockResolvedValue({ schedule: {} } as never);
    expect(await comprobar("cerrar_dia", { fecha: "2027-12-25" })).toEqual({
      ok: false,
      motivo:
        "Primero hay que fijar el horario semanal; después podré cerrar días sueltos.",
    });
  });

  it("describe el día y, al confirmar, añade la excepción sin duplicar la fecha ni perder las demás", async () => {
    mockedBizFindUnique.mockResolvedValue({
      schedule: {
        ...DEFAULT_BUSINESS_SCHEDULE,
        exceptions: [
          {
            date: "2027-12-24",
            closed: false,
            intervals: [{ start: "09:00", end: "14:00" }],
            label: "Nochebuena",
          },
          {
            date: "2027-12-25",
            closed: false,
            intervals: [{ start: "10:00", end: "13:00" }],
          },
        ],
      },
    } as never);
    expect(
      await comprobar("cerrar_dia", { fecha: "2027-12-25", motivo: "Navidad" })
    ).toMatchObject({
      ok: true,
      descripcion:
        "cerrar el sábado, 25 de diciembre (Navidad): la recepcionista no reservará ese día",
    });

    const r = await ejecutar("cerrar_dia", {
      fecha: "2027-12-25",
      motivo: "Navidad",
    });
    expect(r.ok).toBe(true);
    expect(r.mensaje).toContain("queda cerrado");
    const guardado = mockedGuardarHorario.mock.calls[0]![1];
    expect(guardado.exceptions).toEqual([
      {
        date: "2027-12-24",
        closed: false,
        intervals: [{ start: "09:00", end: "14:00" }],
        label: "Nochebuena",
      },
      { date: "2027-12-25", closed: true, intervals: [], label: "Navidad" },
    ]);
  });

  it("con hastaFecha cierra el rango entero (vacaciones) y rechaza más de 31 días", async () => {
    expect(
      (
        await comprobar("cerrar_dia", {
          fecha: "2027-08-01",
          hastaFecha: "2027-09-15",
        })
      ).motivo
    ).toContain("31 días");
    expect(
      (
        await comprobar("cerrar_dia", {
          fecha: "2027-08-10",
          hastaFecha: "2027-08-01",
        })
      ).motivo
    ).toContain("hastaFecha");
    expect(
      await comprobar("cerrar_dia", {
        fecha: "2027-08-01",
        hastaFecha: "2027-08-15",
        motivo: "Vacaciones",
      })
    ).toMatchObject({
      ok: true,
      descripcion:
        "cerrar del domingo, 1 de agosto al domingo, 15 de agosto (Vacaciones): la recepcionista no reservará esos días",
    });
    const r = await ejecutar("cerrar_dia", {
      fecha: "2027-08-01",
      hastaFecha: "2027-08-15",
      motivo: "Vacaciones",
    });
    expect(r.ok).toBe(true);
    const guardado = mockedGuardarHorario.mock.calls[0]![1];
    expect(guardado.exceptions).toHaveLength(15);
    expect(guardado.exceptions[0]).toEqual({
      date: "2027-08-01",
      closed: true,
      intervals: [],
      label: "Vacaciones",
    });
    expect(guardado.exceptions[14]!.date).toBe("2027-08-15");
  });

  it("un día que ya está cerrado no se propone dos veces", async () => {
    mockedBizFindUnique.mockResolvedValue({
      schedule: {
        ...DEFAULT_BUSINESS_SCHEDULE,
        exceptions: [{ date: "2027-12-25", closed: true, intervals: [] }],
      },
    } as never);
    expect(
      (await comprobar("cerrar_dia", { fecha: "2027-12-25" })).motivo
    ).toContain("ya está marcado como cerrado");
  });
});

describe("de extremo a extremo por el registro (proponer → confirmar)", () => {
  it("registrarPropuesta guarda los parámetros tal cual y decidirPropuesta los ejecuta", async () => {
    mockedCreate.mockResolvedValueOnce({ id: "acc_9" } as never);
    const propuesta = await registrarPropuesta({
      businessId: "biz_1",
      timezone: "Europe/Madrid",
      conversationId: "conv_1",
      inboundMessageId: "in_1",
      tipo: "crear_servicios",
      parametros: {
        servicios: [{ nombre: "Barba", duracionMinutos: 20, precioEuros: 10 }],
      },
      resumen: "Doy de alta Barba (20 min, 10 €).",
    });
    expect(propuesta).toMatchObject({
      ok: true,
      accionId: "acc_9",
      descripcion: "el servicio Barba (20 min, 10 €)",
    });
    const guardados = (
      mockedCreate.mock.calls[0]![0].data as { parametros: unknown }
    ).parametros;
    expect(guardados).toEqual({
      servicios: [{ nombre: "Barba", duracionMinutos: 20, precioEuros: 10 }],
    });

    vi.mocked(prisma.ownerPendingAction.findFirst).mockResolvedValueOnce({
      id: "acc_9",
      businessId: "biz_1",
      tipo: "crear_servicios",
      parametros: guardados,
      expiresAt: new Date(Date.now() + 60_000),
      confirmedAt: null,
      rejectedAt: null,
    } as never);
    vi.mocked(prisma.ownerPendingAction.updateMany).mockResolvedValueOnce({
      count: 1,
    });
    vi.mocked(prisma.ownerPendingAction.update).mockResolvedValueOnce(
      {} as never
    );
    mockedCreateService.mockResolvedValueOnce({
      id: "svc_barba",
      name: "Barba",
    } as never);

    const r = await decidirPropuesta({
      accionId: "acc_9",
      businessId: "biz_1",
      timezone: "Europe/Madrid",
      decision: "confirmar",
      inboundMessageId: "in_2",
    });
    expect(r).toEqual({
      estado: "ejecutada",
      mensaje: "Hecho: he creado Barba. La recepcionista ya lo ofrece.",
      nota: "Servicios creados: Barba (id svc_barba).",
    });
  });
});
