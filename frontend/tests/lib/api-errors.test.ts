import { describe, it, expect } from "vitest";
import { AxiosError, type AxiosResponse } from "axios";
import { describeApiError } from "@/lib/api-errors";

const RESPALDO = "No se pudo guardar el cambio.";

function errorHttp(status: number, data: unknown) {
  return new AxiosError(
    "Request failed",
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      status,
      data,
      statusText: "",
      headers: {},
      config: {},
    } as unknown as AxiosResponse
  );
}

describe("describeApiError", () => {
  it.each([
    [
      400,
      {
        error: "Ese número es el de Alhabla. Escribe tu propio móvil.",
        code: "OWNER_WHATSAPP_IS_ALHABLA",
      },
    ],
    [401, { error: "La contraseña actual no es correcta" }],
    [
      409,
      {
        error: "Los avisos ya están activos en este móvil.",
        code: "OWNER_WHATSAPP_ALREADY_ACTIVE",
      },
    ],
    [
      429,
      {
        error:
          "Acabamos de enviarte el mensaje. Espera cinco minutos antes de pedir otro.",
        code: "OWNER_WHATSAPP_ACTIVATION_TOO_SOON",
      },
    ],
  ])("con un %i enseña el texto del backend", (status, data) => {
    expect(describeApiError(errorHttp(status, data), RESPALDO)).toBe(
      data.error
    );
  });

  it.each([
    ["un 500 con texto en inglés", 500, { error: "Failed to update business" }],
    [
      "un 500 del manejador global",
      500,
      {
        statusCode: 500,
        error: "Internal Server Error",
        message: "Internal server error",
      },
    ],
    [
      "un 500 aunque venga en español",
      500,
      { error: "No se pudo eliminar la cuenta" },
    ],
    [
      "un 502 de un proveedor",
      502,
      { error: "No se pudo retirar el número de Telnyx." },
    ],
    ["un 503", 503, { error: "Billing portal is unavailable" }],
    ["un 502 del proxy en HTML", 502, "<html>Bad Gateway</html>"],
  ])("con %s usa el respaldo", (_caso, status, data) => {
    expect(describeApiError(errorHttp(status, data), RESPALDO)).toBe(RESPALDO);
  });

  it.each([
    [
      "el límite de peticiones de @fastify/rate-limit",
      429,
      {
        statusCode: 429,
        error: "Too Many Requests",
        message: "Rate limit exceeded. Retry in 1 minute",
      },
    ],
    [
      "un 400 del manejador global",
      400,
      {
        statusCode: 400,
        error: "Bad Request",
        message: "Body cannot be empty when content-type is set to JSON",
      },
    ],
    [
      "una ruta que no existe",
      404,
      {
        statusCode: 404,
        error: "Not Found",
        message: "Route PATCH:/business/me not found",
      },
    ],
  ])(
    "con la forma estándar de Fastify (%s) usa el respaldo",
    (_caso, status, data) => {
      expect(describeApiError(errorHttp(status, data), RESPALDO)).toBe(
        RESPALDO
      );
    }
  );

  it("con los fallos de Zod (una lista, no un texto) usa el respaldo", () => {
    const error = errorHttp(400, {
      error: [{ path: ["phone"], message: "Invalid" }],
    });
    expect(describeApiError(error, RESPALDO)).toBe(RESPALDO);
  });

  it("con un texto de más de 180 caracteres usa el respaldo", () => {
    const error = errorHttp(400, { error: "a".repeat(181) });
    expect(describeApiError(error, RESPALDO)).toBe(RESPALDO);
  });

  it("sin respuesta (red caída) usa el respaldo", () => {
    const error = new AxiosError("Network Error", "ERR_NETWORK");
    expect(describeApiError(error, RESPALDO)).toBe(RESPALDO);
  });

  it("con un error que no es de axios usa el respaldo", () => {
    expect(describeApiError(new Error("boom"), RESPALDO)).toBe(RESPALDO);
    expect(describeApiError("boom", RESPALDO)).toBe(RESPALDO);
  });
});
