/**
 * Genera src/lib/idiomas/vocesUltra.ts: las voces Ultra que el negocio
 * puede elegir en cada idioma, combinando la lista de la API de Telnyx
 * (listVoices) con la curación a mano (src/lib/idiomas/curacionDeVoces.ts).
 *
 * Entra una voz si su id empieza por `Telnyx.Ultra.`, su `language` es el
 * locale del idioma (y su acento, donde se exige: castellano en español),
 * es de mujer o de hombre, no está deprecada, no está excluida y tiene
 * curación. Una voz nueva sin curación no entra: se avisa y, con
 * --estricto, el script falla sin escribir nada.
 *
 * Fallan siempre, sin escribir nada: una voz por defecto que no exista,
 * esté deprecada, sea de otro género o no sea recomendada; dos voces que
 * entran con el mismo nombre visible en un idioma (sin distinguir tildes ni
 * mayúsculas); dos que son la misma (mismo nombre de pila y misma etiqueta)
 * sin excluir una; una id curada y excluida a la vez; y una descripción
 * fuera de 2–5 palabras. Avisan (y fallan con --estricto) la curación o la
 * exclusión de una voz que ya no está o se ha deprecado.
 *
 * Orden: por género (mujeres primero) y, en cada uno, la de por defecto,
 * las recomendadas y el resto, estas dos por nombre. La salida no lleva
 * fecha: regenerar sin cambios en la API ni en la curación no cambia nada.
 *
 * Uso (con TELNYX_API_KEY en el entorno):
 *   npx tsx scripts/generarVocesUltra.ts [--estricto] [--comprobar]
 * --comprobar no escribe: falla si el fichero no está al día.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  telnyxAiAdapter,
  type TelnyxVoice,
} from "../src/adapters/telnyx/TelnyxAiAdapter.js";
import type { GeneroDeVoz } from "../src/lib/idiomas/catalogo.js";
import {
  ACENTO_EN_TELNYX,
  CURACION_DE_VOCES,
  EXCLUSIONES_DE_VOCES,
  IDIOMAS_CON_VOCES_ULTRA,
  LOCALE_EN_TELNYX,
  VOCES_POR_DEFECTO,
  type IdiomaConVocesUltra,
} from "../src/lib/idiomas/curacionDeVoces.js";

const SALIDA = fileURLToPath(
  new URL("../src/lib/idiomas/vocesUltra.ts", import.meta.url)
);

const PREFIJO_ULTRA = "Telnyx.Ultra.";

const GENEROS: readonly GeneroDeVoz[] = ["femenina", "masculina"];

const GENERO_DE_TELNYX: Record<string, GeneroDeVoz> = {
  female: "femenina",
  male: "masculina",
};

interface VozQueEntra {
  id: string;
  nombre: string;
  genero: GeneroDeVoz;
  descripcion: string;
  recomendada: boolean;
  /** Para el comentario del fichero y los avisos. */
  nombreEnTelnyx: string;
}

const ordenAlfabetico = new Intl.Collator("es", { sensitivity: "base" });

/** «Inès\t- Poised Communicator» → «Inès - Poised Communicator». */
function limpiar(nombre: string): string {
  return nombre.replace(/\s+/g, " ").trim();
}

/** «Blanca - Graceful Host» → «Blanca». */
function nombreDePila(nombreEnTelnyx: string): string {
  return limpiar(nombreEnTelnyx).split(" - ")[0].trim();
}

/** Para comparar nombres sin tildes ni mayúsculas («Élise» = «elise»). */
function clave(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function describir(voz: TelnyxVoice): string {
  return `${voz.id} («${limpiar(voz.name ?? "")}»)`;
}

function vocesDelIdioma(
  idioma: IdiomaConVocesUltra,
  todas: readonly TelnyxVoice[],
  errores: string[],
  avisos: string[]
): VozQueEntra[] {
  const locale = LOCALE_EN_TELNYX[idioma];
  const acento = ACENTO_EN_TELNYX[idioma];
  const curacion = CURACION_DE_VOCES[idioma];
  const exclusiones = EXCLUSIONES_DE_VOCES[idioma];

  const delIdioma = todas.filter(
    (voz) =>
      voz.id.startsWith(PREFIJO_ULTRA) &&
      voz.language === locale &&
      (acento === undefined || voz.accent === acento)
  );
  const porId = new Map(delIdioma.map((voz) => [voz.id, voz]));

  const entran: VozQueEntra[] = [];
  for (const voz of delIdioma) {
    const genero = GENERO_DE_TELNYX[(voz.gender ?? "").toLowerCase()];
    if (!genero || voz.deprecated === true) continue;
    if (voz.id in exclusiones) {
      if (voz.id in curacion) {
        errores.push(`${idioma}: ${describir(voz)} está curada y excluida`);
      }
      continue;
    }
    const curada = curacion[voz.id];
    if (!curada) {
      avisos.push(
        `${idioma}: voz nueva sin curación, no entra: ${describir(voz)} — ` +
          `${voz.gender}, «${voz.label ?? ""}»`
      );
      continue;
    }
    const palabras = curada.descripcion.trim().split(/\s+/).length;
    if (palabras < 2 || palabras > 5) {
      errores.push(
        `${idioma}: la descripción de ${describir(voz)} tiene ${palabras} ` +
          `palabras: «${curada.descripcion}»`
      );
    }
    entran.push({
      id: voz.id,
      nombre: limpiar(curada.nombre ?? nombreDePila(voz.name ?? "")),
      genero,
      descripcion: curada.descripcion,
      recomendada: curada.recomendada === true,
      nombreEnTelnyx: limpiar(voz.name ?? ""),
    });
  }

  // Curación y exclusiones desfasadas: la voz ya no está, se ha deprecado
  // o ha perdido el género.
  for (const [id, tipo] of [
    ...Object.keys(curacion).map((id) => [id, "curada"] as const),
    ...Object.keys(exclusiones).map((id) => [id, "excluida"] as const),
  ]) {
    const voz = porId.get(id);
    if (!voz) {
      avisos.push(
        `${idioma}: ${id} está ${tipo} pero ya no está entre las Ultra ` +
          `«${locale}» de la API`
      );
    } else if (voz.deprecated === true) {
      avisos.push(`${idioma}: ${describir(voz)} está ${tipo} y deprecada`);
    } else if (!GENERO_DE_TELNYX[(voz.gender ?? "").toLowerCase()]) {
      avisos.push(
        `${idioma}: ${describir(voz)} está ${tipo} pero no tiene género ` +
          `(«${voz.gender ?? ""}»)`
      );
    }
  }

  // Las de por defecto: tienen que entrar, con su género y recomendadas.
  for (const genero of GENEROS) {
    const id = VOCES_POR_DEFECTO[idioma][genero];
    const voz = entran.find((candidata) => candidata.id === id);
    if (!voz) {
      const enLaApi = porId.get(id);
      errores.push(
        `${idioma}: la voz ${genero} por defecto ${id} no entra (` +
          (enLaApi
            ? `${enLaApi.deprecated ? "deprecada" : "sin curar o excluida"}`
            : "no está en la API") +
          ")"
      );
    } else if (voz.genero !== genero) {
      errores.push(
        `${idioma}: la voz ${genero} por defecto ${id} es ${voz.genero}`
      );
    } else if (!voz.recomendada) {
      errores.push(`${idioma}: la voz por defecto ${id} no es recomendada`);
    }
  }

  // Duplicados: mismo nombre de pila y misma etiqueta con otra id.
  const porNombreYEtiqueta = new Map<string, VozQueEntra[]>();
  for (const voz of entran) {
    const etiqueta = porId.get(voz.id)?.label ?? "";
    const k = `${clave(nombreDePila(voz.nombreEnTelnyx))}|${etiqueta}`;
    porNombreYEtiqueta.set(k, [...(porNombreYEtiqueta.get(k) ?? []), voz]);
  }
  for (const grupo of porNombreYEtiqueta.values()) {
    if (grupo.length > 1) {
      errores.push(
        `${idioma}: duplicadas (mismo nombre y etiqueta), excluye todas ` +
          `menos una: ${grupo.map((voz) => voz.id).join(", ")}`
      );
    }
  }

  // Nombre visible único dentro del idioma, sin tabuladores ni sufijo.
  const porNombre = new Map<string, VozQueEntra[]>();
  for (const voz of entran) {
    if (voz.nombre.includes(" - ") || voz.nombre === "") {
      errores.push(`${idioma}: nombre visible inválido «${voz.nombre}»`);
    }
    const k = clave(voz.nombre);
    porNombre.set(k, [...(porNombre.get(k) ?? []), voz]);
  }
  for (const grupo of porNombre.values()) {
    if (grupo.length > 1) {
      errores.push(
        `${idioma}: nombre visible repetido «${grupo[0].nombre}», ` +
          `desambigua con «nombre» en la curación: ` +
          grupo.map((voz) => voz.id).join(", ")
      );
    }
  }

  return ordenar(idioma, entran);
}

function ordenar(
  idioma: IdiomaConVocesUltra,
  voces: VozQueEntra[]
): VozQueEntra[] {
  const rango = (voz: VozQueEntra) =>
    voz.id === VOCES_POR_DEFECTO[idioma][voz.genero]
      ? 0
      : voz.recomendada
        ? 1
        : 2;
  return [...voces].sort(
    (a, b) =>
      GENEROS.indexOf(a.genero) - GENEROS.indexOf(b.genero) ||
      rango(a) - rango(b) ||
      ordenAlfabetico.compare(a.nombre, b.nombre) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function resumen(voces: readonly VozQueEntra[]): string {
  const deGenero = (genero: GeneroDeVoz) =>
    voces.filter((voz) => voz.genero === genero);
  const parte = (genero: GeneroDeVoz, nombre: string) => {
    const lista = deGenero(genero);
    const recomendadas = lista.filter((voz) => voz.recomendada).length;
    return `${lista.length} ${nombre} (${recomendadas} recomendadas)`;
  };
  return (
    `${voces.length} voces: ${parte("femenina", "mujeres")}, ` +
    parte("masculina", "hombres")
  );
}

const texto = (valor: string) => JSON.stringify(valor);

function escribirFichero(
  porIdioma: ReadonlyMap<IdiomaConVocesUltra, VozQueEntra[]>
): string {
  const lineas = [
    "/**",
    " * Voces Ultra que el negocio puede elegir, por idioma de saludo.",
    " *",
    " * GENERADO por scripts/generarVocesUltra.ts con la lista de la API de",
    " * Telnyx y la curación a mano (curacionDeVoces.ts). No editar a mano:",
    " * cambia la curación y vuelve a generarlo.",
    " *",
    " * Por género (mujeres primero); en cada uno, la de por defecto, luego",
    " * las recomendadas y luego el resto, estas dos por nombre.",
    " */",
    'import type { GeneroDeVoz } from "./catalogo.js";',
    'import type { PorIdiomaUltra } from "./curacionDeVoces.js";',
    "",
    "export interface VozUltra {",
    "  /** `Telnyx.Ultra.<uuid>`, tal cual va en `voice_settings.voice`. */",
    "  id: string;",
    "  /** Nombre visible, único dentro de su idioma. */",
    "  nombre: string;",
    "  genero: GeneroDeVoz;",
    "  /** Cómo suena, en español (2–5 palabras). */",
    "  descripcion: string;",
    "  /** De atención al cliente: el panel la enseña sin desplegar. */",
    "  recomendada: boolean;",
    "}",
    "",
    "export const VOCES_ULTRA: PorIdiomaUltra<readonly VozUltra[]> = {",
  ];
  for (const idioma of IDIOMAS_CON_VOCES_ULTRA) {
    const voces = porIdioma.get(idioma) ?? [];
    lineas.push(`  // ${resumen(voces)}`);
    lineas.push(`  ${texto(idioma)}: [`);
    for (const voz of voces) {
      lineas.push(`    // ${voz.nombreEnTelnyx}`);
      lineas.push("    {");
      lineas.push(`      id: ${texto(voz.id)},`);
      lineas.push(`      nombre: ${texto(voz.nombre)},`);
      lineas.push(`      genero: ${texto(voz.genero)},`);
      lineas.push(`      descripcion: ${texto(voz.descripcion)},`);
      lineas.push(`      recomendada: ${voz.recomendada},`);
      lineas.push("    },");
    }
    lineas.push("  ],");
  }
  lineas.push("};", "");
  return lineas.join("\n");
}

async function main() {
  const estricto = process.argv.includes("--estricto");
  const comprobar = process.argv.includes("--comprobar");

  const todas = await telnyxAiAdapter.listVoices("telnyx");
  console.log(`[Voces] ${todas.length} voces de Telnyx en la API`);

  const errores: string[] = [];
  const avisos: string[] = [];
  const porIdioma = new Map<IdiomaConVocesUltra, VozQueEntra[]>();
  for (const idioma of IDIOMAS_CON_VOCES_ULTRA) {
    const voces = vocesDelIdioma(idioma, todas, errores, avisos);
    porIdioma.set(idioma, voces);
    console.log(`[Voces] ${idioma}: ${resumen(voces)}`);
  }

  for (const aviso of avisos) console.warn(`[Voces] Aviso: ${aviso}`);
  for (const error of errores) console.error(`[Voces] Error: ${error}`);
  if (errores.length > 0 || (estricto && avisos.length > 0)) {
    console.error(
      `[Voces] No se escribe ${SALIDA}: ${errores.length} errores, ` +
        `${avisos.length} avisos${estricto ? " (--estricto)" : ""}`
    );
    process.exitCode = 1;
    return;
  }

  const contenido = escribirFichero(porIdioma);
  let actual: string | null;
  try {
    actual = readFileSync(SALIDA, "utf8");
  } catch {
    actual = null; // aún no existe
  }
  if (comprobar) {
    if (actual === contenido) {
      console.log(`[Voces] ${SALIDA} está al día`);
    } else {
      console.error(`[Voces] ${SALIDA} no está al día: regenéralo`);
      process.exitCode = 1;
    }
    return;
  }
  if (actual === contenido) {
    console.log(`[Voces] Sin cambios en ${SALIDA}`);
    return;
  }
  writeFileSync(SALIDA, contenido);
  console.log(`[Voces] Escrito ${SALIDA}`);
}

main().catch((error) => {
  console.error("[Voces] Error:", error);
  process.exitCode = 1;
});
