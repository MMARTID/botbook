import { describe, it, expect } from "vitest";
import {
  ajustesParaRetell,
  elegirVoz,
  idiomaDeRetell,
  instruccionesDeIdioma,
  resolverIdiomas,
  saludoDelNegocio,
  usaVozMultilingueEnRetell,
} from "../../../src/lib/idiomas/resolver.js";
import {
  CODIGOS_DE_IDIOMA,
  GENEROS_DE_VOZ,
  ULTRA_HABLA,
  idiomasQueHabla,
  puedeSerPrincipal,
  type CodigoDeIdioma,
  type GeneroDeVoz,
  type VozDelCatalogo,
} from "../../../src/lib/idiomas/catalogo.js";

const resolver = (
  languages: CodigoDeIdioma[],
  voiceLanguage: CodigoDeIdioma = "es-ES",
  voiceGender: GeneroDeVoz = "femenina"
) => resolverIdiomas({ languages, voiceLanguage, voiceGender });

// Desde el 2026-10-05 el dueño solo elige el principal: la recepcionista
// habla los siete de ULTRA_HABLA y, con un principal cooficial, también él.
describe("resolverIdiomas — voz y transcripción", () => {
  it("principal español: Blanca o Marcos (Ultra), habla los siete y flux en modo multi", () => {
    const femenina = resolver(["es-ES"]);
    expect(femenina.voz.id).toBe(
      "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6"
    );
    expect(femenina.idiomas).toEqual([...ULTRA_HABLA]);
    expect(femenina.transcripcion).toEqual({ motor: "flux", idioma: "multi" });
    expect(resolver(["es-ES"], "es-ES", "masculina").voz.nombre).toBe("Marcos");
  });

  it("con cualquier principal Ultra habla los siete, en orden canónico, y flux los entiende", () => {
    for (const principal of ULTRA_HABLA) {
      const perfil = resolver([], principal);
      expect(perfil.principal, principal).toBe(principal);
      expect(perfil.idiomas, principal).toEqual([
        "es-ES",
        "en-GB",
        "fr-FR",
        "de-DE",
        "it-IT",
        "pt-PT",
        "nl-NL",
      ]);
      expect(perfil.familia, principal).toBe("ultra");
      expect(perfil.transcripcion, principal).toEqual({
        motor: "flux",
        idioma: "multi",
      });
    }
  });

  // Con las pistas de los ocho, el error de palabra se duplicó (tandas A3 y
  // A4 del laboratorio, 2026-10-05): Soniox lleva la del principal y la del
  // español.
  it("catalán, euskera o gallego como principal: habla ocho, voz de Soniox en esa lengua y Soniox con dos pistas, la suya y la del español", () => {
    const catalan = resolver([], "ca-ES");
    expect(catalan.voz).toMatchObject({ proveedor: "soniox", nombre: "Marta" });
    expect(catalan.isoDeLaVoz).toBe("ca");
    expect(catalan.idiomas).toEqual([
      "es-ES",
      "en-GB",
      "fr-FR",
      "ca-ES",
      "de-DE",
      "it-IT",
      "pt-PT",
      "nl-NL",
    ]);
    expect(catalan.transcripcion).toEqual({
      motor: "soniox",
      pistas: ["es", "ca"],
    });
    const gallego = resolver([], "gl-ES", "masculina");
    expect(gallego.voz.nombre).toBe("Sergio");
    expect(gallego.isoDeLaVoz).toBe("gl");
    expect(gallego.transcripcion).toEqual({
      motor: "soniox",
      pistas: ["es", "gl"],
    });
  });
});

describe("resolverIdiomas — normalización", () => {
  // Las reglas anteriores dejaban saludar en castellano con catalán activo;
  // un JSON que quede así atiende en la cooficial, como hacía (la migración
  // 20261005150000_saludo_en_la_cooficial lo arregla en la base de datos).
  it("ajustes anteriores con una cooficial en languages y principal español: la cooficial pasa a ser el principal", () => {
    const perfil = resolver(["es-ES", "ca-ES"], "es-ES");
    expect(perfil.principal).toBe("ca-ES");
    expect(perfil.cooficial).toBe("ca-ES");
    expect(perfil.voz).toMatchObject({ proveedor: "soniox", nombre: "Marta" });
    expect(perfil.isoDeLaVoz).toBe("ca");
    expect(perfil.idiomas).toEqual(idiomasQueHabla("ca-ES"));
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

  it("los languages recibidos no cuentan: con principal español habla los siete aunque lleguen otros", () => {
    const perfil = resolver(["es-ES", "de-DE", "it-IT"]);
    expect(perfil.idiomas).toEqual([...ULTRA_HABLA]);
    expect(perfil.voz.nombre).toBe("Blanca");
    expect(perfil.cambios).toEqual([]);
  });

  it("con cualquier principal y género atiende una voz de ese género que habla todos sus idiomas, sin cambios", () => {
    for (const principal of CODIGOS_DE_IDIOMA.filter(puedeSerPrincipal)) {
      for (const genero of GENEROS_DE_VOZ) {
        const perfil = resolver([], principal, genero);
        expect(perfil.principal, principal).toBe(principal);
        expect(perfil.genero, `${principal}/${genero}`).toBe(genero);
        expect(perfil.voces, `${principal}/${genero}`).toContain(perfil.voz);
        expect(perfil.cambios, `${principal}/${genero}`).toEqual([]);
      }
    }
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
  it("con principal español, saluda en español y sigue en cualquiera de los siete", () => {
    expect(resolver(["es-ES"]).instruccionDelPrompt).toBe(
      "Empieza siempre con el saludo en español de España. Tras la primera intervención de quien llama, responde y continúa exclusivamente en el idioma que use si es uno de estos: español de España, inglés, francés, alemán, italiano, portugués, neerlandés. Si cambia entre esos idiomas, acompaña el cambio sin pedirle que elija uno. Las frases que estas instrucciones ponen entre comillas para decírselas a quien llama están en castellano: dilas traducidas al idioma de la conversación. No menciones que eres una IA salvo que te lo pregunten."
    );
    expect(resolver(["es-ES"]).recordatorioDelPrompt).toBe(
      "## Idioma\nContesta cada turno en el idioma en que te habla quien llama si es uno de estos: español de España, inglés, francés, alemán, italiano, portugués, neerlandés; también el resumen de la reserva, la pregunta del WhatsApp y la despedida. No cambies de idioma por tu cuenta mientras siga hablando en el suyo."
    );
  });

  it("con un solo idioma (lo que recibe Retell con principal español), «Habla siempre en…» y sin recordatorio", () => {
    expect(instruccionesDeIdioma(["es-ES"], "es-ES")).toEqual({
      instruccion:
        "Habla siempre en español de España; no menciones que eres una IA salvo que te lo pregunten.",
      recordatorio: null,
    });
  });

  it("con catalán, se adapta al valenciano y al balear", () => {
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

  it("con euskera de principal, Retell saluda en español y atiende solo español, con Cartesia", () => {
    const ajustes = ajustesParaRetell({
      languages: idiomasQueHabla("eu-ES"),
      voiceLanguage: "eu-ES",
      voiceGender: "femenina",
    });
    expect(ajustes).toMatchObject({
      languages: ["es-ES"],
      voiceLanguage: "es-ES",
    });
    expect(idiomaDeRetell(ajustes.languages)).toBe("es-ES");
    expect(
      usaVozMultilingueEnRetell(ajustes.languages, ajustes.voiceLanguage)
    ).toBe(false);
  });

  // Hasta el 2026-10-05 solo el catalán; ahora también cualquier cooficial
  // y un principal que no es español (las Cartesia por defecto son
  // españolas).
  it("la cadena de voces multilingüe va con catalán, con una cooficial o con un principal que no es español", () => {
    expect(usaVozMultilingueEnRetell(["es-ES", "ca-ES"])).toBe(true);
    expect(usaVozMultilingueEnRetell(["es-ES", "en-GB", "gl-ES"])).toBe(true);
    expect(usaVozMultilingueEnRetell(["es-ES", "en-GB"])).toBe(false);
    expect(usaVozMultilingueEnRetell(["es-ES", "en-GB"], "en-GB")).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Idiomas y voces del 2026-10-05: el principal manda (saludo, familia de
// voces e idiomas que habla).
// ---------------------------------------------------------------------

const BLANCA = "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6";
const MARCOS = "Telnyx.Ultra.13ff5deb-2591-42ad-a356-63a04e524411";
const LARA = "Telnyx.Ultra.85b356c1-c638-404d-b986-f54a53d957d6";
const ALINA = "Telnyx.Ultra.38aabb6a-f52b-4fb0-a3d1-988518f4dc06";
const LUKAS = "Telnyx.Ultra.e00dd3df-19e7-4cd4-827a-7ff6687b6954";

describe("resolverIdiomas — principal y lengua cooficial", () => {
  it("un principal cooficial manda aunque los languages lleven otras cooficiales: habla solo la suya", () => {
    const perfil = resolver(["es-ES", "ca-ES", "eu-ES", "gl-ES"], "gl-ES");
    expect(perfil.idiomas).toEqual(idiomasQueHabla("gl-ES"));
    expect(perfil.idiomas).not.toContain("ca-ES");
    expect(perfil.principal).toBe("gl-ES");
    expect(perfil.cambios).toEqual([]);
  });

  it("ajustes anteriores con varias cooficiales y principal español: la primera en orden canónico", () => {
    const perfil = resolver(["es-ES", "en-GB", "gl-ES", "eu-ES"], "es-ES");
    expect(perfil.principal).toBe("eu-ES");
    expect(perfil.isoDeLaVoz).toBe("eu");
    expect(perfil.idiomas).toEqual(idiomasQueHabla("eu-ES"));
    expect(perfil.cambios).toEqual([
      { tipo: "principal", de: "es-ES", a: "eu-ES" },
    ]);
  });

  it("ajustes anteriores con una cooficial y un principal extranjero: la cooficial", () => {
    const perfil = resolver(["es-ES", "en-GB", "ca-ES"], "en-GB");
    expect(perfil.principal).toBe("ca-ES");
    expect(perfil.idiomas).toEqual(idiomasQueHabla("ca-ES"));
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

  // Hasta el 2026-10-05 un saludo que no estaba entre los activos volvía
  // al español; ahora el principal manda.
  it("el principal manda aunque no esté en los languages recibidos", () => {
    const perfil = resolver(["es-ES"], "fr-FR");
    expect(perfil.principal).toBe("fr-FR");
    expect(perfil.idiomas).toContain("fr-FR");
    expect(perfil.voz.nombre).toBe("Léa");
    expect(perfil.cambios).toEqual([]);
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

  it("con un principal cooficial, solo Marta y Sergio, que arrancan en esa lengua", () => {
    for (const [principal, iso] of [
      ["ca-ES", "ca"],
      ["eu-ES", "eu"],
      ["gl-ES", "gl"],
    ] as const) {
      const perfil = resolver([], principal);
      expect(perfil.familia, principal).toBe("soniox");
      expect(
        perfil.voces.map((voz) => voz.nombre),
        principal
      ).toEqual(["Marta", "Sergio"]);
      expect(perfil.isoDeLaVoz, principal).toBe(iso);
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
    // Lara es de las de España: con principal alemán atiende Alina.
    expect(elegir(["es-ES", "de-DE"], "de-DE", LARA).voz.id).toBe(ALINA);
    // Con el catalán de principal atienden las de Soniox, con el género
    // guardado.
    const conCatalan = elegir([], "ca-ES", MARCOS, "masculina");
    expect(conCatalan.voz.nombre).toBe("Sergio");
    expect(conCatalan.cambios).toEqual([]);
    // Y la Marta de Soniox no vale para un negocio solo en español.
    expect(elegir(["es-ES"], "es-ES", "Soniox.tts-rt-v2.Marta").voz.id).toBe(
      BLANCA
    );
  });
});

describe("resolverIdiomas — el prompt con un principal cooficial", () => {
  it("saluda en catalán, lista los ocho y lleva la nota valenciana y balear", () => {
    expect(resolver([], "ca-ES").instruccionDelPrompt).toBe(
      "Empieza siempre con el saludo en catalán. Tras la primera intervención de quien llama, responde y continúa exclusivamente en el idioma que use si es uno de estos: español de España, inglés, francés, catalán, alemán, italiano, portugués, neerlandés. Si cambia entre esos idiomas, acompaña el cambio sin pedirle que elija uno. Las frases que estas instrucciones ponen entre comillas para decírselas a quien llama están en castellano: dilas traducidas al idioma de la conversación. Si quien llama usa formas valencianas o baleares del catalán, adáptate a ellas. No menciones que eres una IA salvo que te lo pregunten."
    );
  });
});

describe("Retell, el respaldo, con el principal que manda", () => {
  // Desde la revisión del 2026-10-05, Retell atiende el principal y el
  // español, no los siete u ocho que habla en Telnyx: lo ya validado contra
  // su API, y con solo español su ruta monolingüe.
  it("atiende el principal y el español: escalar es-ES con principal español, array con uno extranjero o cooficial", () => {
    const deRetell = (voiceLanguage: CodigoDeIdioma) =>
      ajustesParaRetell({
        languages: idiomasQueHabla(voiceLanguage),
        voiceLanguage,
        voiceGender: "femenina",
      });
    expect(deRetell("es-ES")).toMatchObject({
      languages: ["es-ES"],
      voiceLanguage: "es-ES",
    });
    expect(idiomaDeRetell(deRetell("es-ES").languages)).toBe("es-ES");
    expect(deRetell("de-DE")).toMatchObject({
      languages: ["es-ES", "de-DE"],
      voiceLanguage: "de-DE",
    });
    expect(deRetell("ca-ES")).toMatchObject({
      languages: ["es-ES", "ca-ES"],
      voiceLanguage: "ca-ES",
    });
    expect(idiomaDeRetell(deRetell("gl-ES").languages)).toEqual([
      "es-ES",
      "gl-ES",
    ]);
  });

  it("la voz Cartesia sigue con principal español; la multilingüe, con uno extranjero o cooficial", () => {
    for (const voiceLanguage of CODIGOS_DE_IDIOMA.filter(puedeSerPrincipal)) {
      const ajustes = ajustesParaRetell({
        languages: idiomasQueHabla(voiceLanguage),
        voiceLanguage,
        voiceGender: "femenina",
      });
      expect(
        usaVozMultilingueEnRetell(ajustes.languages, ajustes.voiceLanguage)
      ).toBe(voiceLanguage !== "es-ES" && voiceLanguage !== "eu-ES");
    }
  });

  it("unos ajustes anteriores con una cooficial en languages llegan a Retell con ella de principal", () => {
    expect(
      ajustesParaRetell({
        languages: ["es-ES", "ca-ES"],
        voiceLanguage: "es-ES",
        voiceGender: "femenina",
      })
    ).toMatchObject({ languages: ["es-ES", "ca-ES"], voiceLanguage: "ca-ES" });
  });
});
