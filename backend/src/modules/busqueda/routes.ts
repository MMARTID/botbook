import { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { SIN_CALLS_DEL_GESTOR } from "../../lib/citasDelDueno.js";
import { condicionDeBusqueda } from "../calls/listado.js";

const BusquedaQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
});

const POR_GRUPO = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * El buscador del panel (⌘K): citas y conversaciones de un negocio por
 * nombre del cliente, teléfono (por dígitos, da igual cómo se escriba) o
 * servicio; las conversaciones también por su resumen. Las pantallas y las
 * acciones del buscador son del frontend: aquí solo lo que vive en la BD.
 */
export async function busquedaRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: z.infer<typeof BusquedaQuerySchema> }>(
    "/business/me/buscar",
    { preValidation: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { q } = BusquedaQuerySchema.parse(request.query);
        const businessId = request.user!.businessId;
        const digitos = q.replace(/\D/g, "");

        const servicios = await prisma.service.findMany({
          where: { businessId, name: { contains: q, mode: "insensitive" } },
          select: { id: true },
          take: 50,
        });
        const coincide: Prisma.BookingWhereInput[] = [
          { clientName: { contains: q, mode: "insensitive" } },
        ];
        if (digitos.length >= 3) {
          coincide.push(
            { clientPhone: { contains: digitos } },
            { call: { fromNumber: { contains: digitos } } }
          );
        }
        if (servicios.length > 0) {
          coincide.push({
            serviceIds: { hasSome: servicios.map((servicio) => servicio.id) },
          });
        }
        const ahora = new Date();
        const citas: Prisma.BookingWhereInput = {
          isCancelled: false,
          call: { businessId },
          OR: coincide,
        };
        const select = {
          id: true,
          programedAt: true,
          durationMinutes: true,
          clientName: true,
          clientPhone: true,
          serviceIds: true,
          professional: { select: { name: true } },
          call: { select: { fromNumber: true } },
        } as const;

        const condicionDeLlamadas = await condicionDeBusqueda(businessId, q);
        // Primero lo que viene (es lo que se busca casi siempre: «¿a qué
        // hora venía Marta?») y, si sobra sitio, lo de los últimos 60 días.
        const [futuras, pasadas, llamadas] = await Promise.all([
          prisma.booking.findMany({
            where: { ...citas, programedAt: { gte: ahora } },
            select,
            orderBy: { programedAt: "asc" },
            take: POR_GRUPO,
          }),
          prisma.booking.findMany({
            where: {
              ...citas,
              programedAt: {
                lt: ahora,
                gte: new Date(ahora.getTime() - 60 * DAY_MS),
              },
            },
            select,
            orderBy: { programedAt: "desc" },
            take: POR_GRUPO,
          }),
          condicionDeLlamadas
            ? prisma.call.findMany({
                where: {
                  businessId,
                  AND: [SIN_CALLS_DEL_GESTOR, condicionDeLlamadas],
                },
                select: {
                  id: true,
                  startedAt: true,
                  fromNumber: true,
                  voiceProvider: true,
                  durationSecs: true,
                  summary: true,
                  booking: { select: { isCancelled: true } },
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: POR_GRUPO,
              })
            : [],
        ]);

        const encontradas = [...futuras, ...pasadas].slice(0, POR_GRUPO);
        const nombres = new Map(
          (
            await prisma.service.findMany({
              where: {
                businessId,
                id: {
                  in: [...new Set(encontradas.flatMap((c) => c.serviceIds))],
                },
              },
              select: { id: true, name: true },
            })
          ).map((servicio) => [servicio.id, servicio.name])
        );

        return reply.send({
          citas: encontradas.map((cita) => ({
            id: cita.id,
            programedAt: cita.programedAt.toISOString(),
            durationMinutes: cita.durationMinutes,
            clientName: cita.clientName,
            clientPhone: cita.clientPhone ?? cita.call.fromNumber,
            servicios: cita.serviceIds
              .map((id) => nombres.get(id))
              .filter((nombre): nombre is string => nombre !== undefined),
            profesional: cita.professional?.name ?? null,
          })),
          llamadas: llamadas.map((llamada) => ({
            id: llamada.id,
            startedAt: llamada.startedAt.toISOString(),
            fromNumber: llamada.fromNumber,
            canal: llamada.voiceProvider === "whatsapp" ? "whatsapp" : "voz",
            durationSecs: llamada.durationSecs,
            resumen: llamada.summary ? llamada.summary.slice(0, 140) : null,
            conCita: Boolean(llamada.booking && !llamada.booking.isCancelled),
          })),
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        fastify.log.error(
          { err: error },
          "[Busqueda] Falló la búsqueda del panel"
        );
        return reply.status(500).send({ error: "No se pudo buscar" });
      }
    }
  );
}
