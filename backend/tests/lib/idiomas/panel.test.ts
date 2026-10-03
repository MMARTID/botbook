import { describe, it, expect } from "vitest";
import {
  catalogoParaElPanel,
  vistaPreviaDeIdiomas,
} from "../../../src/lib/idiomas/panel.js";

describe("catalogoParaElPanel", () => {
  it("España: saluda en español, catalán, euskera o gallego; otros idiomas, inglés y francés", () => {
    const catalogo = catalogoParaElPanel();

    expect(catalogo.obligatorio).toEqual({
      codigo: "es-ES",
      etiqueta: "Español",
    });
    expect(catalogo.principales.map((principal) => principal.codigo)).toEqual([
      "es-ES",
      "ca-ES",
      "eu-ES",
      "gl-ES",
    ]);
    expect(catalogo.secundarios.map((secundario) => secundario.codigo)).toEqual(
      ["en-GB", "fr-FR"]
    );
    expect(catalogo.etiquetas["de-DE"]).toBe("Alemán");
  });

  it("dice qué otros idiomas habla cada voz principal y cuál es la multilingüe", () => {
    const [espanol, catalan] = catalogoParaElPanel().principales;

    expect(espanol).toMatchObject({
      secundariosCompatibles: ["en-GB", "fr-FR"],
      vozMultilingue: false,
    });
    expect(catalan).toMatchObject({
      secundariosCompatibles: ["en-GB", "fr-FR"],
      vozMultilingue: true,
    });
  });
});

describe("vistaPreviaDeIdiomas", () => {
  it("solo español: atiende en español y saluda con el nombre del negocio", () => {
    expect(
      vistaPreviaDeIdiomas(
        {
          languages: ["es-ES"],
          voiceLanguage: "es-ES",
          voiceGender: "femenina",
        },
        "Peluquería Ana"
      )
    ).toEqual({
      languages: ["es-ES"],
      voiceLanguage: "es-ES",
      entradilla: "Atiende siempre en español.",
      saludo:
        "Hola, gracias por llamar a Peluquería Ana. ¿En qué te puedo ayudar?",
      avisos: [],
    });
  });

  it("catalán activo con español principal: lo hace principal y avisa de la voz", () => {
    const vista = vistaPreviaDeIdiomas(
      {
        languages: ["es-ES", "ca-ES"],
        voiceLanguage: "es-ES",
        voiceGender: "femenina",
      },
      "Perruqueria Anna"
    );

    expect(vista).toMatchObject({
      languages: ["es-ES", "ca-ES"],
      voiceLanguage: "ca-ES",
      entradilla: "Saluda en catalán y sigue en el idioma de quien llama.",
      saludo:
        "Hola, gràcies per trucar a Perruqueria Anna. En què et puc ajudar?",
    });
    expect(vista.avisos).toEqual([
      "Con el catalán activo, el catalán pasa a ser el idioma principal: la voz que habla español no lo pronuncia.",
      "Con el catalán como idioma principal atiende con otra voz, que habla todos tus idiomas pero suena algo menos expresiva y contesta unas décimas de segundo más tarde.",
    ]);
  });

  it("inglés como principal (legado): se mantiene y avisa de que ya no se ofrece", () => {
    const vista = vistaPreviaDeIdiomas(
      {
        languages: ["es-ES", "en-GB"],
        voiceLanguage: "en-GB",
        voiceGender: "masculina",
      },
      "Ana's Salon"
    );

    expect(vista.voiceLanguage).toBe("en-GB");
    expect(vista.avisos).toEqual([
      "El inglés como idioma principal ya no se ofrece: lo mantenemos, pero si lo cambias no podrás volver a elegirlo.",
    ]);
  });
});
