import { describe, it, expect } from "vitest";
import {
  CODIGOS_DE_IDIOMA,
  GENEROS_DE_VOZ,
  IDIOMAS,
  MERCADOS,
  componerSaludo,
  esVozDelCatalogo,
  hablaIdioma,
  puedeSerPrincipal,
  vozHabla,
  type ProveedorDeVoz,
} from "../../../src/lib/idiomas/catalogo.js";

const PREFIJO: Record<ProveedorDeVoz, string> = {
  telnyx: "Telnyx.Ultra.",
  soniox: "Soniox.",
  minimax: "Minimax.",
  azure: "Azure.",
};

/**
 * Invariantes del catálogo: añadir un idioma o un mercado incompleto debe
 * romper aquí, no en una llamada real.
 */
describe("catálogo de idiomas", () => {
  it("los seis idiomas de siempre no cambian de orden (alimentan el hash del payload)", () => {
    expect(CODIGOS_DE_IDIOMA.slice(0, 6)).toEqual([
      "es-ES",
      "en-GB",
      "fr-FR",
      "ca-ES",
      "eu-ES",
      "gl-ES",
    ]);
  });

  it("cada idioma tiene ISO, nombres, saludo con el negocio y una transcripción que lo entiende", () => {
    for (const codigo of CODIGOS_DE_IDIOMA) {
      const idioma = IDIOMAS[codigo];
      expect(idioma.iso, codigo).toMatch(/^[a-z]{2}$/);
      expect(codigo.startsWith(idioma.iso), codigo).toBe(true);
      expect(idioma.nombreEnPrompt.length, codigo).toBeGreaterThan(0);
      expect(idioma.etiqueta.length, codigo).toBeGreaterThan(0);
      expect(idioma.saludo, codigo).toContain("{negocio}");
      expect(idioma.transcripcion.soniox, codigo).toBe(idioma.iso);
    }
  });

  it("cada idioma que puede ser principal tiene voces de los dos géneros que lo hablan, sin repetir", () => {
    for (const codigo of CODIGOS_DE_IDIOMA.filter(puedeSerPrincipal)) {
      const voces = IDIOMAS[codigo].voces!;
      for (const genero of GENEROS_DE_VOZ) {
        expect(
          voces.some((voz) => voz.genero === genero),
          `${codigo}/${genero}`
        ).toBe(true);
      }
      for (const voz of voces) {
        expect(voz.id.startsWith(PREFIJO[voz.proveedor]), voz.id).toBe(true);
        expect(hablaIdioma(voz, codigo), `${codigo}: ${voz.nombre}`).toBe(true);
        expect(esVozDelCatalogo(voz.id), voz.id).toBe(true);
      }
      expect(new Set(voces.map((voz) => voz.id)).size, codigo).toBe(
        voces.length
      );
      // Sin refuerzo, una voz de MiniMax lee el catalán como castellano.
      if (voces.some((voz) => voz.proveedor === "minimax")) {
        expect(IDIOMAS[codigo].refuerzoDeMiniMax, codigo).toBeDefined();
      }
    }
    expect(esVozDelCatalogo("Telnyx.Ultra.inventada")).toBe(false);
  });

  it("en cada mercado, toda voz habla el obligatorio y cada principal tiene, de cada género, una voz que habla todo lo ofrecido", () => {
    for (const [nombre, mercado] of Object.entries(MERCADOS)) {
      expect(mercado.principales, nombre).toContain(mercado.obligatorio);
      for (const principal of mercado.principales) {
        expect(puedeSerPrincipal(principal), `${nombre}/${principal}`).toBe(
          true
        );
        // El obligatorio está siempre activo: una voz que no lo hable no
        // podría atender nunca.
        for (const voz of IDIOMAS[principal].voces!) {
          expect(
            hablaIdioma(voz, mercado.obligatorio),
            `${nombre}/${principal}: ${voz.nombre}`
          ).toBe(true);
        }
        // Active lo que active el dueño, hay voz de su género.
        for (const genero of GENEROS_DE_VOZ) {
          expect(
            IDIOMAS[principal].voces!.some(
              (voz) =>
                voz.genero === genero &&
                mercado.secundarios.every((secundario) =>
                  hablaIdioma(voz, secundario)
                )
            ),
            `${nombre}: ${principal}/${genero}`
          ).toBe(true);
        }
        for (const secundario of mercado.secundarios) {
          expect(
            vozHabla(principal, secundario),
            `${nombre}: ${principal} con ${secundario}`
          ).toBe(true);
        }
      }
    }
  });

  it("España: español con voces Ultra; catalán, euskera y gallego sin flux y con Marta y Sergio de Soniox por defecto", () => {
    expect(
      IDIOMAS["es-ES"].voces!.every((voz) => voz.proveedor === "telnyx")
    ).toBe(true);
    for (const codigo of ["ca-ES", "eu-ES", "gl-ES"] as const) {
      expect(
        IDIOMAS[codigo].voces!.slice(0, 2).map((voz) => voz.id),
        codigo
      ).toEqual(["Soniox.tts-rt-v2.Marta", "Soniox.tts-rt-v2.Sergio"]);
      expect(IDIOMAS[codigo].transcripcion.flux, codigo).toBeNull();
    }
    expect(MERCADOS.ES.secundarios).toEqual([
      "en-GB",
      "fr-FR",
      "de-DE",
      "it-IT",
      "pt-PT",
      "nl-NL",
    ]);
  });

  it("los saludos y los nombres de los idiomas de siempre siguen byte a byte", () => {
    expect(componerSaludo("es-ES", "Peluquería Ana")).toBe(
      "Hola, gracias por llamar a Peluquería Ana. ¿En qué te puedo ayudar?"
    );
    expect(componerSaludo("ca-ES", "Perruqueria Anna")).toBe(
      "Hola, gràcies per trucar a Perruqueria Anna. En què et puc ajudar?"
    );
    expect(componerSaludo("eu-ES", "Ana ile-apaindegia")).toBe(
      "Kaixo, Ana ile-apaindegia. Zertan lagun zaitzaket?"
    );
    expect(componerSaludo("gl-ES", "Perruquería Ana")).toBe(
      "Ola, grazas por chamar a Perruquería Ana. En que te podo axudar?"
    );
    expect(
      CODIGOS_DE_IDIOMA.slice(0, 6).map(
        (codigo) => IDIOMAS[codigo].nombreEnPrompt
      )
    ).toEqual([
      "español de España",
      "inglés",
      "francés",
      "catalán",
      "euskera",
      "gallego",
    ]);
  });
});
