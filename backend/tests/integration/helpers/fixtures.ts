import { randomUUID } from "node:crypto";
import { prisma } from "../../../src/lib/prisma.js";
import { cifrarJson } from "../../../src/lib/cifradoDeCredenciales.js";
import { DEFAULT_BUSINESS_SCHEDULE } from "../../../src/lib/businessSchedule.js";
import type { Business, Call } from "@prisma/client";

/** Próximo lunes a las 12:00 UTC (~13-14h Madrid según DST) — dentro del
 * horario por defecto (L-V 09:00-18:00) sin depender de cuándo se corra el test. */
/** Próximo lunes a las 12:00 hora de Madrid, expresado como lo envía el agente
 * (con el offset local, p. ej. "2026-09-21T12:00:00+02:00"). Desde eb5e859
 * lib/voiceDateTime.ts reinterpreta una hora con `Z` como hora de pared del
 * negocio, así que mandar `toISOString()` (UTC) haría que 12:00Z se guardase
 * como 12:00 Madrid = 10:00Z. */
export function nextOpenSlot(): { iso: string; date: Date } {
  const base = new Date();
  const daysUntilMonday = (8 - base.getUTCDay()) % 7 || 7;
  base.setUTCDate(base.getUTCDate() + daysUntilMonday);
  const dia = base.toISOString().slice(0, 10);
  // Offset de Europe/Madrid ese día (+02:00 en verano, +01:00 en invierno).
  const offset =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Madrid",
      timeZoneName: "longOffset",
    })
      .formatToParts(new Date(`${dia}T12:00:00Z`))
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "+00:00";
  const iso = `${dia}T12:00:00${offset}`;
  return { iso, date: new Date(iso) };
}

export async function createTestBusiness(
  overrides: Partial<Business> = {}
): Promise<Business> {
  return prisma.business.create({
    data: {
      name: "Peluquería de prueba",
      phone: `+34${Math.floor(600_000_000 + Math.random() * 99_999_999)}`,
      timezone: "Europe/Madrid",
      schedule: DEFAULT_BUSINESS_SCHEDULE as unknown as object,
      bookingCapacity: 1,
      calendarProvider: "google",
      calendarConnections: {
        create: {
          provider: "google",
          calendarId: "primary",
          credentials: cifrarJson({
            provider: "google",
            refreshToken: "fake-refresh-token",
          }),
          connected: true,
        },
      },
      ...overrides,
    },
  });
}

export async function createTestCall(
  businessId: string,
  overrides: Partial<Call> = {}
): Promise<Call> {
  return prisma.call.create({
    data: {
      businessId,
      callId: `call_${randomUUID()}`,
      status: "IN_PROGRESS",
      ...overrides,
    },
  });
}

export async function createTestProfessional(
  businessId: string,
  name = "Profesional de prueba"
) {
  return prisma.professional.create({
    data: { businessId, name, active: true },
  });
}
