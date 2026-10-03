import { describe, it, expect } from "vitest";
import {
  ajustesParaRetell,
  idiomaDeRetell,
  resolverIdiomas,
  saludoDelNegocio,
  usaVozMultilingueEnRetell,
} from "../../../src/lib/idiomas/resolver.js";
import {
  CODIGOS_DE_IDIOMA,
  type CodigoDeIdioma,
  type GeneroDeVoz,
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

  it("el alemán, el italiano, el portugués y el neerlandés los habla la voz Ultra y los entiende flux", () => {
    const perfil = resolver(["es-ES", "de-DE", "it-IT", "pt-PT", "nl-NL"]);
    expect(perfil.idiomas).toEqual([
      "es-ES",
      "de-DE",
      "it-IT",
      "pt-PT",
      "nl-NL",
    ]);
    expect(perfil.voz.nombre).toBe("Blanca");
    expect(perfil.transcripcion).toEqual({ motor: "flux", idioma: "multi" });
    expect(perfil.cambios).toEqual([]);
  });

  it("con el catálogo actual ningún idioma activo se queda sin voz, sea cual sea la combinación", () => {
    const resto = CODIGOS_DE_IDIOMA.filter((codigo) => codigo !== "es-ES");
    for (let mascara = 0; mascara < 2 ** resto.length; mascara++) {
      const activos: CodigoDeIdioma[] = [
        "es-ES",
        ...resto.filter((_, indice) => mascara & (2 ** indice)),
      ];
      for (const principal of activos) {
        for (const genero of ["femenina", "masculina"] as const) {
          const perfil = resolver(activos, principal, genero);
          expect(
            perfil.cambios.filter((cambio) => cambio.tipo === "quitado"),
            `${activos.join("+")} con ${principal}`
          ).toEqual([]);
          expect(perfil.genero, `${activos.join("+")}/${genero}`).toBe(genero);
        }
      }
    }
  });

  it("con la voz de Soniox el alemán sí se queda: Soniox habla todos", () => {
    expect(resolver(["es-ES", "de-DE", "ca-ES"], "ca-ES").idiomas).toEqual([
      "es-ES",
      "ca-ES",
      "de-DE",
    ]);
  });
});

describe("resolverIdiomas — la voz que elige el dueño", () => {
  const elegir = (
    languages: CodigoDeIdioma[],
    voiceLanguage: CodigoDeIdioma,
    voz: string,
    voiceGender: GeneroDeVoz = "femenina"
  ) => resolverIdiomas({ languages, voiceLanguage, voiceGender, voz });
  const JOANA = "Azure.ca-ES-JoanaNeural";
  const SERENA = "Minimax.speech-2.8-turbo.Spanish_SereneWoman";

  it("atiende la elegida si es de su idioma principal y habla sus idiomas; su género manda", () => {
    const perfil = elegir(
      ["es-ES", "ca-ES"],
      "ca-ES",
      "Azure.ca-ES-EnricNeural",
      "femenina"
    );
    expect(perfil.voz.nombre).toBe("Enric");
    expect(perfil.genero).toBe("masculina");
    expect(perfil.cambios).toEqual([]);
  });

  it("si la elegida no habla un idioma activo, atiende la primera de su género que los habla, con aviso", () => {
    const perfil = elegir(["es-ES", "ca-ES", "en-GB"], "ca-ES", JOANA);
    expect(perfil.voz.nombre).toBe("Marta");
    expect(perfil.cambios).toEqual([
      expect.objectContaining({ tipo: "voz", noHabla: "en-GB" }),
    ]);
  });

  it("una elegida de otro idioma (cambió de principal) se ignora sin aviso", () => {
    const perfil = elegir(["es-ES"], "es-ES", JOANA);
    expect(perfil.voz.nombre).toBe("Blanca");
    expect(perfil.cambios).toEqual([]);
  });

  it("las alternativas son las demás del mismo género que hablan sus idiomas", () => {
    expect(
      elegir(["es-ES", "ca-ES"], "ca-ES", SERENA).alternativas.map(
        (voz) => voz.nombre
      )
    ).toEqual(["Marta", "Joana", "Alba", "Clara"]);
  });

  it("MiniMax recibe el refuerzo del catalán", () => {
    expect(elegir(["es-ES", "ca-ES"], "ca-ES", SERENA).refuerzoDeMiniMax).toBe(
      "Catalan"
    );
    expect(resolver(["es-ES"]).refuerzoDeMiniMax).toBeNull();
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
