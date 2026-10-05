import { describe, it, expect } from "vitest";
import {
  ajustesParaRetell,
  elegirVoz,
  idiomaDeRetell,
  resolverIdiomas,
  saludoDelNegocio,
  usaVozMultilingueEnRetell,
} from "../../../src/lib/idiomas/resolver.js";
import {
  CODIGOS_DE_IDIOMA,
  type CodigoDeIdioma,
  type GeneroDeVoz,
  type VozDelCatalogo,
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
    expect(catalan.isoDeLaVoz).toBe("ca");
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
  // Hasta el 2026-10-05 la cooficial pasaba a ser el principal; ahora el
  // dueño elige si saluda en ella o en castellano.
  it("un cooficial activo con saludo en español: sigue saludando en español y atiende la voz de Soniox en catalán", () => {
    const perfil = resolver(["es-ES", "ca-ES"], "es-ES");
    expect(perfil.principal).toBe("es-ES");
    expect(perfil.cooficial).toBe("ca-ES");
    expect(perfil.voz).toMatchObject({ proveedor: "soniox", nombre: "Marta" });
    expect(perfil.isoDeLaVoz).toBe("ca");
    expect(perfil.transcripcion).toEqual({
      motor: "soniox",
      pistas: ["es", "ca"],
    });
    expect(perfil.cambios).toEqual([]);
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

  it("con el catálogo actual ningún idioma activo se queda sin voz, sea cual sea la combinación (solo se quitan las cooficiales que sobran)", () => {
    const resto = CODIGOS_DE_IDIOMA.filter((codigo) => codigo !== "es-ES");
    for (let mascara = 0; mascara < 2 ** resto.length; mascara++) {
      const activos: CodigoDeIdioma[] = [
        "es-ES",
        ...resto.filter((_, indice) => mascara & (2 ** indice)),
      ];
      const cooficiales = activos.filter((codigo) =>
        ["ca-ES", "eu-ES", "gl-ES"].includes(codigo)
      );
      for (const principal of activos) {
        for (const genero of ["femenina", "masculina"] as const) {
          const perfil = resolver(activos, principal, genero);
          const quitados = perfil.cambios.filter(
            (cambio) => cambio.tipo === "quitado"
          );
          expect(
            quitados.every(
              (cambio) =>
                cambio.tipo === "quitado" && cambio.motivo === "otraCooficial"
            ),
            `${activos.join("+")} con ${principal}`
          ).toBe(true);
          expect(quitados.length, `${activos.join("+")} con ${principal}`).toBe(
            Math.max(cooficiales.length - 1, 0)
          );
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

  it("atiende la elegida si es de su idioma principal y habla sus idiomas; su género manda", () => {
    const perfil = elegir(
      ["es-ES", "ca-ES", "en-GB"],
      "ca-ES",
      "Soniox.tts-rt-v2.Sergio",
      "femenina"
    );
    expect(perfil.voz.nombre).toBe("Sergio");
    expect(perfil.genero).toBe("masculina");
    expect(perfil.cambios).toEqual([]);
  });

  it("una elegida de otro idioma (cambió de principal) o retirada del catálogo se ignora sin aviso", () => {
    for (const voz of ["Soniox.tts-rt-v2.Sergio", "Azure.ca-ES-JoanaNeural"]) {
      const perfil = elegir(["es-ES"], "es-ES", voz);
      expect(perfil.voz.nombre).toBe("Blanca");
      expect(perfil.cambios).toEqual([]);
    }
  });
});

describe("elegirVoz, con voces que el catálogo aún no tiene", () => {
  const voz = (
    nombre: string,
    genero: GeneroDeVoz,
    habla: VozDelCatalogo["habla"]
  ): VozDelCatalogo => ({
    id: `Telnyx.Ultra.${nombre}`,
    proveedor: "telnyx",
    nombre,
    genero,
    descripcion: "De prueba",
    recomendada: false,
    habla,
  });
  // Como serán la Ultra en catalán (solo catalán y castellano) y Marta.
  const SOLO_CA = voz("Restringida", "femenina", ["ca-ES", "es-ES"]);
  const TODAS = voz("Todoterreno", "femenina", "todos");
  const OTRA = voz("Otra", "femenina", "todos");
  const EL = voz("Masculina", "masculina", "todos");
  const VOCES = [TODAS, SOLO_CA, OTRA, EL];

  it("si la elegida no habla un idioma activo, atiende la primera de su género que los habla, con aviso", () => {
    const { voz: atiende, cambio } = elegirVoz(
      VOCES,
      ["es-ES", "ca-ES", "en-GB"],
      "masculina",
      SOLO_CA.id
    );
    expect(atiende).toBe(TODAS);
    expect(cambio).toEqual({
      tipo: "voz",
      de: SOLO_CA,
      a: TODAS,
      noHabla: "en-GB",
    });
  });

  it("si la habla, atiende ella sin aviso", () => {
    expect(
      elegirVoz(VOCES, ["es-ES", "ca-ES"], "masculina", SOLO_CA.id)
    ).toMatchObject({ voz: SOLO_CA, cambio: null });
  });

  it("las alternativas son las demás del mismo género que hablan sus idiomas", () => {
    expect(
      elegirVoz(VOCES, ["es-ES", "ca-ES", "en-GB"], "femenina", OTRA.id)
        .alternativas
    ).toEqual([TODAS]);
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

  // Hasta el 2026-10-05 solo el catalán; ahora también cualquier cooficial
  // y un saludo que no es español (las Cartesia por defecto son españolas).
  it("la cadena de voces multilingüe va con catalán, con una cooficial o con un saludo que no es español", () => {
    expect(usaVozMultilingueEnRetell(["es-ES", "ca-ES"])).toBe(true);
    expect(usaVozMultilingueEnRetell(["es-ES", "en-GB", "gl-ES"])).toBe(true);
    expect(usaVozMultilingueEnRetell(["es-ES", "en-GB"])).toBe(false);
    expect(usaVozMultilingueEnRetell(["es-ES", "en-GB"], "en-GB")).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Idiomas y voces del 2026-10-05: el saludo, la familia de voces y la
// transcripción van por separado.
// ---------------------------------------------------------------------

const BLANCA = "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6";
const MARCOS = "Telnyx.Ultra.13ff5deb-2591-42ad-a356-63a04e524411";
const LARA = "Telnyx.Ultra.85b356c1-c638-404d-b986-f54a53d957d6";
const ALINA = "Telnyx.Ultra.38aabb6a-f52b-4fb0-a3d1-988518f4dc06";
const LUKAS = "Telnyx.Ultra.e00dd3df-19e7-4cd4-827a-7ff6687b6954";

describe("resolverIdiomas — saludo y lengua cooficial", () => {
  it("como mucho una cooficial: se queda la del saludo", () => {
    const perfil = resolver(["es-ES", "ca-ES", "eu-ES", "gl-ES"], "gl-ES");
    expect(perfil.idiomas).toEqual(["es-ES", "gl-ES"]);
    expect(perfil.principal).toBe("gl-ES");
    expect(perfil.cambios).toEqual([
      { tipo: "quitado", idioma: "ca-ES", motivo: "otraCooficial" },
      { tipo: "quitado", idioma: "eu-ES", motivo: "otraCooficial" },
    ]);
  });

  it("como mucho una cooficial: con saludo en español, la primera en orden canónico", () => {
    const perfil = resolver(["es-ES", "en-GB", "gl-ES", "eu-ES"], "es-ES");
    expect(perfil.idiomas).toEqual(["es-ES", "en-GB", "eu-ES"]);
    expect(perfil.principal).toBe("es-ES");
    expect(perfil.isoDeLaVoz).toBe("eu");
    expect(perfil.cambios).toEqual([
      { tipo: "quitado", idioma: "gl-ES", motivo: "otraCooficial" },
    ]);
  });

  it("con una cooficial activa, un saludo extranjero pasa a la cooficial", () => {
    const perfil = resolver(["es-ES", "en-GB", "ca-ES"], "en-GB");
    expect(perfil.principal).toBe("ca-ES");
    expect(perfil.idiomas).toEqual(["es-ES", "en-GB", "ca-ES"]);
    expect(perfil.cambios).toEqual([
      { tipo: "principal", de: "en-GB", a: "ca-ES" },
    ]);
  });

  it("saludo extranjero sin cooficial: las Ultra nativas de su idioma y flux", () => {
    const perfil = resolver(["es-ES", "de-DE"], "de-DE");
    expect(perfil.principal).toBe("de-DE");
    expect(perfil.cooficial).toBeNull();
    expect(perfil.familia).toBe("ultra");
    expect(perfil.voz.id).toBe(ALINA);
    expect(resolver(["es-ES", "de-DE"], "de-DE", "masculina").voz.id).toBe(
      LUKAS
    );
    expect(perfil.transcripcion).toEqual({ motor: "flux", idioma: "multi" });
    expect(perfil.cambios).toEqual([]);
    expect(saludoDelNegocio(perfil, "Salon Anna")).toBe(
      "Hallo, vielen Dank für Ihren Anruf bei Salon Anna. Wie kann ich Ihnen helfen?"
    );
  });

  it("un saludo que no está activo vuelve al español, sin aviso que dar", () => {
    const perfil = resolver(["es-ES"], "fr-FR");
    expect(perfil.principal).toBe("es-ES");
    expect(perfil.cambios).toEqual([
      { tipo: "principal", de: "fr-FR", a: "es-ES" },
    ]);
  });
});

describe("resolverIdiomas — las voces de la familia", () => {
  it("español: las 29 Ultra de España, con Blanca y Marcos primeras de su género", () => {
    const perfil = resolver(["es-ES", "en-GB"]);
    expect(perfil.familia).toBe("ultra");
    expect(perfil.voces).toHaveLength(29);
    expect(perfil.voces.every((voz) => voz.proveedor === "telnyx")).toBe(true);
    expect(perfil.voces[0].id).toBe(BLANCA);
    expect(perfil.voces.find((voz) => voz.genero === "masculina")?.id).toBe(
      MARCOS
    );
  });

  it("con una cooficial activa, solo Marta y Sergio, salude en ella o en español", () => {
    for (const saludo of ["es-ES", "eu-ES"] as const) {
      const perfil = resolver(["es-ES", "eu-ES", "fr-FR"], saludo);
      expect(perfil.familia, saludo).toBe("soniox");
      expect(
        perfil.voces.map((voz) => voz.nombre),
        saludo
      ).toEqual(["Marta", "Sergio"]);
      expect(perfil.isoDeLaVoz, saludo).toBe("eu");
    }
  });

  it("las alternativas son las demás de la familia y del género de la que atiende", () => {
    const perfil = resolver(["es-ES"], "es-ES", "masculina");
    expect(perfil.alternativas).toHaveLength(10);
    expect(perfil.alternativas.every((voz) => voz.genero === "masculina")).toBe(
      true
    );
    expect(perfil.alternativas.map((voz) => voz.id)).not.toContain(MARCOS);
  });
});

describe("resolverIdiomas — la voz elegida entre las de la familia", () => {
  const elegir = (
    languages: CodigoDeIdioma[],
    voiceLanguage: CodigoDeIdioma,
    voz: string,
    voiceGender: GeneroDeVoz = "femenina"
  ) => resolverIdiomas({ languages, voiceLanguage, voiceGender, voz });

  it("en español, una que no es la de por defecto atiende si se elige", () => {
    const perfil = elegir(["es-ES", "it-IT"], "es-ES", LARA);
    expect(perfil.voz.id).toBe(LARA);
    expect(perfil.voz.nombre).toBe("Lara");
    expect(perfil.cambios).toEqual([]);
  });

  it("Blanca y Marcos elegidos atienden igual que sin elegir", () => {
    expect(elegir(["es-ES"], "es-ES", BLANCA).voz).toBe(
      resolver(["es-ES"]).voz
    );
    expect(elegir(["es-ES"], "es-ES", MARCOS, "masculina").voz).toBe(
      resolver(["es-ES"], "es-ES", "masculina").voz
    );
  });

  it("una elegida de otra familia no vale: atiende la primera de su género, sin aviso", () => {
    // Lara es de las de España: con saludo en alemán atiende Alina.
    expect(elegir(["es-ES", "de-DE"], "de-DE", LARA).voz.id).toBe(ALINA);
    // Al activar el catalán atienden las de Soniox, con el género guardado.
    const conCatalan = elegir(["es-ES", "ca-ES"], "es-ES", MARCOS, "masculina");
    expect(conCatalan.voz.nombre).toBe("Sergio");
    expect(conCatalan.cambios).toEqual([]);
    // Y la Marta de Soniox no vale para un negocio solo en español.
    expect(elegir(["es-ES"], "es-ES", "Soniox.tts-rt-v2.Marta").voz.id).toBe(
      BLANCA
    );
  });
});

describe("resolverIdiomas — el prompt con saludo en español y una cooficial", () => {
  it("saluda en español, lista los idiomas y lleva la nota valenciana y balear", () => {
    expect(resolver(["es-ES", "ca-ES"], "es-ES").instruccionDelPrompt).toBe(
      "Empieza siempre con el saludo en español de España. Tras la primera intervención de quien llama, responde y continúa exclusivamente en el idioma que use si es uno de estos: español de España, catalán. Si cambia entre esos idiomas, acompaña el cambio sin pedirle que elija uno. Si quien llama usa formas valencianas o baleares del catalán, adáptate a ellas. No menciones que eres una IA salvo que te lo pregunten."
    );
  });
});

describe("Retell, el respaldo, con el saludo y la cooficial separados", () => {
  it("un saludo extranjero o en castellano con catalán se quedan como están", () => {
    expect(
      ajustesParaRetell({
        languages: ["es-ES", "de-DE"],
        voiceLanguage: "de-DE",
        voiceGender: "femenina",
      } as const)
    ).toMatchObject({ languages: ["es-ES", "de-DE"], voiceLanguage: "de-DE" });
    expect(
      ajustesParaRetell({
        languages: ["es-ES", "ca-ES"],
        voiceLanguage: "es-ES",
        voiceGender: "femenina",
      } as const)
    ).toMatchObject({ languages: ["es-ES", "ca-ES"], voiceLanguage: "es-ES" });
    expect(idiomaDeRetell(["es-ES", "de-DE"])).toEqual(["es-ES", "de-DE"]);
  });

  it("con euskera y saludo en castellano, Retell se queda en español con Cartesia", () => {
    const ajustes = ajustesParaRetell({
      languages: ["es-ES", "eu-ES"],
      voiceLanguage: "es-ES",
      voiceGender: "femenina",
    } as const);
    expect(ajustes.languages).toEqual(["es-ES"]);
    expect(
      usaVozMultilingueEnRetell(ajustes.languages, ajustes.voiceLanguage)
    ).toBe(false);
  });
});
