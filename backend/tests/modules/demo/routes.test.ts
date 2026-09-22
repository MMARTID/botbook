import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getDemoAssistantId,
  resolveDemoMaxDurationSeconds,
} from "../../../src/modules/demo/routes.js";

const DEMO_ENV_VARS = [
  "TELNYX_DEMO_ASSISTANT_ID",
  "TELNYX_DEMO_PELUQUERIA_ASSISTANT_ID",
  "TELNYX_DEMO_CENTRO_ESTETICA_ASSISTANT_ID",
  "TELNYX_DEMO_SALON_UNAS_ASSISTANT_ID",
  "TELNYX_DEMO_BARBERIA_ASSISTANT_ID",
  "TELNYX_DEMO_FISIOTERAPIA_ASSISTANT_ID",
] as const;

describe("getDemoAssistantId", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of DEMO_ENV_VARS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of DEMO_ENV_VARS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it("devuelve el assistant del nicho cuando está configurado", () => {
    process.env.TELNYX_DEMO_ASSISTANT_ID = "assistant-general";
    process.env.TELNYX_DEMO_PELUQUERIA_ASSISTANT_ID = "assistant-peluqueria";

    expect(getDemoAssistantId("peluqueria")).toBe("assistant-peluqueria");
  });

  it("cae al genérico si el nicho no tiene cuenta de demo propia", () => {
    process.env.TELNYX_DEMO_ASSISTANT_ID = "assistant-general";

    expect(getDemoAssistantId("barberia")).toBe("assistant-general");
  });

  it("usa el genérico cuando no se indica nicho", () => {
    process.env.TELNYX_DEMO_ASSISTANT_ID = "assistant-general";
    process.env.TELNYX_DEMO_FISIOTERAPIA_ASSISTANT_ID = "assistant-fisio";

    expect(getDemoAssistantId()).toBe("assistant-general");
  });

  // Cloud Run solo admite [A-Za-z0-9_] en el nombre de una variable, así que
  // el salón de uñas va sin Ñ (la variante con Ñ nunca llegó a producción).
  it("mapea el salón de uñas a su variable sin Ñ", () => {
    process.env.TELNYX_DEMO_SALON_UNAS_ASSISTANT_ID = "assistant-unas";

    expect(getDemoAssistantId("salon-de-unas")).toBe("assistant-unas");
  });

  it("devuelve null si no hay ningún assistant configurado", () => {
    expect(getDemoAssistantId("peluqueria")).toBeNull();
    expect(getDemoAssistantId()).toBeNull();
  });
});

describe("resolveDemoMaxDurationSeconds", () => {
  const ENV_VAR = "TELNYX_DEMO_MAX_DURATION_SECONDS";
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[ENV_VAR];
    delete process.env[ENV_VAR];
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env[ENV_VAR];
    } else {
      process.env[ENV_VAR] = saved;
    }
  });

  it("usa el default de 60s cuando la variable no está configurada", () => {
    expect(resolveDemoMaxDurationSeconds()).toBe(60);
  });

  it("respeta un valor numérico válido", () => {
    process.env[ENV_VAR] = "90";
    expect(resolveDemoMaxDurationSeconds()).toBe(90);
  });

  it("cae al default si el valor no es numérico, cero, negativo o vacío", () => {
    for (const valor of ["no-es-un-numero", "0", "-30", ""]) {
      process.env[ENV_VAR] = valor;
      expect(resolveDemoMaxDurationSeconds()).toBe(60);
    }
  });
});
