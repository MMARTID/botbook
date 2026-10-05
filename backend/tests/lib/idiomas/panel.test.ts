import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  avisoDeCambio,
  catalogoParaElPanel,
  vistaPreviaDeIdiomas,
} from "../../../src/lib/idiomas/panel.js";
import type { VozDelCatalogo } from "../../../src/lib/idiomas/catalogo.js";

const PUBLICO_DE_LA_APP = fileURLToPath(
  new URL("../../../../frontend/public", import.meta.url)
);
const AVISO_SIN_FLUX =
  "En catalán la voz suena algo menos expresiva que en español y tarda algo más en contestar: entre medio segundo y un segundo más por respuesta.";

describe("catalogoParaElPanel", () => {
  it("España: saluda en español, catalán, euskera o gallego; otros idiomas, inglés, francés, alemán, italiano, portugués y neerlandés", () => {
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
      ["en-GB", "fr-FR", "de-DE", "it-IT", "pt-PT", "nl-NL"]
    );
    expect(catalogo.etiquetas["de-DE"]).toBe("Alemán");
  });

  it("da las voces de cada principal con qué hablan, si son expresivas y su muestra", () => {
    const [espanol, catalan] = catalogoParaElPanel().principales;
    const TODOS = ["en-GB", "fr-FR", "de-DE", "it-IT", "pt-PT", "nl-NL"];

    expect(espanol.secundariosCompatibles).toEqual(TODOS);
    expect(espanol.voces[0]).toEqual({
      id: "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6",
      nombre: "Blanca",
      genero: "femenina",
      habla: ["es-ES", "en-GB", "fr-FR", "de-DE", "it-IT", "pt-PT", "nl-NL"],
      expresiva: true,
      muestra: "/voces/es/blanca.mp3",
    });
    expect(catalan.secundariosCompatibles).toEqual(TODOS);
    expect(catalan.voces.map((voz) => voz.nombre)).toEqual(["Marta", "Sergio"]);
    expect(catalan.voces[0]).toMatchObject({
      habla: "todos",
      expresiva: false,
      muestra: "/voces/ca/marta.mp3",
    });
    expect(catalan.voces[1].muestra).toBe("/voces/ca/sergio.mp3");
  });

  it("cada voz que se ofrece tiene su muestra en la app, sin compartir fichero", () => {
    for (const principal of catalogoParaElPanel().principales) {
      const muestras = principal.voces.map((voz) => voz.muestra);
      expect(new Set(muestras).size, principal.codigo).toBe(muestras.length);
      for (const muestra of muestras) {
        expect(existsSync(PUBLICO_DE_LA_APP + muestra), muestra).toBe(true);
      }
    }
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
      voz: "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6",
      voiceGender: "femenina",
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
      AVISO_SIN_FLUX,
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

describe("avisoDeCambio", () => {
  const voz = (nombre: string): VozDelCatalogo => ({
    id: `Telnyx.Ultra.${nombre}`,
    proveedor: "telnyx",
    nombre,
    genero: "femenina",
    habla: ["ca-ES", "es-ES"],
  });

  it("una voz elegida que no habla un idioma activo: avisa de cuál atenderá", () => {
    expect(
      avisoDeCambio(
        { tipo: "voz", de: voz("Blanca"), a: voz("Marta"), noHabla: "en-GB" },
        "es-ES"
      )
    ).toBe("Blanca no habla inglés: atenderá Marta.");
  });

  it("volver al obligatorio como principal no necesita aviso", () => {
    expect(
      avisoDeCambio({ tipo: "principal", de: "en-GB", a: "es-ES" }, "es-ES")
    ).toBeNull();
  });
});
