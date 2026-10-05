/**
 * Muestras de las voces que el panel deja elegir: cada voz de cada idioma
 * del saludo del mercado diciendo una frase de recepcionista en ese idioma
 * (las de Soniox, en el de su cooficial), con los mismos ajustes que
 * tendría el assistant (el idioma de Soniox). Se guardan en frontend/public,
 * donde las sirve la app, en mp3 mono ligero: `/voces/<iso>/<uuid>.mp3`
 * para las Ultra y `/voces/<iso>/<nombre>.mp3` para las de Soniox
 * (rutaDeMuestra en lib/idiomas/panel.ts).
 *
 * Uso (con TELNYX_API_KEY en el entorno):
 *   npx tsx scripts/muestrasDeVoces.ts [--todas | --comprobar]
 * Sin flags, solo genera las que faltan (p. ej. tras regenerar
 * vocesUltra.ts con voces nuevas); con --todas las regenera todas. Ante un
 * 429, un 5xx o un corte de red reintenta con espera creciente; un fichero
 * a medias no llega a public/ (se escribe aparte y se copia al final).
 * Requiere ffmpeg. --comprobar no llama a Telnyx: recorre las muestras que
 * pide el catálogo del panel (catalogoParaElPanel) y sale con error si
 * falta alguna. Las muestras viejas por nombre (blanca.mp3, marcos.mp3,
 * las de Azure y MiniMax) no se borran aquí: el backend ya desplegado las
 * pide hasta que se despliega el nuevo.
 */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Telnyx from "telnyx";
import { telnyxAiAdapter } from "../src/adapters/telnyx/TelnyxAiAdapter.js";
import {
  IDIOMAS,
  MERCADOS,
  type CodigoDeIdioma,
  type VozDelCatalogo,
} from "../src/lib/idiomas/catalogo.js";
import {
  catalogoParaElPanel,
  rutaDeMuestra,
} from "../src/lib/idiomas/panel.js";

const PUBLICO = fileURLToPath(
  new URL("../../frontend/public", import.meta.url)
);

/** Una frase corta con lo que más se oye en una llamada: saludo y una hora.
 * En los idiomas extranjeros, con el nombre de un negocio de aquí, como lo
 * diría la recepcionista a un cliente de fuera. */
const FRASES: Partial<Record<CodigoDeIdioma, string>> = {
  "es-ES":
    "Hola, gracias por llamar. Tengo hueco el jueves a las cinco y media de la tarde. ¿Te va bien?",
  "en-GB":
    "Hello, thanks for calling Salón Lucía. I have a slot on Thursday at half past five in the afternoon. Does that suit you?",
  "fr-FR":
    "Bonjour, Salón Lucía, merci de votre appel. J'ai un créneau jeudi à dix-sept heures trente. Ça vous convient ?",
  "de-DE":
    "Guten Tag, Salón Lucía, danke für Ihren Anruf. Am Donnerstag um halb sechs hätte ich noch einen Termin frei. Passt Ihnen das?",
  "it-IT":
    "Buongiorno, Salón Lucía, grazie per la chiamata. Ho un posto libero giovedì alle cinque e mezza del pomeriggio. Le va bene?",
  "pt-PT":
    "Boa tarde, Salón Lucía. Tenho uma vaga na quinta-feira às cinco e meia da tarde. Dá-lhe jeito?",
  "nl-NL":
    "Goedemiddag, met Salón Lucía, bedankt voor het bellen. Ik heb donderdag om half zes nog een plekje vrij. Komt dat uit?",
  "ca-ES":
    "Hola, gràcies per trucar. Tinc lloc dijous a dos quarts de sis de la tarda. Et va bé?",
  "eu-ES":
    "Kaixo, eskerrik asko deitzeagatik. Ostegunean, arratsaldeko bostak eta erdietan, badut tarte bat. Ondo datorkizu?",
  "gl-ES":
    "Ola, grazas por chamar. Teño oco o xoves ás cinco e media da tarde. Vaiche ben?",
};

/** Intentos por muestra y la primera espera (se dobla en cada reintento,
 * salvo que Telnyx diga cuánto con Retry-After). */
const INTENTOS = 5;
const PRIMERA_ESPERA_MS = 2_000;

/** Los mismos `voice_settings` de idioma que el payload del assistant. */
function ajustesDeIdioma(
  principal: CodigoDeIdioma,
  voz: VozDelCatalogo
): Record<string, string> | undefined {
  if (voz.proveedor === "soniox") return { language: IDIOMAS[principal].iso };
  return undefined;
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 429, 5xx o la red: vale la pena repetir. Otro 4xx (una voz que ya no
 * existe, un texto que no acepta) fallaría igual. */
function esReintentable(error: unknown): boolean {
  if (error instanceof Telnyx.APIConnectionError) return true;
  if (error instanceof Telnyx.APIError) {
    return error.status === 429 || (error.status ?? 0) >= 500;
  }
  return false;
}

/** La espera que pide Telnyx (Retry-After, en segundos), si la pide. */
function esperaPedida(error: unknown): number | null {
  if (!(error instanceof Telnyx.APIError)) return null;
  const segundos = Number(error.headers?.get("retry-after"));
  return Number.isFinite(segundos) && segundos > 0 ? segundos * 1000 : null;
}

async function sintetizarConReintentos(
  peticion: Parameters<typeof telnyxAiAdapter.sintetizarVoz>[0],
  etiqueta: string
): Promise<Buffer> {
  for (let intento = 1; ; intento++) {
    try {
      const { audio } = await telnyxAiAdapter.sintetizarVoz(peticion);
      if (audio.length === 0) throw new Error("Telnyx devolvió un audio vacío");
      return audio;
    } catch (error) {
      if (intento >= INTENTOS || !esReintentable(error)) throw error;
      const espera =
        esperaPedida(error) ?? PRIMERA_ESPERA_MS * 2 ** (intento - 1);
      console.warn(
        `[Voces] ${etiqueta}: ${mensajeDe(error)}; reintento ${intento} de ${INTENTOS - 1} en ${Math.round(espera / 1000)} s`
      );
      await new Promise((resolver) => setTimeout(resolver, espera));
    }
  }
}

/** Las muestras que puede pedir el panel que no están en public/. */
function comprobar(): void {
  const rutas = new Set(
    catalogoParaElPanel().principales.flatMap((principal) =>
      principal.voces.map((voz) => voz.muestra)
    )
  );
  const faltan = [...rutas].filter((ruta) => {
    const fichero = join(PUBLICO, ruta);
    return !existsSync(fichero) || statSync(fichero).size === 0;
  });
  for (const ruta of faltan) console.error(`[Voces] Falta ${ruta}`);
  console.log(
    `[Voces] ${rutas.size - faltan.length} de ${rutas.size} muestras del panel en frontend/public.`
  );
  if (faltan.length > 0) process.exitCode = 1;
}

async function generar(todas: boolean): Promise<void> {
  const temporal = mkdtempSync(join(tmpdir(), "muestras-"));
  let generadas = 0;
  let fallos = 0;
  try {
    for (const principal of MERCADOS.ES.principales) {
      const frase = FRASES[principal];
      if (!frase) throw new Error(`Falta la frase de muestra de ${principal}`);
      for (const voz of IDIOMAS[principal].voces ?? []) {
        const destino = join(PUBLICO, rutaDeMuestra(principal, voz));
        if (!todas && existsSync(destino)) continue;
        const etiqueta = `${principal} ${voz.nombre} (${voz.id})`;
        try {
          const audio = await sintetizarConReintentos(
            {
              texto: frase,
              voz: voz.id,
              ajustes: ajustesDeIdioma(principal, voz),
            },
            etiqueta
          );
          const original = join(temporal, "original");
          const convertida = join(temporal, "convertida.mp3");
          writeFileSync(original, audio);
          execFileSync("ffmpeg", [
            "-y",
            "-loglevel",
            "error",
            "-i",
            original,
            "-ac",
            "1",
            "-b:a",
            "48k",
            convertida,
          ]);
          mkdirSync(dirname(destino), { recursive: true });
          copyFileSync(convertida, destino);
          generadas++;
          console.log(`[Voces] ${principal} ${voz.nombre}: ${destino}`);
        } catch (error) {
          fallos++;
          console.error(`[Voces] ${etiqueta}: ${mensajeDe(error)}`);
        }
      }
    }
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
  console.log(`\n[Voces] ${generadas} muestras generadas, ${fallos} fallos.`);
  if (fallos > 0) process.exitCode = 1;
}

async function main() {
  if (process.argv.includes("--comprobar")) {
    comprobar();
    return;
  }
  await generar(process.argv.includes("--todas"));
}

main().catch((error) => {
  console.error("[Voces] Fallo al generar las muestras:", error);
  process.exitCode = 1;
});
