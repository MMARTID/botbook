/**
 * Muestras de las voces que el panel deja elegir: cada voz de cada idioma
 * principal del mercado diciendo una frase de recepcionista en ese idioma,
 * con los mismos ajustes que tendría el assistant (el idioma de Soniox). Se
 * guardan en frontend/public, donde las sirve la app (rutaDeMuestra en
 * lib/idiomas/panel.ts), en mp3 mono ligero.
 *
 * Uso (con TELNYX_API_KEY en el entorno):
 *   npx tsx scripts/muestrasDeVoces.ts [--todas]
 * Sin --todas, solo genera las que faltan (p. ej. tras añadir una voz al
 * catálogo). Requiere ffmpeg.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { telnyxAiAdapter } from "../src/adapters/telnyx/TelnyxAiAdapter.js";
import {
  IDIOMAS,
  MERCADOS,
  type CodigoDeIdioma,
  type VozDelCatalogo,
} from "../src/lib/idiomas/catalogo.js";
import { rutaDeMuestra } from "../src/lib/idiomas/panel.js";

const PUBLICO = fileURLToPath(
  new URL("../../frontend/public", import.meta.url)
);

/** Una frase corta con lo que más se oye en una llamada: saludo y una hora. */
const FRASES: Partial<Record<CodigoDeIdioma, string>> = {
  "es-ES":
    "Hola, gracias por llamar. Tengo hueco el jueves a las cinco y media de la tarde. ¿Te va bien?",
  "ca-ES":
    "Hola, gràcies per trucar. Tinc lloc dijous a dos quarts de sis de la tarda. Et va bé?",
  "eu-ES":
    "Kaixo, eskerrik asko deitzeagatik. Ostegunean, arratsaldeko bostak eta erdietan, badut tarte bat. Ondo datorkizu?",
  "gl-ES":
    "Ola, grazas por chamar. Teño oco o xoves ás cinco e media da tarde. Vaiche ben?",
};

/** Los mismos `voice_settings` de idioma que el payload del assistant. */
function ajustesDeIdioma(
  principal: CodigoDeIdioma,
  voz: VozDelCatalogo
): Record<string, string> | undefined {
  if (voz.proveedor === "soniox") return { language: IDIOMAS[principal].iso };
  return undefined;
}

async function main() {
  const todas = process.argv.includes("--todas");
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
        try {
          const { audio } = await telnyxAiAdapter.sintetizarVoz({
            texto: frase,
            voz: voz.id,
            ajustes: ajustesDeIdioma(principal, voz),
          });
          const original = join(temporal, "original");
          writeFileSync(original, audio);
          mkdirSync(dirname(destino), { recursive: true });
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
            destino,
          ]);
          generadas++;
          console.log(`[Voces] ${principal} ${voz.nombre}: ${destino}`);
        } catch (error) {
          fallos++;
          console.error(
            `[Voces] ${principal} ${voz.nombre} (${voz.id}): ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
  console.log(`\n[Voces] ${generadas} muestras generadas, ${fallos} fallos.`);
  if (fallos > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[Voces] Fallo al generar las muestras:", error);
  process.exitCode = 1;
});
