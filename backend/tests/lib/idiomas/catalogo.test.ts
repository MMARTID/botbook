import { describe, it, expect } from "vitest";
import {
  CODIGOS_DE_IDIOMA,
  GENEROS_DE_VOZ,
  IDIOMAS,
  MERCADOS,
  ULTRA_HABLA,
  componerSaludo,
  esCooficial,
  esVozDelCatalogo,
  familiaDeVoces,
  hablaIdioma,
  idiomasQueHabla,
  puedeSerPrincipal,
  type ProveedorDeVoz,
} from "../../../src/lib/idiomas/catalogo.js";
import {
  IDIOMAS_CON_VOCES_ULTRA,
  VOCES_POR_DEFECTO,
} from "../../../src/lib/idiomas/curacionDeVoces.js";

const PREFIJO: Record<ProveedorDeVoz, string> = {
  telnyx: "Telnyx.Ultra.",
  soniox: "Soniox.",
};

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

  it("cada idioma que puede ser principal tiene voces de los dos géneros que lo hablan, sin repetir", () => {
    for (const codigo of CODIGOS_DE_IDIOMA.filter(puedeSerPrincipal)) {
      const voces = IDIOMAS[codigo].voces!;
      for (const genero of GENEROS_DE_VOZ) {
        expect(
          voces.some((voz) => voz.genero === genero),
          `${codigo}/${genero}`
        ).toBe(true);
      }
      for (const voz of voces) {
        expect(voz.id.startsWith(PREFIJO[voz.proveedor]), voz.id).toBe(true);
        expect(hablaIdioma(voz, codigo), `${codigo}: ${voz.nombre}`).toBe(true);
        expect(esVozDelCatalogo(voz.id), voz.id).toBe(true);
      }
      expect(new Set(voces.map((voz) => voz.id)).size, codigo).toBe(
        voces.length
      );
    }
    expect(esVozDelCatalogo("Telnyx.Ultra.inventada")).toBe(false);
  });

  // Desde el 2026-10-05 el principal manda: de él salen la familia de
  // voces (familiaDeVoces) y los idiomas que habla (idiomasQueHabla).
  it("en cada mercado, con cada principal habla el obligatorio y todas las voces de su familia hablan todos sus idiomas", () => {
    for (const [nombre, mercado] of Object.entries(MERCADOS)) {
      expect(mercado.principales, nombre).toContain(mercado.obligatorio);
      for (const principal of mercado.principales) {
        expect(puedeSerPrincipal(principal), `${nombre}/${principal}`).toBe(
          true
        );
        const idiomas = idiomasQueHabla(principal);
        expect(idiomas, `${nombre}/${principal}`).toContain(
          mercado.obligatorio
        );
        expect(idiomas, `${nombre}/${principal}`).toContain(principal);
        const { voces } = familiaDeVoces(principal);
        for (const genero of GENEROS_DE_VOZ) {
          expect(
            voces.some((voz) => voz.genero === genero),
            `${nombre}/${principal}/${genero}`
          ).toBe(true);
        }
        for (const voz of voces) {
          expect(
            idiomas.every((idioma) => hablaIdioma(voz, idioma)),
            `${nombre}/${principal}: ${voz.nombre}`
          ).toBe(true);
        }
      }
    }
  });

  it("España: español con voces Ultra; catalán, euskera y gallego sin flux y con Marta y Sergio de Soniox por defecto", () => {
    expect(
      IDIOMAS["es-ES"].voces!.every((voz) => voz.proveedor === "telnyx")
    ).toBe(true);
    for (const codigo of ["ca-ES", "eu-ES", "gl-ES"] as const) {
      expect(
        IDIOMAS[codigo].voces!.slice(0, 2).map((voz) => voz.id),
        codigo
      ).toEqual(["Soniox.tts-rt-v2.Marta", "Soniox.tts-rt-v2.Sergio"]);
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

// Decisiones del usuario del 2026-10-05: voces Ultra nativas en cada idioma
// que no es cooficial (vocesUltra.ts, generado) y saludo en cualquiera.
describe("catálogo de idiomas — voces Ultra y mercado de España", () => {
  const ESPERADAS: Record<
    (typeof IDIOMAS_CON_VOCES_ULTRA)[number],
    { femeninas: number; masculinas: number }
  > = {
    "es-ES": { femeninas: 18, masculinas: 11 },
    "en-GB": { femeninas: 14, masculinas: 26 },
    "fr-FR": { femeninas: 17, masculinas: 16 },
    "de-DE": { femeninas: 16, masculinas: 17 },
    "it-IT": { femeninas: 6, masculinas: 7 },
    "pt-PT": { femeninas: 2, masculinas: 5 },
    "nl-NL": { femeninas: 7, masculinas: 4 },
  };

  it("cada idioma no cooficial tiene sus voces Ultra, que hablan lo de siempre", () => {
    for (const codigo of IDIOMAS_CON_VOCES_ULTRA) {
      const voces = IDIOMAS[codigo].voces!;
      expect(IDIOMAS[codigo].cooficial, codigo).toBe(false);
      expect(
        {
          femeninas: voces.filter((voz) => voz.genero === "femenina").length,
          masculinas: voces.filter((voz) => voz.genero === "masculina").length,
        },
        codigo
      ).toEqual(ESPERADAS[codigo]);
      for (const voz of voces) {
        expect(voz.proveedor, voz.id).toBe("telnyx");
        expect(voz.habla, voz.id).toEqual(ULTRA_HABLA);
        const palabras = voz.descripcion.split(/\s+/).length;
        expect(palabras >= 2 && palabras <= 5, voz.id).toBe(true);
      }
    }
  });

  it("la de por defecto de cada idioma y género es la primera de su género y recomendada (en español, Blanca y Marcos)", () => {
    for (const codigo of IDIOMAS_CON_VOCES_ULTRA) {
      for (const genero of GENEROS_DE_VOZ) {
        const primera = IDIOMAS[codigo].voces!.find(
          (voz) => voz.genero === genero
        )!;
        expect(primera.id, `${codigo}/${genero}`).toBe(
          VOCES_POR_DEFECTO[codigo][genero]
        );
        expect(primera.recomendada, `${codigo}/${genero}`).toBe(true);
      }
    }
    expect(IDIOMAS["es-ES"].voces![0]).toMatchObject({
      id: "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6",
      nombre: "Blanca",
    });
    expect(
      IDIOMAS["es-ES"].voces!.find((voz) => voz.genero === "masculina")
    ).toMatchObject({
      id: "Telnyx.Ultra.13ff5deb-2591-42ad-a356-63a04e524411",
      nombre: "Marcos",
    });
  });

  it("los nombres visibles no se repiten dentro de un idioma, sin sufijos en inglés ni tabuladores", () => {
    for (const codigo of CODIGOS_DE_IDIOMA.filter(puedeSerPrincipal)) {
      const nombres = IDIOMAS[codigo].voces!.map((voz) =>
        voz.nombre
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
      );
      expect(new Set(nombres).size, codigo).toBe(nombres.length);
      for (const voz of IDIOMAS[codigo].voces!) {
        expect(voz.nombre, voz.id).not.toMatch(/ - |\t/);
      }
    }
  });

  it("en español las recomendadas son las de atención al cliente que eligió el usuario", () => {
    const recomendadas = (genero: "femenina" | "masculina") =>
      IDIOMAS["es-ES"]
        .voces!.filter((voz) => voz.genero === genero && voz.recomendada)
        .map((voz) => voz.nombre)
        .sort();
    expect(recomendadas("femenina")).toEqual(
      ["Alicia", "Blanca", "Eva", "Lara", "Marta", "Nuria"].sort()
    );
    expect(recomendadas("masculina")).toEqual(
      ["Álvaro", "Darío", "Marcos", "Miguel", "Octavio", "Rafael"].sort()
    );
  });

  it("España: el principal puede ser cualquiera de los diez idiomas; las cooficiales con Marta y Sergio", () => {
    expect(MERCADOS.ES.principales).toEqual([
      "es-ES",
      "ca-ES",
      "eu-ES",
      "gl-ES",
      "en-GB",
      "fr-FR",
      "de-DE",
      "it-IT",
      "pt-PT",
      "nl-NL",
    ]);
    expect(CODIGOS_DE_IDIOMA.filter(esCooficial)).toEqual([
      "ca-ES",
      "eu-ES",
      "gl-ES",
    ]);
    expect(
      esVozDelCatalogo("Telnyx.Ultra.38aabb6a-f52b-4fb0-a3d1-988518f4dc06")
    ).toBe(true);
    expect(esVozDelCatalogo("Azure.ca-ES-JoanaNeural")).toBe(false);
  });

  // Decisión del usuario del 2026-10-05 («nos hemos complicado»): el dueño
  // solo elige el principal.
  it("lo que habla con cada principal: los siete de ULTRA_HABLA y, con una cooficial, también ella, en orden canónico", () => {
    for (const principal of ULTRA_HABLA) {
      expect(idiomasQueHabla(principal), principal).toEqual([...ULTRA_HABLA]);
    }
    expect(idiomasQueHabla("ca-ES")).toEqual([
      "es-ES",
      "en-GB",
      "fr-FR",
      "ca-ES",
      "de-DE",
      "it-IT",
      "pt-PT",
      "nl-NL",
    ]);
    for (const principal of ["eu-ES", "gl-ES"] as const) {
      const idiomas = idiomasQueHabla(principal);
      expect(idiomas, principal).toHaveLength(8);
      expect(idiomas.filter(esCooficial), principal).toEqual([principal]);
    }
  });

  it("la familia: con un principal cooficial, sus voces de Soniox; si no, sus Ultra", () => {
    expect(familiaDeVoces("ca-ES")).toEqual({
      familia: "soniox",
      voces: IDIOMAS["ca-ES"].voces,
    });
    expect(familiaDeVoces("es-ES").familia).toBe("ultra");
    expect(familiaDeVoces("en-GB").voces).toBe(IDIOMAS["en-GB"].voces);
  });
});
