import { describe, it, expect, vi } from "vitest";
import {
  normalizarProveedorDeCalendario,
  PROVEEDORES_DE_CALENDARIO,
} from "../../../src/adapters/calendar/CalendarProvider.js";
import { obtenerProveedorDeCalendario } from "../../../src/adapters/calendar/registry.js";

// El registro instancia los adaptadores al cargarse: se mockean los SDKs
// para no arrastrar googleapis ni Microsoft Graph en un test de cableado.
vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: vi.fn() },
    calendar: vi.fn(),
  },
}));

vi.mock("../../../src/lib/microsoftGraph.js", () => ({
  createMicrosoftCalendarEvent: vi.fn(),
  deleteMicrosoftCalendarEvent: vi.fn(),
  listMicrosoftBusyIntervals: vi.fn(),
  listMicrosoftCalendars: vi.fn(),
  listMicrosoftUpcomingEvents: vi.fn(),
  refreshMicrosoftAccessToken: vi.fn(),
}));

describe("obtenerProveedorDeCalendario", () => {
  it.each(PROVEEDORES_DE_CALENDARIO)(
    "devuelve un adaptador cuyo id es %s",
    (id) => {
      expect(obtenerProveedorDeCalendario(id).id).toBe(id);
    }
  );

  it("devuelve siempre la misma instancia (singleton sin estado)", () => {
    expect(obtenerProveedorDeCalendario("google")).toBe(
      obtenerProveedorDeCalendario("google")
    );
  });

  it("cada adaptador implementa las cinco operaciones de la interfaz", () => {
    for (const id of PROVEEDORES_DE_CALENDARIO) {
      const proveedor = obtenerProveedorDeCalendario(id);
      expect(typeof proveedor.listarCalendarios).toBe("function");
      expect(typeof proveedor.listarProximosEventos).toBe("function");
      expect(typeof proveedor.listarOcupacion).toBe("function");
      expect(typeof proveedor.crearEvento).toBe("function");
      expect(typeof proveedor.borrarEvento).toBe("function");
    }
  });
});

describe("normalizarProveedorDeCalendario", () => {
  it("null y undefined caen a google", () => {
    expect(normalizarProveedorDeCalendario(null)).toBe("google");
    expect(normalizarProveedorDeCalendario(undefined)).toBe("google");
  });

  it("conserva google y outlook", () => {
    expect(normalizarProveedorDeCalendario("google")).toBe("google");
    expect(normalizarProveedorDeCalendario("outlook")).toBe("outlook");
  });

  it("un valor desconocido cae a google (regla histórica del frontend)", () => {
    expect(normalizarProveedorDeCalendario("basura")).toBe("google");
  });
});
