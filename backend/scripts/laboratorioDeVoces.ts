/**
 * Laboratorio de voces: muestras y tiempos de las voces candidatas para
 * los idiomas que Ultra no habla (catalán, euskera y gallego) y de la voz
 * Ultra de español hablando los idiomas extranjeros que aún no se ofrecen.
 * Genera una página de escucha a ciegas para elegir de oído; la decisión se
 * anota luego en lib/idiomas/catalogo.ts. Solo sintetiza audio: no crea
 * nada en la cuenta de Telnyx.
 *
 * Cada voz regional dice también las frases en español, con los mismos
 * ajustes que tendría el assistant: en un negocio con catalán de idioma
 * principal, la mayoría de las llamadas siguen siendo en castellano.
 *
 * Uso (con TELNYX_API_KEY en el entorno):
 *   npx tsx scripts/laboratorioDeVoces.ts [--salida <directorio>] [--repeticiones 3]
 * Requiere ffmpeg para unir las frases.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { telnyxAiAdapter } from "../src/adapters/telnyx/TelnyxAiAdapter.js";

type Idioma = "ca" | "eu" | "gl" | "es" | "de" | "it" | "pt" | "nl";

const FRASES: Record<Idioma, string[]> = {
  ca: [
    "Hola, gràcies per trucar a Perruqueria Anna. En què et puc ajudar?",
    "Tinc lloc dijous a dos quarts de sis de la tarda. Et va bé?",
    "Et confirmo el telèfon: 612 345 678.",
    "Perfecte: tall i pentinat amb la Laura, dijous dia 9 a les 17:30. T'envio la confirmació per WhatsApp?",
  ],
  eu: [
    "Kaixo, Ana ile-apaindegia. Zertan lagun zaitzaket?",
    "Ostegunean, arratsaldeko bostak eta erdietan, badut tarte bat. Ondo datorkizu?",
    "Telefonoa baieztatzen dizut: 612 345 678.",
    "Primeran: ilea moztu eta orraztu Laurarekin, ostegunean, 9an, 17:30ean. Berrespena WhatsApp bidez bidaliko dizut?",
  ],
  gl: [
    "Ola, grazas por chamar a Perruquería Ana. En que te podo axudar?",
    "Teño oco o xoves ás cinco e media da tarde. Vaiche ben?",
    "Confírmoche o teléfono: 612 345 678.",
    "Perfecto: corte e peiteado con Laura, o xoves día 9 ás 17:30. Envíoche a confirmación por WhatsApp?",
  ],
  es: [
    "Tengo hueco el jueves a las cinco y media de la tarde. ¿Te va bien?",
    "Perfecto: corte y peinado con Laura, el jueves día 9 a las 17:30. ¿Te envío la confirmación por WhatsApp?",
  ],
  de: [
    "Ich habe am Donnerstag um 17:30 Uhr noch einen Termin frei. Passt Ihnen das? Ihre Nummer ist 612 345 678, richtig?",
  ],
  it: [
    "Ho un posto libero giovedì alle 17:30. Le va bene? Il suo numero è 612 345 678, giusto?",
  ],
  pt: [
    "Tenho vaga na quinta-feira às 17:30. Dá-lhe jeito? O seu número é 612 345 678, certo?",
  ],
  nl: [
    "Ik heb donderdag om 17:30 uur nog plek. Past dat u? Uw nummer is 612 345 678, klopt dat?",
  ],
};

interface Candidata {
  prueba: string;
  nombre: string;
  voz: string;
  /** voice_settings por idioma del texto, como los mandaría el assistant. */
  ajustes: (idiomaDelTexto: Idioma) => Record<string, unknown> | undefined;
  idiomas: Idioma[];
}

const ULTRA = {
  Blanca: "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6",
  Marcos: "Telnyx.Ultra.13ff5deb-2591-42ad-a356-63a04e524411",
};

/** El assistant manda el idioma del principal en todas las frases. */
const sonioxEn = (iso: Idioma) => () => ({ language: iso });
const minimaxCatalan = () => ({ language_boost: "Catalan" });
const sinAjustes = () => undefined;

function candidatasRegionales(
  prueba: Idioma,
  azure: Array<[string, string]>,
  conMinimax: boolean
): Candidata[] {
  const idiomas: Idioma[] = [prueba, "es"];
  const lista: Candidata[] = [
    {
      prueba,
      nombre: "Soniox Marta",
      voz: "Soniox.tts-rt-v2.Marta",
      ajustes: sonioxEn(prueba),
      idiomas,
    },
    {
      prueba,
      nombre: "Soniox Sergio",
      voz: "Soniox.tts-rt-v2.Sergio",
      ajustes: sonioxEn(prueba),
      idiomas,
    },
    ...azure.map(([nombre, voz]) => ({
      prueba,
      nombre: `Azure ${nombre}`,
      voz,
      ajustes: sinAjustes,
      idiomas,
    })),
  ];
  if (conMinimax) {
    for (const [nombre, id] of [
      ["Serene Woman", "Spanish_SereneWoman"],
      ["Kind-hearted Girl", "Spanish_Kind-heartedGirl"],
      ["Thoughtful Man", "Spanish_ThoughtfulMan"],
      ["Rational Man", "Spanish_RationalMan"],
    ]) {
      lista.push({
        prueba,
        nombre: `MiniMax ${nombre}`,
        voz: `Minimax.speech-2.8-turbo.${id}`,
        ajustes: minimaxCatalan,
        idiomas,
      });
    }
  }
  return lista;
}

const CANDIDATAS: Candidata[] = [
  ...candidatasRegionales(
    "ca",
    [
      ["Joana", "Azure.ca-ES-JoanaNeural"],
      ["Alba", "Azure.ca-ES-AlbaNeural"],
      ["Enric", "Azure.ca-ES-EnricNeural"],
    ],
    true
  ),
  ...candidatasRegionales(
    "eu",
    [
      ["Ainhoa", "Azure.eu-ES-AinhoaNeural"],
      ["Ander", "Azure.eu-ES-AnderNeural"],
    ],
    false
  ),
  ...candidatasRegionales(
    "gl",
    [
      ["Sabela", "Azure.gl-ES-SabelaNeural"],
      ["Roi", "Azure.gl-ES-RoiNeural"],
    ],
    false
  ),
  // La voz Ultra de español con los idiomas extranjeros pendientes de
  // ofrecer: si se entiende bien, entran como «otros idiomas».
  ...(["de", "it", "pt", "nl"] as const).flatMap((idioma) =>
    Object.entries(ULTRA).map(([nombre, voz]) => ({
      prueba: `ultra-${idioma}`,
      nombre: `Ultra ${nombre}`,
      voz,
      ajustes: sinAjustes,
      idiomas: [idioma] as Idioma[],
    }))
  ),
];

function leerArgumento(nombre: string): string | undefined {
  const indice = process.argv.indexOf(nombre);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

function mediana(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor(ordenados.length / 2)];
}

function escaparHtml(texto: string): string {
  return texto.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!
  );
}

async function main() {
  const salida =
    leerArgumento("--salida") ??
    join(
      tmpdir(),
      `laboratorio-de-voces-${new Date().toISOString().slice(0, 10)}`
    );
  const repeticiones = Number(leerArgumento("--repeticiones") ?? 3);
  const piezas = join(salida, "piezas");
  mkdirSync(piezas, { recursive: true });
  const silencio = join(piezas, "silencio.mp3");
  execFileSync("ffmpeg", [
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=24000:cl=mono",
    "-t",
    "0.6",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    silencio,
  ]);

  const resultados: Array<{
    candidata: Candidata;
    fichero: string | null;
    primerByteMs: number | null;
    servidorMs: number | null;
    error?: string;
  }> = [];

  for (const [indice, candidata] of CANDIDATAS.entries()) {
    const base = `${candidata.prueba}-${indice}`;
    try {
      // Tiempo con la primera frase (la más corta y la que abre la llamada).
      const tiempos: Array<{
        primerByteMs: number;
        servidorMs: number | null;
      }> = [];
      const primerIdioma = candidata.idiomas[0];
      for (let vez = 0; vez < repeticiones; vez++) {
        const { primerByteMs, servidorMs } =
          await telnyxAiAdapter.sintetizarVoz({
            texto: FRASES[primerIdioma][0],
            voz: candidata.voz,
            ajustes: candidata.ajustes(primerIdioma),
          });
        tiempos.push({ primerByteMs, servidorMs });
      }
      const lista: string[] = [];
      for (const idioma of candidata.idiomas) {
        for (const [numero, frase] of FRASES[idioma].entries()) {
          const { audio } = await telnyxAiAdapter.sintetizarVoz({
            texto: frase,
            voz: candidata.voz,
            ajustes: candidata.ajustes(idioma),
          });
          const fichero = join(piezas, `${base}-${idioma}-${numero}.mp3`);
          writeFileSync(fichero, audio);
          lista.push(`file '${fichero}'`, `file '${silencio}'`);
        }
      }
      const lista_txt = join(piezas, `${base}.txt`);
      writeFileSync(lista_txt, lista.join("\n"));
      const fichero = `${base}.mp3`;
      execFileSync("ffmpeg", [
        "-loglevel",
        "error",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        lista_txt,
        "-c:a",
        "libmp3lame",
        "-b:a",
        "128k",
        join(salida, fichero),
      ]);
      const servidores = tiempos
        .map((t) => t.servidorMs)
        .filter((t): t is number => t !== null);
      resultados.push({
        candidata,
        fichero,
        primerByteMs: Math.round(mediana(tiempos.map((t) => t.primerByteMs))),
        servidorMs: servidores.length ? Math.round(mediana(servidores)) : null,
      });
      console.log(`[Voces] ${candidata.prueba} · ${candidata.nombre}: listo`);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      resultados.push({
        candidata,
        fichero: null,
        primerByteMs: null,
        servidorMs: null,
        error: mensaje,
      });
      console.error(
        `[Voces] ${candidata.prueba} · ${candidata.nombre}: falló — ${mensaje}`
      );
    }
  }
  rmSync(piezas, { recursive: true, force: true });

  // CSV con los nombres y los tiempos (la clave de la escucha a ciegas).
  writeFileSync(
    join(salida, "resultados.csv"),
    [
      "prueba,candidata,voz,fichero,primer_byte_ms,servidor_ms,error",
      ...resultados.map((r) =>
        [
          r.candidata.prueba,
          r.candidata.nombre,
          r.candidata.voz,
          r.fichero ?? "",
          r.primerByteMs ?? "",
          r.servidorMs ?? "",
          (r.error ?? "").replace(/,/g, ";"),
        ].join(",")
      ),
    ].join("\n")
  );

  // Página de escucha a ciegas: letras al azar por prueba y un botón para
  // descubrir quién es quién después de elegir.
  const secciones = [...new Set(resultados.map((r) => r.candidata.prueba))].map(
    (prueba) => {
      const delGrupo = resultados.filter(
        (r) => r.candidata.prueba === prueba && r.fichero
      );
      const barajadas = [...delGrupo].sort(() => Math.random() - 0.5);
      const filas = barajadas
        .map((r, i) => {
          const letra = String.fromCharCode(65 + i);
          const tiempo =
            r.servidorMs !== null
              ? `${r.servidorMs} ms de síntesis`
              : "sin dato de tiempo";
          return `<li><strong>Voz ${letra}</strong> <audio controls preload="none" src="${escaparHtml(r.fichero!)}"></audio> <span class="clave">${escaparHtml(r.candidata.nombre)} · ${tiempo}</span></li>`;
        })
        .join("\n");
      const fallidas = resultados
        .filter((r) => r.candidata.prueba === prueba && !r.fichero)
        .map(
          (r) =>
            `<li class="clave">${escaparHtml(r.candidata.nombre)}: no disponible (${escaparHtml(r.error ?? "")})</li>`
        )
        .join("\n");
      return `<section><h2>${escaparHtml(prueba)}</h2><ol>${filas}${fallidas}</ol></section>`;
    }
  );
  writeFileSync(
    join(salida, "escucha.html"),
    `<!doctype html><html lang="es"><meta charset="utf-8"><title>Escucha a ciegas</title>
<style>body{font:16px/1.5 system-ui;margin:2rem;max-width:56rem}li{margin:.6rem 0}audio{vertical-align:middle}.clave{display:none;color:#6d28d9;margin-left:.5rem}body.ver .clave{display:inline}</style>
<h1>Escucha a ciegas</h1>
<p>En cada prueba, la misma frase con varias voces: primero el idioma regional y después el castellano, como en un negocio con catalán, euskera o gallego de idioma principal. Elige antes de descubrir quién es quién.</p>
<button onclick="document.body.classList.toggle('ver')">Descubrir quién es quién</button>
${secciones.join("\n")}
</html>`
  );
  console.log(`\n[Voces] Página de escucha: ${join(salida, "escucha.html")}`);
}

main().catch((error) => {
  console.error("[Voces] Laboratorio fallido:", error);
  process.exitCode = 1;
});
