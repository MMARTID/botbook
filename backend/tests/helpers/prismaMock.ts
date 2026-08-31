import { vi } from "vitest";

/**
 * Devuelve un mock vacío del cliente Prisma con las funciones necesarias
 * para los tests unitarios. Úsalo dentro de la factory de `vi.mock`.
 */
export function createPrismaMock() {
  return {
    professional: {
      findMany: vi.fn(),
    },
    booking: {
      findMany: vi.fn(),
    },
    call: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    agent: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    service: {
      findUnique: vi.fn(),
    },
  };
}
