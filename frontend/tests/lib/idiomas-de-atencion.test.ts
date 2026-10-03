import { describe, it, expect } from "vitest";
import {
  avisoDeIdiomas,
  entradillaDeIdiomas,
  normalizarIdiomas,
} from "@/lib/idiomas-de-atencion";

describe("normalizarIdiomas", () => {
  it("ordena como el backend y deja el principal entre los activos", () => {
    expect(normalizarIdiomas(["en-GB", "es-ES"], "fr-FR")).toEqual({
      languages: ["es-ES", "en-GB"],
      voiceLanguage: "es-ES",
    });
  });

  it("con catalán, euskera o gallego activos, el principal es uno de ellos", () => {
    expect(normalizarIdiomas(["es-ES", "en-GB", "gl-ES"], "en-GB")).toEqual({
      languages: ["es-ES", "en-GB", "gl-ES"],
      voiceLanguage: "gl-ES",
    });
    expect(normalizarIdiomas(["es-ES", "ca-ES", "eu-ES"], "eu-ES").voiceLanguage).toBe(
      "eu-ES"
    );
  });
});

describe("entradillaDeIdiomas", () => {
  it("dice en qué idioma saluda según el principal", () => {
    expect(entradillaDeIdiomas({ languages: ["es-ES"], voiceLanguage: "es-ES" })).toBe(
      "Atiende siempre en español."
    );
    expect(
      entradillaDeIdiomas({ languages: ["es-ES", "en-GB"], voiceLanguage: "en-GB" })
    ).toBe("Saluda en inglés y sigue en el idioma de quien llama.");
  });
});

describe("avisoDeIdiomas", () => {
  it("sin catalán, euskera ni gallego no avisa de nada", () => {
    expect(
      avisoDeIdiomas({ languages: ["es-ES", "en-GB"], voiceLanguage: "en-GB" })
    ).toBeNull();
  });

  it("con ellos avisa de que la voz es otra y menos expresiva", () => {
    expect(
      avisoDeIdiomas({ languages: ["es-ES", "ca-ES"], voiceLanguage: "ca-ES" })
    ).toBe(
      "Con catalán activo atiende con otra voz, que habla todos tus idiomas pero suena algo menos expresiva que la de siempre."
    );
    expect(
      avisoDeIdiomas({
        languages: ["es-ES", "ca-ES", "eu-ES", "gl-ES"],
        voiceLanguage: "eu-ES",
      })
    ).toMatch(/^Con catalán, euskera y gallego activos atiende con otra voz/);
  });
});
