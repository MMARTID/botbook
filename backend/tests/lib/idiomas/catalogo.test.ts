import { describe, it, expect } from "vitest";
import {
  CODIGOS_DE_IDIOMA,
  GENEROS_DE_VOZ,
  IDIOMAS,
  MERCADOS,
  componerSaludo,
  puedeSerPrincipal,
  vozHabla,
} from "../../../src/lib/idiomas/catalogo.js";

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

  it("cada idioma que puede ser principal tiene voz de los dos géneros, del proveedor que dice su id", () => {
    for (const codigo of CODIGOS_DE_IDIOMA.filter(puedeSerPrincipal)) {
      const voces = IDIOMAS[codigo].voces!;
      for (const genero of GENEROS_DE_VOZ) {
        const voz = voces[genero];
        const prefijo =
          voz.proveedor === "telnyx" ? "Telnyx.Ultra." : "Soniox.";
        expect(voz.id.startsWith(prefijo), `${codigo}/${genero}`).toBe(true);
      }
      // Los dos géneros hablan lo mismo: el género no cambia qué se ofrece.
      expect(voces.femenina.habla, codigo).toEqual(voces.masculina.habla);
      expect(vozHabla(codigo, codigo), codigo).toBe(true);
    }
  });

  it("en cada mercado, toda voz principal habla el obligatorio y los secundarios ofrecidos", () => {
    for (const [nombre, mercado] of Object.entries(MERCADOS)) {
      expect(mercado.principales, nombre).toContain(mercado.obligatorio);
      for (const principal of mercado.principales) {
        expect(puedeSerPrincipal(principal), `${nombre}/${principal}`).toBe(
          true
        );
        expect(
          vozHabla(principal, mercado.obligatorio),
          `${nombre}/${principal}`
        ).toBe(true);
        for (const secundario of mercado.secundarios) {
          expect(
            vozHabla(principal, secundario),
            `${nombre}: ${principal} con ${secundario}`
          ).toBe(true);
        }
      }
    }
  });

  it("España: español con voz Ultra; catalán, euskera y gallego con voz de Soniox", () => {
    expect(IDIOMAS["es-ES"].voces!.femenina.proveedor).toBe("telnyx");
    for (const codigo of ["ca-ES", "eu-ES", "gl-ES"] as const) {
      expect(IDIOMAS[codigo].voces!.femenina.proveedor, codigo).toBe("soniox");
      expect(IDIOMAS[codigo].transcripcion.flux, codigo).toBeNull();
    }
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
