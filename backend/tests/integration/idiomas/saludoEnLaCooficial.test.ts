import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import type { Business } from "@prisma/client";
import { prisma } from "../../../src/lib/prisma.js";
import { parseAgentSettings } from "../../../src/lib/managedAgentPrompt.js";
import { resolverIdiomas } from "../../../src/lib/idiomas/resolver.js";
import { resetDb } from "../helpers/db.js";
import { createTestBusiness } from "../helpers/fixtures.js";

// La migración de datos del 2026-10-05 contra Postgres real: en CI se aplica
// con la base vacía (no toca nada), así que aquí se vuelve a ejecutar sobre
// negocios guardados con las reglas anteriores. Lo que protege: un negocio
// que hoy saluda en catalán, euskera o gallego no pasa a saludar en
// castellano sin haberlo elegido.
const MIGRACION = readFileSync(
  fileURLToPath(
    new URL(
      "../../../prisma/migrations/20261005150000_saludo_en_la_cooficial/migration.sql",
      import.meta.url
    )
  ),
  "utf8"
);

const BASE = {
  version: 1,
  tone: "warm",
  primaryGoal: "bookings",
  responseStyle: "concise",
  escalation: "take_message",
  voiceGender: "femenina",
};

async function negocioCon(agentSettings: Record<string, unknown> | null) {
  const negocio = await createTestBusiness(
    agentSettings
      ? {
          agentSettings: {
            ...BASE,
            ...agentSettings,
          } as Business["agentSettings"],
        }
      : {}
  );
  return negocio.id;
}

async function ajustesGuardados(id: string) {
  const negocio = await prisma.business.findUniqueOrThrow({
    where: { id },
    select: { agentSettings: true },
  });
  return negocio.agentSettings as Record<string, unknown> | null;
}

describe("migración saludo_en_la_cooficial", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("guarda la cooficial como saludo donde la regla anterior ya saludaba en ella", async () => {
    const castellanoConCatalan = await negocioCon({
      languages: ["es-ES", "ca-ES"],
      voiceLanguage: "es-ES",
    });
    const sinSaludoConEuskera = await negocioCon({
      languages: ["es-ES", "eu-ES"],
    });
    const inglesConGallego = await negocioCon({
      languages: ["es-ES", "en-GB", "gl-ES"],
      voiceLanguage: "en-GB",
    });
    const otraCooficialQueNoEstaActiva = await negocioCon({
      languages: ["es-ES", "gl-ES"],
      voiceLanguage: "ca-ES",
    });
    const dosCooficiales = await negocioCon({
      languages: ["es-ES", "gl-ES", "eu-ES"],
      voiceLanguage: "es-ES",
    });

    await prisma.$executeRawUnsafe(MIGRACION);

    expect(await ajustesGuardados(castellanoConCatalan)).toMatchObject({
      languages: ["es-ES", "ca-ES"],
      voiceLanguage: "ca-ES",
    });
    expect(await ajustesGuardados(sinSaludoConEuskera)).toMatchObject({
      voiceLanguage: "eu-ES",
    });
    expect(await ajustesGuardados(inglesConGallego)).toMatchObject({
      voiceLanguage: "gl-ES",
    });
    expect(await ajustesGuardados(otraCooficialQueNoEstaActiva)).toMatchObject(
      { voiceLanguage: "gl-ES" }
    );
    // La primera en orden canónico (catalán, euskera, gallego), como la
    // regla anterior.
    expect(await ajustesGuardados(dosCooficiales)).toMatchObject({
      voiceLanguage: "eu-ES",
    });

    // Y así la recepcionista sigue saludando como antes: Marta de Soniox
    // arrancando en catalán, con el saludo en catalán.
    const perfil = resolverIdiomas(
      parseAgentSettings(await ajustesGuardados(castellanoConCatalan))
    );
    expect(perfil).toMatchObject({
      principal: "ca-ES",
      cooficial: "ca-ES",
      isoDeLaVoz: "ca",
    });
    expect(perfil.voz.id).toBe("Soniox.tts-rt-v2.Marta");
  });

  it("no toca a quien ya saluda en su cooficial, ni a quien no tiene ninguna", async () => {
    const ajustesSinTocar = [
      { languages: ["es-ES", "ca-ES"], voiceLanguage: "ca-ES" },
      {
        languages: ["es-ES", "en-GB", "gl-ES"],
        voiceLanguage: "gl-ES",
        voz: "Soniox.tts-rt-v2.Sergio",
      },
      { languages: ["es-ES"], voiceLanguage: "es-ES" },
      { languages: ["es-ES", "en-GB"], voiceLanguage: "en-GB" },
      { voiceLanguage: "es-ES" },
    ];
    const ids: string[] = [];
    for (const ajustes of ajustesSinTocar) ids.push(await negocioCon(ajustes));
    const sinAjustes = await negocioCon(null);
    const antes = await Promise.all(ids.map(ajustesGuardados));

    const tocados = await prisma.$executeRawUnsafe(MIGRACION);

    expect(tocados).toBe(0);
    expect(await Promise.all(ids.map(ajustesGuardados))).toEqual(antes);
    expect(await ajustesGuardados(sinAjustes)).toBeNull();
  });
});
