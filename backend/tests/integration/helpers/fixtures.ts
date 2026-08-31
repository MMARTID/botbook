import { randomUUID } from "node:crypto";
import { prisma } from "../../../src/lib/prisma.js";
import { DEFAULT_BUSINESS_SCHEDULE } from "../../../src/lib/businessSchedule.js";
import type { Business, Call } from "@prisma/client";

/** Próximo lunes a las 12:00 UTC (~13-14h Madrid según DST) — dentro del
 * horario por defecto (L-V 09:00-18:00) sin depender de cuándo se corra el test. */
export function nextOpenSlot(): Date {
  const date = new Date();
  const daysUntilMonday = (8 - date.getUTCDay()) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + daysUntilMonday);
  date.setUTCHours(12, 0, 0, 0);
  return date;
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
      googleRefreshToken: "fake-refresh-token",
      googleCalendarId: "primary",
      googleCalendarConnected: true,
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
      vapiCallId: `call_${randomUUID()}`,
      status: "IN_PROGRESS",
      ...overrides,
    },
  });
}

export async function createTestProfessional(businessId: string, name = "Profesional de prueba") {
  return prisma.professional.create({
    data: { businessId, name, active: true },
  });
}
