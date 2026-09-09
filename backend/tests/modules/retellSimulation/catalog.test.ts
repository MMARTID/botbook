import { describe, expect, it } from "vitest";
import {
  ALL_CASES,
  SIMULATION_NICHES,
  buildCaseName,
  buildCaseToolMocks,
  getCases,
} from "../../../src/modules/retellSimulation/catalog.js";

/** Las tres tools que el agente puede llamar de verdad. Cualquiera sin mock
 * durante una simulación acabaría llegando al backend real (y al calendario
 * del negocio), que es justo lo que la batería debe evitar. */
const TOOLS_REALES = [
  "get_catalog",
  "check_availability",
  "book_appointment",
];

describe("catálogo de simulación de Retell", () => {
  it("cubre las tres tools con un mock sin filtro en todos los casos", () => {
    for (const simulationCase of ALL_CASES) {
      const mocks = buildCaseToolMocks(simulationCase);

      for (const tool of TOOLS_REALES) {
        const catchAll = mocks.some(
          (mock) => mock.toolName === tool && !mock.matchArgs
        );
        expect(
          catchAll,
          `${buildCaseName(simulationCase)} deja ${tool} sin mock catch-all`
        ).toBe(true);
      }
    }
  });

  it("pone los mocks específicos antes que las redes de seguridad", () => {
    // Retell aplica el primer mock que coincide: si la red de seguridad
    // quedara delante, el caso mediría siempre el mismo escenario.
    for (const simulationCase of ALL_CASES) {
      const mocks = buildCaseToolMocks(simulationCase);
      for (const propio of simulationCase.toolMocks) {
        const indicePropio = mocks.findIndex(
          (mock) =>
            mock.toolName === propio.toolName && mock.output === propio.output
        );
        const indicePrimeroDeEsaTool = mocks.findIndex(
          (mock) => mock.toolName === propio.toolName
        );
        expect(
          indicePropio,
          `${buildCaseName(simulationCase)}: el mock propio de ` +
            `${propio.toolName} queda tapado`
        ).toBe(indicePrimeroDeEsaTool);
      }
    }
  });

  it("no deja dos mocks catch-all de la misma tool", () => {
    // Retell rechaza la definición con 400 si una tool tiene más de un mock
    // sin input_match_rule específico.
    for (const simulationCase of ALL_CASES) {
      const porTool = new Map<string, number>();
      for (const mock of buildCaseToolMocks(simulationCase)) {
        if (mock.matchArgs) continue;
        porTool.set(mock.toolName, (porTool.get(mock.toolName) ?? 0) + 1);
      }
      for (const [tool, total] of porTool) {
        expect(
          total,
          `${buildCaseName(simulationCase)} tiene ${total} catch-all de ${tool}`
        ).toBe(1);
      }
    }
  });

  it("no repite el nombre remoto de ningún caso", () => {
    const nombres = ALL_CASES.map(buildCaseName);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it("da a cada caso guion y al menos una métrica", () => {
    for (const simulationCase of ALL_CASES) {
      expect(simulationCase.userPrompt.length).toBeGreaterThan(80);
      expect(simulationCase.metrics.length).toBeGreaterThan(0);
    }
  });

  it("tiene casos, y al menos uno de humo, en cada nicho", () => {
    for (const niche of SIMULATION_NICHES) {
      const cases = getCases({ niche });
      expect(cases.length, `${niche} sin casos`).toBeGreaterThan(0);
      expect(
        getCases({ niche, smokeOnly: true }).length,
        `${niche} sin casos de humo`
      ).toBeGreaterThan(0);
    }
  });

  it("mockea el profesional pedido cuando el caso lo comprueba", () => {
    // Un partial_match por professionalId solo tiene sentido si el guion
    // pide a esa persona; si no, el caso no mide lo que cree medir. Los ids
    // van sin tildes ("pro-lucia") y el guion sí las lleva ("Lucía"), así que
    // se comparan sin diacríticos.
    const sinTildes = (texto: string) =>
      texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");

    for (const simulationCase of ALL_CASES) {
      for (const mock of simulationCase.toolMocks) {
        const professionalId = mock.matchArgs?.professionalId;
        if (typeof professionalId !== "string") continue;

        const nombre = sinTildes(professionalId.replace(/^pro-/, ""));
        expect(
          sinTildes(simulationCase.userPrompt),
          `${buildCaseName(simulationCase)} filtra por ${professionalId} ` +
            "pero el guion no nombra a esa persona"
        ).toContain(nombre);
      }
    }
  });
});
