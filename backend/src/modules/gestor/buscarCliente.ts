import { prisma } from "../../lib/prisma.js";
import { formatearCita, mapaDeServicios } from "../whatsapp/avisosNegocio.js";
import { PREFIJO_DE_CALL_DEL_GESTOR } from "./accionesAgenda.js";
import { normalizar } from "./normalizar.js";

/**
 * Tool `buscar_cliente` del Gestor: la ficha de un cliente por nombre o por
 * móvil — próximas citas (con su citaId, para mover o cancelar), las
 * últimas, cuántas lleva y cuántas se cancelaron, recados sin atender y su
 * último contacto. `listar_agenda` solo busca por día; esto contesta «¿cuándo
 * vino Marta?» o «¿tiene cita Pepe?».
 *
 * Solo ve lo que pasó por Alhabla (recepcionista, WhatsApp o el propio
 * Gestor): una cita que el negocio apuntó a mano en su calendario no está en
 * `bookings`, y la respuesta lo recuerda (`alcance`) para que el Gestor no
 * afirme que un cliente no tiene cita.
 */

const MAX_CLIENTES = 5;
const MAX_CITAS_LEIDAS = 3000;
const MAX_CITAS_POR_LISTA = 3;
const MAX_RECADOS_LEIDOS = 50;
const MESES_DE_HISTORIAL = 24;

export const ALCANCE_DE_LA_FICHA =
  "Solo están las citas que pasaron por Alhabla (la recepcionista, WhatsApp o este chat); las que el negocio apuntó directamente en su calendario no salen aquí.";

/** Los 9 últimos dígitos: el mismo móvil con o sin +34, espacios o guiones.
 * Con menos de 6 dígitos no es un teléfono. */
function sufijoDeTelefono(texto: string | null | undefined): string | null {
  const digitos = (texto ?? "").replace(/\D/g, "");
  return digitos.length >= 6 ? digitos.slice(-9) : null;
}

/** Cada palabra buscada tiene que empezar una palabra del nombre: «ana»
 * encuentra a «Ana García» y a «Anabel», no a «Susana». */
function coincideElNombre(nombre: string | null, palabras: string[]): boolean {
  if (!nombre || palabras.length === 0) return false;
  const delNombre = normalizar(nombre).split(" ");
  return palabras.every((p) => delNombre.some((d) => d.startsWith(p)));
}

function texto(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objeto(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

interface CitaLeida {
  id: string;
  programedAt: Date;
  clientName: string | null;
  clientPhone: string | null;
  serviceIds: string[];
  isCancelled: boolean;
  confirmedByClientAt: Date | null;
  professional: { name: string } | null;
  call: { fromNumber: string | null };
}

interface RecadoLeido {
  id: string;
  createdAt: Date;
  nombre: string | null;
  telefono: string | null;
  motivo: string | null;
  quiereQueLeLlamen: boolean;
}

interface Ficha {
  nombre: string | null;
  telefono: string | null;
  citas: CitaLeida[];
  recados: RecadoLeido[];
}

export async function buscarCliente(
  businessId: string,
  params: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, timezone: true },
  });
  if (!business) {
    return { status: 404, body: { error: "Negocio no encontrado" } };
  }
  const consulta = texto(params.cliente) ?? "";
  const telefono = sufijoDeTelefono(consulta);
  // Un número corto no es ni un móvil ni un nombre: se vuelve a pedir.
  const palabras = telefono
    ? []
    : normalizar(consulta)
        .split(" ")
        .filter((p) => p.length >= 2 && !/\d/.test(p));
  if (!telefono && palabras.length === 0) {
    return {
      status: 200,
      body: { error: "Dime el nombre o el móvil del cliente." },
    };
  }

  const desde = new Date();
  desde.setMonth(desde.getMonth() - MESES_DE_HISTORIAL);
  const [citasLeidas, recadosLeidos] = await Promise.all([
    prisma.booking.findMany({
      where: {
        call: { businessId: business.id },
        ...(telefono
          ? {
              OR: [
                { clientPhone: { endsWith: telefono } },
                { call: { fromNumber: { endsWith: telefono } } },
              ],
            }
          : { clientName: { not: null }, programedAt: { gte: desde } }),
      },
      orderBy: { programedAt: "desc" },
      take: MAX_CITAS_LEIDAS,
      select: {
        id: true,
        programedAt: true,
        clientName: true,
        clientPhone: true,
        serviceIds: true,
        isCancelled: true,
        confirmedByClientAt: true,
        professional: { select: { name: true } },
        call: { select: { fromNumber: true } },
      },
    }),
    prisma.lead.findMany({
      where: { type: "message", resolvedAt: null, call: { businessId } },
      orderBy: { createdAt: "desc" },
      take: MAX_RECADOS_LEIDOS,
      select: { id: true, createdAt: true, data: true },
    }),
  ]);

  const citas = telefono
    ? citasLeidas
    : citasLeidas.filter((c) => coincideElNombre(c.clientName, palabras));
  const recados: RecadoLeido[] = recadosLeidos
    .map((r) => {
      const d = objeto(r.data);
      return {
        id: r.id,
        createdAt: r.createdAt,
        nombre: texto(d.clientName),
        telefono: texto(d.clientPhone),
        motivo: texto(d.motivo),
        quiereQueLeLlamen: d.quiereQueLeLlamen === true,
      };
    })
    .filter((r) =>
      telefono
        ? (sufijoDeTelefono(r.telefono) ?? "").endsWith(telefono)
        : coincideElNombre(r.nombre, palabras)
    );

  // Una ficha por móvil. Lo que llega sin móvil va a la ficha de ese mismo
  // nombre si solo hay una (por eso va después); si no, a una ficha propia.
  const fichas: Ficha[] = [];
  const porTelefono = new Map<string, Ficha>();
  const fichaPara = (tel: string | null, nombre: string | null): Ficha => {
    const sufijo = sufijoDeTelefono(tel);
    const clave = normalizar(nombre ?? "");
    const mismoNombre = sufijo
      ? []
      : fichas.filter(
          (f) => f.nombre !== null && normalizar(f.nombre) === clave
        );
    const existente = sufijo
      ? porTelefono.get(sufijo)
      : mismoNombre.length === 1
        ? mismoNombre[0]
        : undefined;
    if (existente) return existente;
    const nueva: Ficha = {
      nombre: null,
      telefono: sufijo ? tel : null,
      citas: [],
      recados: [],
    };
    if (sufijo) porTelefono.set(sufijo, nueva);
    fichas.push(nueva);
    return nueva;
  };
  const telefonoDe = (c: CitaLeida) => c.clientPhone ?? c.call.fromNumber;
  const conMovil = (tel: string | null) => sufijoDeTelefono(tel) !== null;
  for (const cita of [
    ...citas.filter((c) => conMovil(telefonoDe(c))),
    ...citas.filter((c) => !conMovil(telefonoDe(c))),
  ]) {
    const ficha = fichaPara(telefonoDe(cita), cita.clientName);
    // Las citas llegan de la más reciente a la más antigua: el primer nombre
    // es el último que dio.
    ficha.nombre ??= texto(cita.clientName);
    ficha.citas.push(cita);
  }
  for (const recado of [
    ...recados.filter((r) => conMovil(r.telefono)),
    ...recados.filter((r) => !conMovil(r.telefono)),
  ]) {
    const ficha = fichaPara(recado.telefono, recado.nombre);
    ficha.nombre ??= recado.nombre;
    ficha.recados.push(recado);
  }

  // Primero la ficha con la cita más próxima o más reciente; las que solo
  // tienen recados, por la fecha del recado.
  const ahora = Date.now();
  const relevancia = (f: Ficha) =>
    Math.max(
      ...f.citas.map((c) => c.programedAt.getTime()),
      ...f.recados.map((r) => r.createdAt.getTime()),
      0
    );
  const ordenadas = [...fichas].sort((a, b) => relevancia(b) - relevancia(a));
  const mostradas = ordenadas.slice(0, MAX_CLIENTES);

  const sufijos = [
    ...new Set(
      mostradas
        .map((f) => sufijoDeTelefono(f.telefono))
        .filter((s): s is string => s !== null)
    ),
  ];
  const contactos = sufijos.length
    ? await prisma.call.findMany({
        where: {
          businessId: business.id,
          OR: sufijos.map((s) => ({ fromNumber: { endsWith: s } })),
          // Una cita apuntada por el dueño desde el Gestor lleva el móvil del
          // cliente, pero el cliente no ha contactado.
          NOT: { callId: { startsWith: PREFIJO_DE_CALL_DEL_GESTOR } },
        },
        orderBy: { startedAt: "desc" },
        take: 100,
        select: { fromNumber: true, startedAt: true, voiceProvider: true },
      })
    : [];

  const porId = await mapaDeServicios([
    ...new Set(mostradas.flatMap((f) => f.citas.flatMap((c) => c.serviceIds))),
  ]);
  const servicios = (c: CitaLeida) =>
    c.serviceIds
      .map((id) => porId.get(id))
      .filter((n): n is string => !!n);

  return {
    status: 200,
    body: {
      clientes: mostradas.map((f) => {
        const ordenCronologico = [...f.citas].sort(
          (a, b) => a.programedAt.getTime() - b.programedAt.getTime()
        );
        const vigentes = ordenCronologico.filter((c) => !c.isCancelled);
        const sufijo = sufijoDeTelefono(f.telefono);
        const contacto = sufijo
          ? contactos.find((c) =>
              (sufijoDeTelefono(c.fromNumber) ?? "").endsWith(sufijo)
            )
          : undefined;
        return {
          nombre: f.nombre ?? "sin nombre",
          telefono: f.telefono,
          proximasCitas: vigentes
            .filter((c) => c.programedAt.getTime() >= ahora)
            .slice(0, MAX_CITAS_POR_LISTA)
            .map((c) => ({
              citaId: c.id,
              cuando: formatearCita(c.programedAt, business.timezone),
              servicios: servicios(c),
              profesional: c.professional?.name ?? null,
              confirmadaPorElCliente: c.confirmedByClientAt !== null,
            })),
          ultimasCitas: vigentes
            .filter((c) => c.programedAt.getTime() < ahora)
            .slice(-MAX_CITAS_POR_LISTA)
            .reverse()
            .map((c) => ({
              cuando: formatearCita(c.programedAt, business.timezone),
              servicios: servicios(c),
              profesional: c.professional?.name ?? null,
            })),
          citasEnTotal: vigentes.length,
          canceladas: f.citas.length - vigentes.length,
          recadosSinAtender: f.recados.map((r) => ({
            recadoId: r.id,
            motivo: r.motivo,
            quiereQueLeLlamen: r.quiereQueLeLlamen,
            dejadoEl: formatearCita(r.createdAt, business.timezone),
          })),
          ultimoContacto: contacto
            ? {
                cuando: formatearCita(contacto.startedAt, business.timezone),
                canal:
                  contacto.voiceProvider === "whatsapp"
                    ? "WhatsApp"
                    : "llamada",
              }
            : null,
        };
      }),
      masCoincidencias: Math.max(0, ordenadas.length - MAX_CLIENTES),
      alcance: ALCANCE_DE_LA_FICHA,
    },
  };
}
