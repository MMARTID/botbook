import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import {
  PlanLimitError,
  getPlanLimits,
  resolvePlanId,
} from "../../lib/planFeatures.js";
import {
  BusinessScheduleSchema,
  WEEK_DAYS,
  type BusinessSchedule,
  type WeekDay,
} from "../../lib/businessSchedule.js";
import {
  createProfessional,
  createService,
  deleteProfessional,
  deleteService,
  syncBookingConfiguration,
  updateProfessional,
  updateService,
} from "../bookings/service.js";
import {
  PROFESSIONAL_SERVICE_LEVELS,
  type ProfessionalServiceLevelInput,
} from "../bookings/schemas.js";
import { guardarHorarioDelNegocio } from "../businesses/horario.js";
import type {
  AccionDelGestor,
  ContextoDeAccion,
  ResultadoDeEjecucion,
} from "./acciones.js";

/**
 * Acciones de catálogo y horario del Gestor (PLAN-CANAL-DUENO.md § 8,
 * «Onboarding por chat» y «gestiona todo lo posterior»), fase 2 / PR 3.
 * Todas pasan por el mismo registro que `resolver_pendiente`: el LLM las
 * PROPONE con `proponer_accion` y solo el botón «Confirmar» del dueño las
 * ejecuta. Reutilizan los servicios de las rutas del panel (límites de plan
 * incluidos) y disparan la misma sincronización de la recepcionista
 * (`syncBookingConfiguration`, `guardarHorarioDelNegocio`), una sola vez por
 * lote.
 *
 * Los lotes (`crear_servicios`, `crear_profesionales`) existen para que el
 * onboarding sea una confirmación por paso — «corte 30 min 15 €, color hora
 * y media 60 €, barba 20 min» ⇒ una tabla ⇒ un botón — y no un botón por
 * fila. Servicios y profesionales se nombran por id (de `contexto_negocio`)
 * o por nombre exacto sin distinguir mayúsculas ni acentos: el LLM tiende a
 * escribir «Corte» aunque tenga el id delante.
 */

const MAX_SERVICIOS_POR_LOTE = 20;
const MAX_PROFESIONALES_POR_LOTE = 10;

const Nombre = z.string().trim().min(1).max(80);
const Duracion = z.number().int().min(5).max(480);
/** Precio en euros con céntimos; `null` quita la tarifa. */
const PrecioEuros = z.number().min(0).max(100_000).nullable();
const Id = z.string().trim().min(1).max(80);
const Hora = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora en formato HH:MM");
const Fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe usar el formato AAAA-MM-DD")
  .refine((f) => {
    // El regex deja pasar 2026-02-31: la fecha tiene que existir de verdad.
    const [y, m, d] = f.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return (
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === m - 1 &&
      date.getUTCDate() === d
    );
  }, "Esa fecha no existe");

const DIAS: Record<string, WeekDay> = {
  lunes: "monday",
  martes: "tuesday",
  miercoles: "wednesday",
  jueves: "thursday",
  viernes: "friday",
  sabado: "saturday",
  domingo: "sunday",
};
const DIA_EN_ESPANOL: Record<WeekDay, string> = {
  monday: "lunes",
  tuesday: "martes",
  wednesday: "miércoles",
  thursday: "jueves",
  friday: "viernes",
  saturday: "sábado",
  sunday: "domingo",
};

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function euros(priceCents: number | null): string {
  if (priceCents === null) return "sin precio";
  const e = priceCents / 100;
  return `${Number.isInteger(e) ? e : e.toFixed(2).replace(".", ",")} €`;
}

function aCentimos(
  precioEuros: number | null | undefined
): number | null | undefined {
  if (precioEuros === undefined) return undefined;
  if (precioEuros === null) return null;
  return Math.round(precioEuros * 100);
}

function listar(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Al dueño solo le llega el texto del plan; cualquier otro error (Prisma,
 * red, Retell) se registra y se sustituye por un texto humano. */
function mensajeDeError(
  error: unknown,
  accion: string,
  businessId: string
): string {
  if (error instanceof PlanLimitError) return error.message;
  console.error(
    `[Gestor] ${accion} del negocio ${businessId} falló: ${errorMessage(error)}`
  );
  return "ha fallado algo por nuestra parte; inténtalo en un rato o hazlo desde el panel";
}

/**
 * Sincroniza la recepcionista tras un cambio de catálogo, como best-effort
 * con log ruidoso: `syncAgentToRetell` LANZA si la publicación falla y el
 * cambio ya está confirmado en la BD, así que un fallo aquí no puede
 * convertir un «hecho» en un «no he podido»; el reconciliador diario repara
 * el drift. Por eso todas las llamadas al servicio van con `{ sync: false }`.
 */
async function sincronizarCatalogo(
  businessId: string,
  accion: string
): Promise<void> {
  try {
    await syncBookingConfiguration(businessId);
  } catch (error) {
    console.error(
      `[Gestor] ${accion} del negocio ${businessId}: el cambio está guardado pero la recepcionista no se pudo sincronizar (lo repara el reconciliador): ${errorMessage(error)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Resolución de servicios y profesionales por id o por nombre
// ---------------------------------------------------------------------------

interface ServicioActivo {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number | null;
}

async function serviciosActivos(businessId: string): Promise<ServicioActivo[]> {
  return prisma.service.findMany({
    where: { businessId, active: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, durationMinutes: true, priceCents: true },
  });
}

async function profesionalesActivos(businessId: string) {
  return prisma.professional.findMany({
    where: { businessId, active: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      serviceLinks: {
        where: { service: { deletedAt: null } },
        select: { serviceId: true, level: true },
      },
    },
  });
}

/** Id o nombre exacto (sin mayúsculas ni acentos) entre los activos. */
function resolverPorIdONombre<T extends { id: string; name: string }>(
  candidatos: T[],
  referencia: string
): T | null {
  return buscar(candidatos, referencia).encontrado;
}

/** Como `resolverPorIdONombre`, pero distingue «no existe» de «hay varios
 * con ese nombre» (el panel no impone nombres únicos). */
function buscar<T extends { id: string; name: string }>(
  candidatos: T[],
  referencia: string
): { encontrado: T | null; ambiguo: boolean } {
  const ref = referencia.trim();
  const porId = candidatos.find((c) => c.id === ref);
  if (porId) return { encontrado: porId, ambiguo: false };
  const objetivo = normalizar(ref);
  const porNombre = candidatos.filter((c) => normalizar(c.name) === objetivo);
  if (porNombre.length === 1)
    return { encontrado: porNombre[0], ambiguo: false };
  return { encontrado: null, ambiguo: porNombre.length > 1 };
}

function motivoNoEncontrado(
  tipo: "servicio" | "profesional",
  referencia: string,
  ambiguo: boolean
): string {
  if (ambiguo) {
    return tipo === "servicio"
      ? `Hay más de un servicio llamado «${referencia}»: usa su id de contexto_negocio para saber cuál.`
      : `Hay más de una persona llamada «${referencia}» en el equipo: usa su id de contexto_negocio para saber cuál.`;
  }
  return tipo === "servicio"
    ? `No encuentro el servicio «${referencia}» en este negocio.`
    : `No encuentro a «${referencia}» en el equipo.`;
}

// ---------------------------------------------------------------------------
// crear_servicios
// ---------------------------------------------------------------------------

const CrearServiciosParams = z
  .object({
    servicios: z
      .array(
        z
          .object({
            nombre: Nombre,
            duracionMinutos: Duracion,
            precioEuros: PrecioEuros.optional(),
          })
          .strict()
      )
      .min(1)
      .max(MAX_SERVICIOS_POR_LOTE),
  })
  .strict();

function describirServicioNuevo(s: {
  nombre: string;
  duracionMinutos: number;
  precioEuros?: number | null;
}): string {
  const precio =
    s.precioEuros === undefined || s.precioEuros === null
      ? ""
      : `, ${euros(aCentimos(s.precioEuros) ?? null)}`;
  return `${s.nombre} (${s.duracionMinutos} min${precio})`;
}

async function duplicadosDeServicio(
  businessId: string,
  nombres: string[]
): Promise<string[]> {
  const existentes = new Set(
    (await serviciosActivos(businessId)).map((s) => normalizar(s.name))
  );
  return nombres.filter((n) => existentes.has(normalizar(n)));
}

async function duplicadosDeProfesional(
  businessId: string,
  nombres: string[]
): Promise<string[]> {
  const existentes = new Set(
    (await profesionalesActivos(businessId)).map((p) => normalizar(p.name))
  );
  return nombres.filter((n) => existentes.has(normalizar(n)));
}

const crearServicios: AccionDelGestor<z.infer<typeof CrearServiciosParams>> = {
  schema: CrearServiciosParams,
  async comprobar(ctx, params) {
    const repetidos = await duplicadosDeServicio(
      ctx.businessId,
      params.servicios.map((s) => s.nombre)
    );
    if (repetidos.length > 0) {
      return {
        ok: false,
        motivo:
          repetidos.length === 1
            ? `Ya existe un servicio llamado ${repetidos[0]}. Si quiere cambiarlo, es una edición, no un alta.`
            : `Ya existen servicios llamados ${listar(repetidos)}. Si quiere cambiarlos, es una edición, no un alta.`,
      };
    }
    const enElLote = params.servicios.map((s) => normalizar(s.nombre));
    if (new Set(enElLote).size !== enElLote.length) {
      return {
        ok: false,
        motivo: "Hay dos servicios con el mismo nombre en la lista.",
      };
    }
    return {
      ok: true,
      descripcion: `${params.servicios.length === 1 ? "el servicio" : "los servicios"} ${listar(params.servicios.map(describirServicioNuevo))}`,
    };
  },
  async ejecutar(ctx, params) {
    // Hasta 24 h entre proponer y confirmar: alguien pudo crear uno igual
    // desde el panel. Se vuelve a comprobar, y un duplicado aborta el lote.
    const repetidos = await duplicadosDeServicio(
      ctx.businessId,
      params.servicios.map((s) => s.nombre)
    );
    if (repetidos.length > 0) {
      return {
        ok: false,
        mensaje:
          repetidos.length === 1
            ? `Ya existe un servicio llamado ${repetidos[0]}; no he creado nada. Pídemelo otra vez sin ese.`
            : `Ya existen servicios llamados ${listar(repetidos)}; no he creado nada. Pídemelo otra vez sin esos.`,
      };
    }
    const creados: Array<{ id: string; name: string }> = [];
    try {
      for (const s of params.servicios) {
        const creado = await createService(
          ctx.businessId,
          {
            name: s.nombre,
            durationMinutes: s.duracionMinutos,
            priceCents: aCentimos(s.precioEuros) ?? null,
          },
          { sync: false }
        );
        creados.push({ id: creado.id, name: creado.name });
      }
    } catch (error) {
      console.error(
        `[Gestor] crear_servicios del negocio ${ctx.businessId}: creados ${creados.length}/${params.servicios.length} antes de fallar: ${errorMessage(error)}`
      );
    } finally {
      if (creados.length > 0)
        await sincronizarCatalogo(ctx.businessId, "crear_servicios");
    }
    if (creados.length === 0) {
      return {
        ok: false,
        mensaje:
          "No he podido crear los servicios ahora mismo. Inténtalo desde el panel.",
      };
    }
    const parcial = creados.length < params.servicios.length;
    return {
      ok: !parcial,
      mensaje: parcial
        ? `He creado ${listar(creados.map((c) => c.name))}, pero el resto no se pudo guardar. Revísalo en el panel.`
        : `Hecho: he creado ${listar(creados.map((c) => c.name))}. La recepcionista ya ${creados.length === 1 ? "lo" : "los"} ofrece.`,
      nota: `Servicios creados: ${creados.map((c) => `${c.name} (id ${c.id})`).join(", ")}${parcial ? " (lote incompleto)" : ""}.`,
    };
  },
};

// ---------------------------------------------------------------------------
// editar_servicio / retirar_servicio
// ---------------------------------------------------------------------------

const EditarServicioParams = z
  .object({
    servicio: Id,
    nombre: Nombre.optional(),
    duracionMinutos: Duracion.optional(),
    precioEuros: PrecioEuros.optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.nombre !== undefined ||
      v.duracionMinutos !== undefined ||
      v.precioEuros !== undefined,
    "Indica qué cambiar: nombre, duración o precio."
  );

function describirCambios(v: z.infer<typeof EditarServicioParams>): string {
  const cambios: string[] = [];
  if (v.nombre !== undefined) cambios.push(`nombre «${v.nombre}»`);
  if (v.duracionMinutos !== undefined) cambios.push(`${v.duracionMinutos} min`);
  if (v.precioEuros !== undefined)
    cambios.push(
      v.precioEuros === null
        ? "sin precio"
        : euros(aCentimos(v.precioEuros) ?? null)
    );
  return listar(cambios);
}

const editarServicio: AccionDelGestor<z.infer<typeof EditarServicioParams>> = {
  schema: EditarServicioParams,
  async comprobar(ctx, params) {
    const activos = await serviciosActivos(ctx.businessId);
    const { encontrado: servicio, ambiguo } = buscar(activos, params.servicio);
    if (!servicio) {
      return {
        ok: false,
        motivo: motivoNoEncontrado("servicio", params.servicio, ambiguo),
      };
    }
    const nuevoNombre = params.nombre;
    if (
      nuevoNombre !== undefined &&
      activos.some(
        (s) =>
          s.id !== servicio.id && normalizar(s.name) === normalizar(nuevoNombre)
      )
    ) {
      return {
        ok: false,
        motivo: `Ya hay otro servicio llamado «${nuevoNombre}».`,
      };
    }
    return {
      ok: true,
      descripcion: `el servicio ${servicio.name}: ${describirCambios(params)}`,
      parametros: { ...params, servicio: servicio.id },
    };
  },
  async ejecutar(ctx, params) {
    const servicio = resolverPorIdONombre(
      await serviciosActivos(ctx.businessId),
      params.servicio
    );
    if (!servicio) {
      return { ok: false, mensaje: `Ese servicio ya no existe.` };
    }
    try {
      const actualizado = await updateService(
        ctx.businessId,
        servicio.id,
        {
          ...(params.nombre !== undefined ? { name: params.nombre } : {}),
          ...(params.duracionMinutos !== undefined
            ? { durationMinutes: params.duracionMinutos }
            : {}),
          ...(params.precioEuros !== undefined
            ? { priceCents: aCentimos(params.precioEuros) }
            : {}),
        },
        { sync: false }
      );
      if (!actualizado)
        return { ok: false, mensaje: "Ese servicio ya no existe." };
      await sincronizarCatalogo(ctx.businessId, "editar_servicio");
      return {
        ok: true,
        mensaje: `Hecho: ${actualizado.name}, ${actualizado.durationMinutes} min, ${euros(actualizado.priceCents)}.`,
        nota: `Servicio ${actualizado.name} (id ${actualizado.id}) actualizado: ${actualizado.durationMinutes} min, ${euros(actualizado.priceCents)}.`,
      };
    } catch (error) {
      return {
        ok: false,
        mensaje: `No he podido cambiar el servicio: ${mensajeDeError(error, "editar_servicio", ctx.businessId)}`,
      };
    }
  },
};

const RetirarServicioParams = z.object({ servicio: Id }).strict();

const retirarServicio: AccionDelGestor<z.infer<typeof RetirarServicioParams>> =
  {
    schema: RetirarServicioParams,
    async comprobar(ctx, params) {
      const { encontrado: servicio, ambiguo } = buscar(
        await serviciosActivos(ctx.businessId),
        params.servicio
      );
      if (!servicio) {
        return {
          ok: false,
          motivo: motivoNoEncontrado("servicio", params.servicio, ambiguo),
        };
      }
      return {
        ok: true,
        descripcion: `retirar el servicio ${servicio.name} (la recepcionista dejará de ofrecerlo)`,
        parametros: { servicio: servicio.id },
      };
    },
    async ejecutar(ctx, params) {
      const servicio = resolverPorIdONombre(
        await serviciosActivos(ctx.businessId),
        params.servicio
      );
      if (!servicio)
        return { ok: false, mensaje: "Ese servicio ya no existe." };
      try {
        const borrado = await deleteService(ctx.businessId, servicio.id, {
          sync: false,
        });
        if (!borrado)
          return { ok: false, mensaje: "Ese servicio ya no existe." };
        await sincronizarCatalogo(ctx.businessId, "retirar_servicio");
        return {
          ok: true,
          mensaje: `Hecho: he retirado ${servicio.name}. Las citas ya reservadas se mantienen.`,
          nota: `Servicio ${servicio.name} (id ${servicio.id}) retirado.`,
        };
      } catch (error) {
        return {
          ok: false,
          mensaje: `No he podido retirar el servicio: ${mensajeDeError(error, "retirar_servicio", ctx.businessId)}`,
        };
      }
    },
  };

// ---------------------------------------------------------------------------
// crear_profesionales / retirar_profesional / fijar_especialidad
// ---------------------------------------------------------------------------

const CrearProfesionalesParams = z
  .object({
    profesionales: z
      .array(
        z
          .object({
            nombre: Nombre,
            /** Servicios en los que es especialista, por id o nombre. */
            especialidades: z.array(Id).max(30).optional(),
          })
          .strict()
      )
      .min(1)
      .max(MAX_PROFESIONALES_POR_LOTE),
  })
  .strict();

async function resolverEspecialidades(
  businessId: string,
  referencias: string[] | undefined
): Promise<
  { ok: true; servicios: ServicioActivo[] } | { ok: false; motivo: string }
> {
  if (!referencias || referencias.length === 0)
    return { ok: true, servicios: [] };
  const activos = await serviciosActivos(businessId);
  const servicios: ServicioActivo[] = [];
  const noEncontrados: string[] = [];
  for (const ref of referencias) {
    const s = resolverPorIdONombre(activos, ref);
    if (s) {
      if (!servicios.some((x) => x.id === s.id)) servicios.push(s);
    } else {
      noEncontrados.push(ref);
    }
  }
  if (noEncontrados.length > 0) {
    return {
      ok: false,
      motivo: `No encuentro ${noEncontrados.length === 1 ? "el servicio" : "los servicios"} ${listar(noEncontrados.map((n) => `«${n}»`))}. Crea primero los servicios o usa los nombres exactos.`,
    };
  }
  return { ok: true, servicios };
}

async function plazasLibres(businessId: string): Promise<number | null> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { plan: true, stripePriceId: true },
  });
  if (!business) return 0;
  const { maxProfessionals } = getPlanLimits(resolvePlanId(business));
  if (maxProfessionals === null) return null;
  const activos = await prisma.professional.count({
    where: { businessId, active: true, deletedAt: null },
  });
  return Math.max(0, maxProfessionals - activos);
}

const crearProfesionales: AccionDelGestor<
  z.infer<typeof CrearProfesionalesParams>
> = {
  schema: CrearProfesionalesParams,
  async comprobar(ctx, params) {
    const repetidos = await duplicadosDeProfesional(
      ctx.businessId,
      params.profesionales.map((p) => p.nombre)
    );
    if (repetidos.length > 0) {
      return {
        ok: false,
        motivo: `${listar(repetidos)} ya ${repetidos.length === 1 ? "está" : "están"} en el equipo.`,
      };
    }
    const enElLote = params.profesionales.map((p) => normalizar(p.nombre));
    if (new Set(enElLote).size !== enElLote.length) {
      return {
        ok: false,
        motivo: "Hay dos profesionales con el mismo nombre en la lista.",
      };
    }
    const libres = await plazasLibres(ctx.businessId);
    if (libres !== null && params.profesionales.length > libres) {
      return {
        ok: false,
        motivo:
          libres === 0
            ? "El plan actual no admite más profesionales activos. Se puede ampliar desde el panel, en Ajustes › Plan y facturación."
            : `El plan actual solo admite ${libres} profesional${libres === 1 ? "" : "es"} más. Reduce la lista o amplía el plan desde el panel.`,
      };
    }
    const descripciones: string[] = [];
    const normalizados: typeof params.profesionales = [];
    for (const p of params.profesionales) {
      const esp = await resolverEspecialidades(
        ctx.businessId,
        p.especialidades
      );
      if (!esp.ok) return esp;
      descripciones.push(
        esp.servicios.length > 0
          ? `${p.nombre} (especialista en ${listar(esp.servicios.map((s) => s.name))})`
          : p.nombre
      );
      normalizados.push({
        nombre: p.nombre,
        ...(esp.servicios.length > 0
          ? { especialidades: esp.servicios.map((s) => s.id) }
          : {}),
      });
    }
    return {
      ok: true,
      descripcion: `añadir al equipo a ${listar(descripciones)}`,
      parametros: { profesionales: normalizados },
    };
  },
  async ejecutar(ctx, params) {
    const repetidos = await duplicadosDeProfesional(
      ctx.businessId,
      params.profesionales.map((p) => p.nombre)
    );
    if (repetidos.length > 0) {
      return {
        ok: false,
        mensaje: `${listar(repetidos)} ya ${repetidos.length === 1 ? "está" : "están"} en el equipo; no he añadido a nadie. Pídemelo otra vez sin ${repetidos.length === 1 ? "esa persona" : "esas personas"}.`,
      };
    }
    const libres = await plazasLibres(ctx.businessId);
    if (libres !== null && params.profesionales.length > libres) {
      return {
        ok: false,
        mensaje:
          libres === 0
            ? "El plan actual ya no admite más profesionales activos; no he añadido a nadie."
            : `El plan actual solo admite ${libres} profesional${libres === 1 ? "" : "es"} más; no he añadido a nadie. Pídemelo con menos personas o amplía el plan desde el panel.`,
      };
    }
    const creados: Array<{ id: string; name: string }> = [];
    let motivo: string | null = null;
    try {
      for (const p of params.profesionales) {
        const esp = await resolverEspecialidades(
          ctx.businessId,
          p.especialidades
        );
        if (!esp.ok) {
          motivo = esp.motivo;
          break;
        }
        const creado = await createProfessional(
          ctx.businessId,
          { name: p.nombre, serviceIds: esp.servicios.map((s) => s.id) },
          { sync: false }
        );
        creados.push({ id: creado.id, name: creado.name });
      }
    } catch (error) {
      motivo = mensajeDeError(error, "crear_profesionales", ctx.businessId);
      console.error(
        `[Gestor] crear_profesionales del negocio ${ctx.businessId}: creados ${creados.length}/${params.profesionales.length} antes de fallar: ${motivo}`
      );
    } finally {
      if (creados.length > 0)
        await sincronizarCatalogo(ctx.businessId, "crear_profesionales");
    }
    if (creados.length === 0) {
      return {
        ok: false,
        mensaje: `No he podido añadir a nadie: ${motivo ?? "error inesperado"}.`,
      };
    }
    const parcial = creados.length < params.profesionales.length;
    return {
      ok: !parcial,
      mensaje: parcial
        ? `He añadido a ${listar(creados.map((c) => c.name))}, pero el resto no: ${motivo ?? "error inesperado"}.`
        : `Hecho: ${listar(creados.map((c) => c.name))} ya ${creados.length === 1 ? "está" : "están"} en el equipo.`,
      nota: `Profesionales creados: ${creados.map((c) => `${c.name} (id ${c.id})`).join(", ")}${parcial ? ` (lote incompleto: ${motivo})` : ""}.`,
    };
  },
};

const RetirarProfesionalParams = z.object({ profesional: Id }).strict();

const retirarProfesional: AccionDelGestor<
  z.infer<typeof RetirarProfesionalParams>
> = {
  schema: RetirarProfesionalParams,
  async comprobar(ctx, params) {
    const { encontrado: pro, ambiguo } = buscar(
      await profesionalesActivos(ctx.businessId),
      params.profesional
    );
    if (!pro) {
      return {
        ok: false,
        motivo: motivoNoEncontrado("profesional", params.profesional, ambiguo),
      };
    }
    return {
      ok: true,
      descripcion: `retirar a ${pro.name} del equipo (la recepcionista dejará de asignarle citas)`,
      parametros: { profesional: pro.id },
    };
  },
  async ejecutar(ctx, params) {
    const pro = resolverPorIdONombre(
      await profesionalesActivos(ctx.businessId),
      params.profesional
    );
    if (!pro)
      return { ok: false, mensaje: "Esa persona ya no está en el equipo." };
    try {
      const borrado = await deleteProfessional(ctx.businessId, pro.id, {
        sync: false,
      });
      if (!borrado)
        return { ok: false, mensaje: "Esa persona ya no está en el equipo." };
      await sincronizarCatalogo(ctx.businessId, "retirar_profesional");
      return {
        ok: true,
        mensaje: `Hecho: ${pro.name} ya no está en el equipo. Sus citas ya reservadas se mantienen.`,
        nota: `Profesional ${pro.name} (id ${pro.id}) retirado.`,
      };
    } catch (error) {
      return {
        ok: false,
        mensaje: `No he podido retirar a ${pro.name}: ${mensajeDeError(error, "retirar_profesional", ctx.businessId)}`,
      };
    }
  },
};

const FijarEspecialidadParams = z
  .object({
    profesional: Id,
    servicio: Id,
    nivel: z.enum(PROFESSIONAL_SERVICE_LEVELS),
  })
  .strict();

const NIVEL_EN_PALABRAS: Record<ProfessionalServiceLevelInput, string> = {
  especialista: "especialista",
  normal: "lo hace, aunque no es su especialidad",
  no_sugerir: "solo si el cliente lo pide por su nombre",
};

function nivelesActuales(
  links: Array<{ serviceId: string; level: string }>
): Record<string, ProfessionalServiceLevelInput> {
  const niveles: Record<string, ProfessionalServiceLevelInput> = {};
  for (const l of links) {
    if (l.level === "ESPECIALISTA") niveles[l.serviceId] = "especialista";
    else if (l.level === "NO_SUGERIR") niveles[l.serviceId] = "no_sugerir";
  }
  return niveles;
}

const fijarEspecialidad: AccionDelGestor<
  z.infer<typeof FijarEspecialidadParams>
> = {
  schema: FijarEspecialidadParams,
  async comprobar(ctx, params) {
    const p = buscar(
      await profesionalesActivos(ctx.businessId),
      params.profesional
    );
    if (!p.encontrado) {
      return {
        ok: false,
        motivo: motivoNoEncontrado(
          "profesional",
          params.profesional,
          p.ambiguo
        ),
      };
    }
    const s = buscar(await serviciosActivos(ctx.businessId), params.servicio);
    if (!s.encontrado) {
      return {
        ok: false,
        motivo: motivoNoEncontrado("servicio", params.servicio, s.ambiguo),
      };
    }
    return {
      ok: true,
      descripcion: `${p.encontrado.name} en ${s.encontrado.name}: ${NIVEL_EN_PALABRAS[params.nivel]}`,
      parametros: {
        ...params,
        profesional: p.encontrado.id,
        servicio: s.encontrado.id,
      },
    };
  },
  async ejecutar(ctx, params) {
    const pro = resolverPorIdONombre(
      await profesionalesActivos(ctx.businessId),
      params.profesional
    );
    const servicio = resolverPorIdONombre(
      await serviciosActivos(ctx.businessId),
      params.servicio
    );
    if (!pro || !servicio)
      return {
        ok: false,
        mensaje: "Esa persona o ese servicio ya no existen.",
      };
    try {
      const niveles = nivelesActuales(pro.serviceLinks);
      if (params.nivel === "normal") delete niveles[servicio.id];
      else niveles[servicio.id] = params.nivel;
      const actualizado = await updateProfessional(
        ctx.businessId,
        pro.id,
        { serviceLevels: niveles },
        { sync: false }
      );
      if (!actualizado)
        return { ok: false, mensaje: "Esa persona ya no está en el equipo." };
      await sincronizarCatalogo(ctx.businessId, "fijar_especialidad");
      return {
        ok: true,
        mensaje: `Hecho: ${pro.name} en ${servicio.name}, ${NIVEL_EN_PALABRAS[params.nivel]}.`,
        nota: `Nivel de ${pro.name} (id ${pro.id}) en ${servicio.name} (id ${servicio.id}): ${params.nivel}.`,
      };
    } catch (error) {
      return {
        ok: false,
        mensaje: `No he podido cambiarlo: ${mensajeDeError(error, "fijar_especialidad", ctx.businessId)}`,
      };
    }
  },
};

// ---------------------------------------------------------------------------
// fijar_horario / cerrar_dia
// ---------------------------------------------------------------------------

const TramoParams = z.object({ inicio: Hora, fin: Hora }).strict();
const DiaParams = z
  .object({
    abierto: z.boolean(),
    tramos: z.array(TramoParams).max(3).default([]),
  })
  .strict();

const FijarHorarioParams = z
  .object({
    semana: z
      .object({
        lunes: DiaParams,
        martes: DiaParams,
        miercoles: DiaParams,
        jueves: DiaParams,
        viernes: DiaParams,
        sabado: DiaParams,
        domingo: DiaParams,
      })
      .strict(),
  })
  .strict();

function ordenarTramos<T extends { inicio: string }>(tramos: T[]): T[] {
  return [...tramos].sort((a, b) => a.inicio.localeCompare(b.inicio));
}

function describirTramos(
  tramos: Array<{ inicio: string; fin: string }>
): string {
  return ordenarTramos(tramos)
    .map((t) => `${t.inicio}-${t.fin}`)
    .join(" y ");
}

/** «lunes a viernes 09:00-18:00, sábado 09:00-14:00; domingo cerrado». */
export function describirSemana(
  semana: z.infer<typeof FijarHorarioParams>["semana"]
): string {
  const dias = Object.keys(DIAS) as Array<keyof typeof semana>;
  const grupos: Array<{ desde: string; hasta: string; texto: string }> = [];
  for (const dia of dias) {
    const d = semana[dia];
    const texto = d.abierto ? describirTramos(d.tramos) : "cerrado";
    const etiqueta = DIA_EN_ESPANOL[DIAS[dia]];
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.texto === texto) ultimo.hasta = etiqueta;
    else grupos.push({ desde: etiqueta, hasta: etiqueta, texto });
  }
  return grupos
    .map(
      (g) =>
        `${g.desde === g.hasta ? g.desde : `${g.desde} a ${g.hasta}`} ${g.texto}`
    )
    .join("; ");
}

function aHorarioDelNegocio(
  semana: z.infer<typeof FijarHorarioParams>["semana"],
  actual: BusinessSchedule | null
): BusinessSchedule {
  const week = Object.fromEntries(
    WEEK_DAYS.map((day) => {
      const clave = (Object.keys(DIAS) as Array<keyof typeof semana>).find(
        (k) => DIAS[k] === day
      )!;
      const d = semana[clave];
      return [
        day,
        {
          enabled: d.abierto,
          intervals: d.abierto
            ? ordenarTramos(d.tramos).map((t) => ({
                start: t.inicio,
                end: t.fin,
              }))
            : [],
        },
      ];
    })
  ) as BusinessSchedule["week"];
  return { version: 1, week, exceptions: actual?.exceptions ?? [] };
}

async function horarioActual(
  businessId: string
): Promise<BusinessSchedule | null> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { schedule: true },
  });
  const parsed = BusinessScheduleSchema.safeParse(business?.schedule);
  return parsed.success ? parsed.data : null;
}

const fijarHorario: AccionDelGestor<z.infer<typeof FijarHorarioParams>> = {
  schema: FijarHorarioParams,
  async comprobar(ctx, params) {
    const validado = BusinessScheduleSchema.safeParse(
      aHorarioDelNegocio(params.semana, await horarioActual(ctx.businessId))
    );
    if (!validado.success) {
      return {
        ok: false,
        motivo: `Horario no válido: ${validado.error.issues
          .map((i) => {
            const dia = WEEK_DAYS.find((d) => i.path.includes(d));
            return dia ? `${DIA_EN_ESPANOL[dia]}: ${i.message}` : i.message;
          })
          .join("; ")}.`,
      };
    }
    return {
      ok: true,
      descripcion: `el horario: ${describirSemana(params.semana)}`,
    };
  },
  async ejecutar(ctx, params) {
    try {
      const horario = BusinessScheduleSchema.parse(
        aHorarioDelNegocio(params.semana, await horarioActual(ctx.businessId))
      );
      await guardarHorarioDelNegocio(ctx.businessId, horario);
      return {
        ok: true,
        mensaje: `Hecho: ${describirSemana(params.semana)}. La recepcionista ya reserva con este horario.`,
        nota: `Horario semanal guardado: ${describirSemana(params.semana)}.`,
      };
    } catch (error) {
      return {
        ok: false,
        mensaje: `No he podido guardar el horario: ${mensajeDeError(error, "fijar_horario", ctx.businessId)}`,
      };
    }
  },
};

const CerrarDiaParams = z
  .object({
    fecha: Fecha,
    motivo: z.string().trim().max(60).optional(),
  })
  .strict();

function fechaLocalDeHoy(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function fechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

const cerrarDia: AccionDelGestor<z.infer<typeof CerrarDiaParams>> = {
  schema: CerrarDiaParams,
  async comprobar(ctx, params) {
    if (params.fecha < fechaLocalDeHoy(ctx.timezone)) {
      return { ok: false, motivo: "Esa fecha ya ha pasado." };
    }
    const actual = await horarioActual(ctx.businessId);
    if (!actual) {
      // Un negocio recién creado tiene `schedule: {}`; cerrar un día sobre
      // una semana inventada sería mentirle al dueño.
      return {
        ok: false,
        motivo:
          "Primero hay que fijar el horario semanal; después podré cerrar días sueltos.",
      };
    }
    const excepciones = actual.exceptions;
    if (excepciones.some((e) => e.date === params.fecha && e.closed)) {
      return {
        ok: false,
        motivo: `El ${fechaLarga(params.fecha)} ya está marcado como cerrado.`,
      };
    }
    if (excepciones.filter((e) => e.date !== params.fecha).length >= 120) {
      return {
        ok: false,
        motivo:
          "Hay demasiados días especiales guardados; borra alguno desde el panel.",
      };
    }
    return {
      ok: true,
      descripcion: `cerrar el ${fechaLarga(params.fecha)}${params.motivo ? ` (${params.motivo})` : ""}: la recepcionista no reservará ese día`,
    };
  },
  async ejecutar(ctx, params) {
    try {
      const actual = await horarioActual(ctx.businessId);
      if (!actual) {
        return {
          ok: false,
          mensaje: "Primero hay que fijar el horario semanal.",
        };
      }
      const excepciones = actual.exceptions.filter(
        (e) => e.date !== params.fecha
      );
      excepciones.push({
        date: params.fecha,
        closed: true,
        intervals: [],
        ...(params.motivo ? { label: params.motivo } : {}),
      });
      const horario = BusinessScheduleSchema.parse({
        ...actual,
        exceptions: excepciones,
      });
      await guardarHorarioDelNegocio(ctx.businessId, horario);
      return {
        ok: true,
        mensaje: `Hecho: el ${fechaLarga(params.fecha)} queda cerrado. Las citas ya reservadas ese día no se cancelan solas: revísalas en la agenda.`,
        nota: `Día cerrado: ${params.fecha}${params.motivo ? ` (${params.motivo})` : ""}.`,
      };
    } catch (error) {
      return {
        ok: false,
        mensaje: `No he podido cerrar ese día: ${mensajeDeError(error, "cerrar_dia", ctx.businessId)}`,
      };
    }
  },
};

export const ACCIONES_DE_CATALOGO: Record<string, AccionDelGestor<unknown>> = {
  crear_servicios: crearServicios as AccionDelGestor<unknown>,
  editar_servicio: editarServicio as AccionDelGestor<unknown>,
  retirar_servicio: retirarServicio as AccionDelGestor<unknown>,
  crear_profesionales: crearProfesionales as AccionDelGestor<unknown>,
  retirar_profesional: retirarProfesional as AccionDelGestor<unknown>,
  fijar_especialidad: fijarEspecialidad as AccionDelGestor<unknown>,
  fijar_horario: fijarHorario as AccionDelGestor<unknown>,
  cerrar_dia: cerrarDia as AccionDelGestor<unknown>,
};

export type { ContextoDeAccion, ResultadoDeEjecucion };
