import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  avisoDeCambio,
  catalogoConCamposDelPanelAnterior,
  catalogoParaElPanel,
  entradillaDeIdiomas,
  rutaDeMuestra,
  vistaPreviaDeIdiomas,
} from "../../../src/lib/idiomas/panel.js";
import {
  idiomasQueHabla,
  type CodigoDeIdioma,
  type VozDelCatalogo,
} from "../../../src/lib/idiomas/catalogo.js";

const PUBLICO_DE_LA_APP = fileURLToPath(
  new URL("../../../../frontend/public", import.meta.url)
);
const AVISO_ESPERA_CATALAN =
  "Con el catalán como idioma principal, la recepcionista tarda algo más en contestar: entre 1,4 y 2 segundos por respuesta, frente a unos 0,9 con el español, también cuando le hablan en castellano.";
const AVISO_VOCES_CATALAN =
  "Atiende con Marta o Sergio, las voces que hablan catalán.";
// Con un principal de voces Ultra (revisión del 2026-10-05: flux no
// entiende las cooficiales y la voz no cambia a mitad de llamada).
const AVISO_SIN_COOFICIALES =
  "No entiende el catalán, el euskera ni el gallego: para atender en una de esas lenguas, elígela como idioma principal (planes Pro y Scale).";
const EXTRANJEROS = ["en-GB", "fr-FR", "de-DE", "it-IT", "pt-PT", "nl-NL"];
const HABLA_EN_ESPANOL =
  "Habla en 7 idiomas: español, inglés, francés, alemán, italiano, portugués y neerlandés. Saluda en español y sigue en el idioma de quien llama.";
const HABLA_EN_CATALAN =
  "Habla en 8 idiomas: catalán, español, inglés, francés, alemán, italiano, portugués y neerlandés. Saluda en catalán y sigue en el idioma de quien llama.";

describe("catalogoParaElPanel", () => {
  // Desde el 2026-10-05 el dueño solo elige el principal: español, catalán,
  // euskera, gallego o uno de los seis extranjeros.
  it("España: de principal, español, catalán, euskera, gallego o en otro idioma (inglés, francés, alemán, italiano, portugués y neerlandés)", () => {
    const catalogo = catalogoParaElPanel();

    expect(catalogo.obligatorio).toEqual({
      codigo: "es-ES",
      etiqueta: "Español",
    });
    expect(
      catalogo.principales.map((principal) => [
        principal.codigo,
        principal.tipo,
      ])
    ).toEqual([
      ["es-ES", "obligatorio"],
      ["ca-ES", "cooficial"],
      ["eu-ES", "cooficial"],
      ["gl-ES", "cooficial"],
      ["en-GB", "extranjero"],
      ["fr-FR", "extranjero"],
      ["de-DE", "extranjero"],
      ["it-IT", "extranjero"],
      ["pt-PT", "extranjero"],
      ["nl-NL", "extranjero"],
    ]);
    expect(Object.keys(catalogo).sort()).toEqual([
      "etiquetas",
      "obligatorio",
      "principales",
    ]);
    expect(catalogo.etiquetas["de-DE"]).toBe("Alemán");
  });

  it("cada principal dice en cuántos idiomas habla y cuáles se guardan al elegirlo", () => {
    const de = (codigo: string) =>
      catalogoParaElPanel().principales.find(
        (principal) => principal.codigo === codigo
      )!;

    expect(de("es-ES").idiomas).toEqual(idiomasQueHabla("es-ES"));
    expect(de("es-ES").entradilla).toBe(HABLA_EN_ESPANOL);
    expect(de("ca-ES").idiomas).toEqual(idiomasQueHabla("ca-ES"));
    expect(de("ca-ES").entradilla).toBe(HABLA_EN_CATALAN);
    expect(de("de-DE").entradilla).toBe(
      "Habla en 7 idiomas: alemán, español, inglés, francés, italiano, portugués y neerlandés. Saluda en alemán y sigue en el idioma de quien llama."
    );
  });

  it("catalán, euskera y gallego exigen las lenguas locales (Pro y Scale); los demás, ningún plan", () => {
    for (const principal of catalogoParaElPanel().principales) {
      expect(principal.requiere, principal.codigo).toEqual(
        principal.tipo === "cooficial"
          ? { funcion: "lenguas_locales", texto: "Disponible en Pro y Scale" }
          : null
      );
    }
  });

  it("da las voces de cada saludo con su descripción, si son recomendadas, la de por defecto y su muestra", () => {
    const principales = catalogoParaElPanel().principales;
    const de = (codigo: string) =>
      principales.find((principal) => principal.codigo === codigo)!;
    const espanol = de("es-ES");
    const catalan = de("ca-ES");

    expect(espanol.familia).toBe("ultra");
    expect(espanol.voces).toHaveLength(29);
    expect(espanol.voces[0]).toEqual({
      id: "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6",
      nombre: "Blanca",
      genero: "femenina",
      descripcion: "Cálida y acogedora",
      recomendada: true,
      porDefecto: true,
      muestra: "/voces/es/538a8872-3799-4df5-b373-b78493b766c6.mp3",
    });
    expect(
      espanol.voces.filter((voz) => voz.porDefecto).map((voz) => voz.nombre)
    ).toEqual(["Blanca", "Marcos"]);
    expect(catalan.familia).toBe("soniox");
    expect(catalan.voces.map((voz) => voz.nombre)).toEqual(["Marta", "Sergio"]);
    expect(catalan.voces[0]).toMatchObject({
      porDefecto: true,
      recomendada: true,
      muestra: "/voces/ca/marta.mp3",
    });
    expect(catalan.voces[1].muestra).toBe("/voces/ca/sergio.mp3");
    expect(de("de-DE").voces[0]).toMatchObject({
      nombre: "Alina",
      porDefecto: true,
      muestra: "/voces/de/38aabb6a-f52b-4fb0-a3d1-988518f4dc06.mp3",
    });
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

// Revisión del 2026-10-05: la app anterior, abierta durante el despliegue,
// lanzaba al pintar con el catálogo nuevo (`voz.habla.includes`).
describe("catalogoConCamposDelPanelAnterior", () => {
  it("añade lo que leía el panel anterior y nada más", () => {
    const conAnteriores = catalogoConCamposDelPanelAnterior();
    const de = (codigo: string) =>
      conAnteriores.principales.find(
        (principal) => principal.codigo === codigo
      )!;

    expect(de("es-ES").secundariosCompatibles).toEqual(EXTRANJEROS);
    expect(de("ca-ES").secundariosCompatibles).toEqual(EXTRANJEROS);
    expect(de("en-GB").secundariosCompatibles).toEqual(
      EXTRANJEROS.filter((codigo) => codigo !== "en-GB")
    );
    expect(de("es-ES").voces[0]).toMatchObject({
      nombre: "Blanca",
      habla: [
        "es-ES",
        "en-GB",
        "fr-FR",
        "de-DE",
        "it-IT",
        "pt-PT",
        "nl-NL",
      ],
      expresiva: true,
    });
    expect(de("ca-ES").voces[0]).toMatchObject({
      nombre: "Marta",
      habla: "todos",
      expresiva: false,
    });
    for (const principal of conAnteriores.principales) {
      for (const voz of principal.voces) {
        expect(voz.habla === "todos" || Array.isArray(voz.habla)).toBe(true);
      }
    }

    // Por lo demás, el catálogo de siempre.
    const catalogo = catalogoParaElPanel();
    expect(conAnteriores).toEqual({
      ...catalogo,
      principales: catalogo.principales.map((principal) => ({
        ...principal,
        secundariosCompatibles: expect.any(Array),
        voces: principal.voces.map((voz) => ({
          ...voz,
          habla: expect.anything(),
          expresiva: expect.any(Boolean),
        })),
      })),
    });
  });
});

describe("vistaPreviaDeIdiomas", () => {
  it("principal español: habla los siete, lo dice y saluda con el nombre del negocio", () => {
    expect(
      vistaPreviaDeIdiomas(
        {
          voiceLanguage: "es-ES",
          voiceGender: "femenina",
        },
        "Peluquería Ana"
      )
    ).toEqual({
      languages: idiomasQueHabla("es-ES"),
      voiceLanguage: "es-ES",
      voz: "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6",
      voiceGender: "femenina",
      familia: "ultra",
      voces: expect.any(Array),
      entradilla: HABLA_EN_ESPANOL,
      saludo:
        "Hola, gracias por llamar a Peluquería Ana. ¿En qué te puedo ayudar?",
      avisos: [AVISO_SIN_COOFICIALES],
    });
  });

  it("con cualquier principal de voces Ultra avisa de que no entiende las cooficiales; con una cooficial, no", () => {
    for (const voiceLanguage of ["es-ES", ...EXTRANJEROS]) {
      expect(
        vistaPreviaDeIdiomas(
          {
            voiceLanguage: voiceLanguage as CodigoDeIdioma,
            voiceGender: "femenina",
          },
          "Peluquería Ana"
        ).avisos
      ).toContain(AVISO_SIN_COOFICIALES);
    }
    for (const voiceLanguage of ["ca-ES", "eu-ES", "gl-ES"] as const) {
      expect(
        vistaPreviaDeIdiomas(
          { voiceLanguage, voiceGender: "femenina" },
          "Peluquería Ana"
        ).avisos
      ).not.toContain(AVISO_SIN_COOFICIALES);
    }
  });

  it("catalán de principal: saluda en catalán, habla ocho, atienden Marta o Sergio y avisa de la espera", () => {
    const vista = vistaPreviaDeIdiomas(
      {
        languages: ["es-ES"],
        voiceLanguage: "ca-ES",
        voiceGender: "femenina",
      },
      "Perruqueria Anna"
    );

    expect(vista).toMatchObject({
      languages: idiomasQueHabla("ca-ES"),
      voiceLanguage: "ca-ES",
      voz: "Soniox.tts-rt-v2.Marta",
      familia: "soniox",
      entradilla: HABLA_EN_CATALAN,
      saludo:
        "Hola, gràcies per trucar a Perruqueria Anna. En què et puc ajudar?",
    });
    expect(vista.voces.map((voz) => voz.nombre)).toEqual(["Marta", "Sergio"]);
    expect(vista.voces[0].muestra).toBe("/voces/ca/marta.mp3");
    expect(vista.avisos).toEqual([AVISO_ESPERA_CATALAN, AVISO_VOCES_CATALAN]);
  });

  // Antes el inglés como principal era un legado que ya no se ofrecía.
  it("saludo en inglés: sus voces británicas y avisa de que también saluda en inglés a los de aquí", () => {
    const vista = vistaPreviaDeIdiomas(
      {
        languages: ["es-ES", "en-GB"],
        voiceLanguage: "en-GB",
        voiceGender: "masculina",
      },
      "Ana's Salon"
    );

    expect(vista.voiceLanguage).toBe("en-GB");
    expect(vista.voz).toBe("Telnyx.Ultra.4bc3cb8c-adb9-4bb8-b5d5-cbbef950b991");
    expect(vista.voces).toHaveLength(40);
    expect(vista.avisos).toEqual([
      "También saluda en inglés a los clientes de aquí; si le contestan en español, sigue en español.",
      AVISO_SIN_COOFICIALES,
    ]);
  });
});

describe("avisoDeCambio", () => {
  const voz = (nombre: string): VozDelCatalogo => ({
    id: `Telnyx.Ultra.${nombre}`,
    proveedor: "telnyx",
    nombre,
    genero: "femenina",
    descripcion: "De prueba",
    recomendada: false,
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

describe("vistaPreviaDeIdiomas — principal, cooficial y voces (2026-10-05)", () => {
  // Ajustes guardados con las reglas anteriores (saludo en castellano con
  // una cooficial activa): atiende en la cooficial y lo dice.
  it("ajustes anteriores con dos cooficiales y principal español: atiende en la primera y avisa de que saludará en ella", () => {
    const vista = vistaPreviaDeIdiomas(
      {
        languages: ["es-ES", "ca-ES", "gl-ES"],
        voiceLanguage: "es-ES",
        voiceGender: "masculina",
      },
      "Perruquería Ana"
    );

    expect(vista.voiceLanguage).toBe("ca-ES");
    expect(vista.languages).toEqual(idiomasQueHabla("ca-ES"));
    expect(vista.voz).toBe("Soniox.tts-rt-v2.Sergio");
    expect(vista.avisos[0]).toBe("Saludará en catalán.");
  });

  it("ajustes anteriores con catalán y principal inglés: saludará en catalán, y lo dice", () => {
    const vista = vistaPreviaDeIdiomas(
      {
        languages: ["es-ES", "en-GB", "ca-ES"],
        voiceLanguage: "en-GB",
        voiceGender: "femenina",
      },
      "Perruqueria Anna"
    );

    expect(vista.voiceLanguage).toBe("ca-ES");
    expect(vista.avisos).toEqual([
      "Saludará en catalán.",
      AVISO_ESPERA_CATALAN,
      AVISO_VOCES_CATALAN,
    ]);
  });

  it("la entradilla lista los idiomas que habla empezando por el principal", () => {
    expect(entradillaDeIdiomas("es-ES")).toBe(HABLA_EN_ESPANOL);
    expect(entradillaDeIdiomas("gl-ES")).toBe(
      "Habla en 8 idiomas: gallego, español, inglés, francés, alemán, italiano, portugués y neerlandés. Saluda en gallego y sigue en el idioma de quien llama."
    );
    expect(entradillaDeIdiomas("es-ES", ["es-ES"])).toBe(
      "Atiende siempre en español."
    );
  });

  it("las voces de la vista previa son las que se pueden elegir y entre ellas está la que atiende", () => {
    const vista = vistaPreviaDeIdiomas(
      {
        languages: ["es-ES", "fr-FR"],
        voiceLanguage: "es-ES",
        voiceGender: "femenina",
        voz: "Telnyx.Ultra.85b356c1-c638-404d-b986-f54a53d957d6",
      },
      "Peluquería Ana"
    );

    expect(vista.voces).toHaveLength(29);
    expect(vista.voces.map((voz) => voz.id)).toContain(vista.voz);
    expect(vista.voces.find((voz) => voz.id === vista.voz)).toMatchObject({
      nombre: "Lara",
      porDefecto: false,
      recomendada: true,
    });
  });
});

describe("rutaDeMuestra", () => {
  it("las Ultra por uuid y las de Soniox por nombre, en el idioma de su lista", () => {
    expect(
      rutaDeMuestra("es-ES", {
        id: "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6",
        nombre: "Blanca",
      })
    ).toBe("/voces/es/538a8872-3799-4df5-b373-b78493b766c6.mp3");
    expect(
      rutaDeMuestra("gl-ES", {
        id: "Soniox.tts-rt-v2.Sergio",
        nombre: "Sergio",
      })
    ).toBe("/voces/gl/sergio.mp3");
  });
});
