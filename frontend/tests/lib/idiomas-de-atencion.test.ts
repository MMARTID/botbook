import { describe, it, expect } from "vitest";
import { avisoDeIdiomas } from "@/lib/idiomas-de-atencion";

describe("avisoDeIdiomas", () => {
  it("sin catalán, euskera ni gallego no avisa de nada", () => {
    expect(
      avisoDeIdiomas({ languages: ["es-ES", "en-GB"], voiceLanguage: "en-GB" })
    ).toBeNull();
  });

  it("con español principal los entiende pero contesta en español", () => {
    expect(
      avisoDeIdiomas({ languages: ["es-ES", "ca-ES"], voiceLanguage: "es-ES" })
    ).toBe(
      "Entiende catalán, pero contesta en español. Para que lo hable, elígelo como idioma principal."
    );
    expect(
      avisoDeIdiomas({
        languages: ["es-ES", "ca-ES", "eu-ES", "gl-ES"],
        voiceLanguage: "es-ES",
      })
    ).toBe(
      "Entiende catalán, euskera y gallego, pero contesta en español. Para que hable uno de ellos, elígelo como idioma principal."
    );
  });

  it("como idioma principal avisa del saludo y de la voz", () => {
    expect(
      avisoDeIdiomas({ languages: ["es-ES", "eu-ES"], voiceLanguage: "eu-ES" })
    ).toBe(
      "Con euskera como idioma principal saluda en euskera y atiende con una voz que habla todos tus idiomas."
    );
  });
});
