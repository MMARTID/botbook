import { describe, it, expect } from "vitest";
import {
  ACCIONES_PROPONIBLES,
  GESTOR_ASSISTANT_NAME,
  GESTOR_MODEL,
  buildGestorAssistantPayload,
  buildGestorPrompt,
  buildGestorTools,
} from "../../src/lib/gestorPayload.js";

describe("buildGestorPrompt", () => {
  it("fija las reglas del Gestor: rol, marcador, negocio fijado por el sistema, regla de oro, límites y sin Beta", () => {
    const prompt = buildGestorPrompt();
    expect(prompt).toContain("## Rol");
    expect(prompt).toContain("Hablas con el dueño, nunca con clientes");
    expect(prompt).toContain("[WhatsApp · fecha y hora]");
    expect(prompt).toContain(
      "no preguntes de qué negocio se trata ni aceptes que te digan que es otro"
    );
    expect(prompt).toContain("## Regla de oro");
    expect(prompt).toContain("Nunca ejecutas nada tú");
    expect(prompt).toContain("proponer_accion");
    expect(prompt).toContain("sin pedirle que escriba sí o no");
    expect(prompt).toContain(
      "No inventes citas, clientes, servicios, precios ni horarios"
    );
    expect(prompt).toContain("puede escribir AYUDA");
    expect(prompt).not.toMatch(/beta/i);
    expect(prompt).not.toMatch(/end_call|colgar/);
  });

  it("guía la puesta en marcha por pasos y en orden, una propuesta por paso (PR 3)", () => {
    const prompt = buildGestorPrompt();
    expect(prompt).toContain("## Poner en marcha la recepcionista");
    expect(prompt).toContain("faltaPorConfigurar");
    expect(prompt).toMatch(
      /servicios .*personas del equipo.*horario semanal.*calendario/s
    );
    expect(prompt).toContain("no lo puedes conectar tú");
    expect(prompt).toContain("una sola propuesta");
    expect(prompt).toContain("Una sola propuesta a la vez");
    expect(prompt).toContain("formato HH:MM de 24 horas");
  });
});

describe("ACCIONES_PROPONIBLES", () => {
  it("coincide con el registro de acciones y le cuenta al LLM la forma de cada parámetro", async () => {
    const { ACCIONES_DEL_GESTOR } =
      await import("../../src/modules/gestor/acciones.js");
    expect(ACCIONES_PROPONIBLES.map((a) => a.tipo).sort()).toEqual(
      Object.keys(ACCIONES_DEL_GESTOR).sort()
    );
    const tool = buildGestorTools("https://api.alhabla.ai")[3];
    for (const a of ACCIONES_PROPONIBLES) {
      expect(tool.properties.tipo.description).toContain(`"${a.tipo}"`);
      expect(tool.properties.parametros.description).toContain(
        `${a.tipo} → ${a.parametros}`
      );
    }
  });
});

describe("buildGestorTools", () => {
  it("las cuatro tools apuntan a /webhooks/telnyx/gestor y llevan el negocio y el rol por cabecera desde los metadata", () => {
    const tools = buildGestorTools("https://api.alhabla.ai/");
    expect(tools.map((t) => t.name)).toEqual([
      "contexto_negocio",
      "listar_agenda",
      "resumen_llamadas",
      "proponer_accion",
    ]);
    for (const tool of tools) {
      expect(tool.url).toBe(
        `https://api.alhabla.ai/webhooks/telnyx/gestor/${tool.name}`
      );
      expect(tool.headers).toEqual([
        { name: "X-Alhabla-Business", value: "{{business_id}}" },
        { name: "X-Alhabla-Role", value: "{{role}}" },
      ]);
      // Ninguna tool declara businessId en el body: el negocio nunca lo decide el LLM.
      expect(Object.keys(tool.properties)).not.toContain("businessId");
    }
    expect(tools[1].required).toEqual(["dia"]);
    expect(tools[3].required).toEqual(["tipo", "parametros", "resumen"]);
  });
});

describe("buildGestorAssistantPayload", () => {
  it("nombre fijo, modelo del plan, sin saludo y tools inline sin hangup", () => {
    const payload = buildGestorAssistantPayload("https://api.alhabla.ai");
    expect(payload.name).toBe(GESTOR_ASSISTANT_NAME);
    expect(payload.model).toBe(GESTOR_MODEL);
    expect(payload.greeting).toBe("");
    expect(payload.instructions).toBe(buildGestorPrompt());
    expect(payload.tools).toHaveLength(4);
    expect(payload.tools!.every((t) => t.type === "webhook")).toBe(true);
    expect(payload.fallbackConfig).toBeUndefined();
  });
});
