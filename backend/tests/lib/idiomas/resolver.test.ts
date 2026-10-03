import { describe, it, expect } from "vitest";
import {
  ajustesParaRetell,
  idiomaDeRetell,
  resolverIdiomas,
  saludoDelNegocio,
  usaVozMultilingueEnRetell,
} from "../../../src/lib/idiomas/resolver.js";
import type {
  CodigoDeIdioma,
  GeneroDeVoz,
} from "../../../src/lib/idiomas/catalogo.js";

const resolver = (
  languages: CodigoDeIdioma[],
  voiceLanguage: CodigoDeIdioma = "es-ES",
  voiceGender: GeneroDeVoz = "femenina"
) => resolverIdiomas({ languages, voiceLanguage, voiceGender });

describe("resolverIdiomas — voz y transcripción", () => {
  it("solo español: Blanca o Marcos (Ultra) y flux con su pista", () => {
    const femenina = resolver(["es-ES"]);
    expect(femenina.voz.id).toBe(
      "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6"
    );
    expect(femenina.transcripcion).toEqual({ motor: "flux", idioma: "es" });
    expect(resolver(["es-ES"], "es-ES", "masculina").voz.nombre).toBe("Marcos");
  });

  it("español con idiomas que flux entiende: sigue en flux, en modo multi", () => {
    expect(resolver(["es-ES", "en-GB", "fr-FR"]).transcripcion).toEqual({
      motor: "flux",
      idioma: "multi",
    });
  });

  it("catalán, euskera o gallego como principal: voz de Soniox y Soniox con las pistas de todos", () => {
    const catalan = resolver(["es-ES", "en-GB", "ca-ES"], "ca-ES");
    expect(catalan.voz).toMatchObject({ proveedor: "soniox", nombre: "Marta" });
    expect(catalan.isoDelPrincipal).toBe("ca");
    expect(catalan.transcripcion).toEqual({
      motor: "soniox",
      pistas: ["es", "en", "ca"],
    });
    expect(resolver(["es-ES", "gl-ES"], "gl-ES", "masculina").voz.nombre).toBe(
      "Sergio"
    );
  });
});

describe("resolverIdiomas — normalización", () => {
  it("un cooficial activo con español principal pasa a ser el principal (solo como principal)", () => {
    const perfil = resolver(["es-ES", "ca-ES"], "es-ES");
    expect(perfil.principal).toBe("ca-ES");
    expect(perfil.voz.proveedor).toBe("soniox");
    expect(perfil.cambios).toEqual([
      { tipo: "principal", de: "es-ES", a: "ca-ES" },
    ]);
  });

  it("inglés como principal (legado) se conserva con su voz Ultra", () => {
    const perfil = resolver(["es-ES", "en-GB"], "en-GB");
    expect(perfil.principal).toBe("en-GB");
    expect(perfil.voz.nombre).toBe("Lucy");
    expect(perfil.cambios).toEqual([]);
  });

  it("un idioma que la voz del principal aún no habla se quita, con aviso", () => {
    const perfil = resolver(["es-ES", "de-DE"]);
    expect(perfil.idiomas).toEqual(["es-ES"]);
    expect(perfil.cambios).toEqual([{ tipo: "quitado", idioma: "de-DE" }]);
  });

  it("con la voz de Soniox el alemán sí se queda: Soniox habla todos", () => {
    expect(resolver(["es-ES", "de-DE", "ca-ES"], "ca-ES").idiomas).toEqual([
      "es-ES",
      "ca-ES",
      "de-DE",
    ]);
  });
});

describe("resolverIdiomas — prompt y saludo", () => {
  it("los textos de siempre no cambian byte a byte", () => {
    expect(resolver(["es-ES"]).instruccionDelPrompt).toBe(
      "Habla siempre en español de España; no menciones que eres una IA salvo que te lo pregunten."
    );
    expect(resolver(["es-ES", "en-GB"]).instruccionDelPrompt).toBe(
      "Empieza siempre con el saludo en español de España. Tras la primera intervención de quien llama, responde y continúa exclusivamente en el idioma que use si es uno de estos: español de España, inglés. Si cambia entre esos idiomas, acompaña el cambio sin pedirle que elija uno. No menciones que eres una IA salvo que te lo pregunten."
    );
  });

  it("con catalán activo, se adapta al valenciano y al balear", () => {
    expect(
      resolver(["es-ES", "ca-ES"], "ca-ES").instruccionDelPrompt
    ).toContain(
      "Si quien llama usa formas valencianas o baleares del catalán, adáptate a ellas."
    );
  });

  it("saluda en el idioma principal", () => {
    expect(
      saludoDelNegocio(resolver(["es-ES", "gl-ES"], "gl-ES"), "Perruquería Ana")
    ).toBe("Ola, grazas por chamar a Perruquería Ana. En que te podo axudar?");
  });
});

describe("Retell, el respaldo", () => {
  it("no le llega el euskera, que rechazaría el agente entero", () => {
    expect(idiomaDeRetell(["es-ES", "eu-ES"])).toBe("es-ES");
    expect(idiomaDeRetell(["es-ES", "eu-ES", "gl-ES"])).toEqual([
      "es-ES",
      "gl-ES",
    ]);
  });

  it("con euskera de principal, Retell saluda y atiende en español", () => {
    const ajustes = ajustesParaRetell({
      languages: ["es-ES", "eu-ES"],
      voiceLanguage: "eu-ES",
      voiceGender: "femenina",
    } as const);
    expect(ajustes).toMatchObject({
      languages: ["es-ES"],
      voiceLanguage: "es-ES",
    });
  });

  it("solo el catalán exige la cadena de voces multilingüe", () => {
    expect(usaVozMultilingueEnRetell(["es-ES", "ca-ES"])).toBe(true);
    expect(usaVozMultilingueEnRetell(["es-ES", "en-GB", "gl-ES"])).toBe(false);
  });
});
