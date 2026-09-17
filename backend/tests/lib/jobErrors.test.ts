import { describe, it, expect } from "vitest";
import { esFalloPermanentePorEstado } from "../../src/lib/jobErrors.js";

describe("esFalloPermanentePorEstado", () => {
  it("da por definitivo lo que no mejora repitiéndolo", () => {
    // Destinatario inválido, petición mal formada, recurso inexistente.
    expect(esFalloPermanentePorEstado(400)).toBe(true);
    expect(esFalloPermanentePorEstado(404)).toBe(true);
    expect(esFalloPermanentePorEstado(422)).toBe(true);
  });

  it("deja reintentar lo que sí puede arreglarse solo", () => {
    // 401/403: token caducado o revocado — el siguiente intento renueva
    // credenciales. Descartar aquí un aviso de pago fallido sería peor.
    expect(esFalloPermanentePorEstado(401)).toBe(false);
    expect(esFalloPermanentePorEstado(403)).toBe(false);
    expect(esFalloPermanentePorEstado(408)).toBe(false);
    expect(esFalloPermanentePorEstado(429)).toBe(false);
    expect(esFalloPermanentePorEstado(500)).toBe(false);
    expect(esFalloPermanentePorEstado(503)).toBe(false);
    expect(esFalloPermanentePorEstado(undefined)).toBe(false);
  });
});
