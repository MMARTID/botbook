/**
 * Laboratorio de la voz Ultra en catalán: ¿aplica un diccionario de
 * pronunciación de Telnyx, y hasta dónde llega? Paso 1 del plan de la Ultra
 * en catalán (AGENTS.md § «Idiomas de atención y voz en Telnyx»).
 *
 * Crea dos diccionarios temporales y sintetiza cada frase con la voz Ultra
 * sin y con diccionario:
 * - Canarios: alias absurdos («dijous» → «pingüino») y un IPA que solo usa
 *   sonidos del castellano («dimarts» → /maɾiˈposa/). Whisper transcribe
 *   cada audio y el script dice solo si la palabra canario suena: así se
 *   sabe, sin depender del oído, si el diccionario se aplica, si el IPA se
 *   respeta y cómo empareja (dentro de otra palabra, sin acento, con el
 *   apóstrofo curvo, con guiones).
 * - Sonidos del catalán que el castellano no tiene (ʃ ʒ ə ɛ ɔ z ʎ ɲ), la θ
 *   que la voz castellana pone donde el catalán dice s y el saludo como frase
 *   entera: esto lo decide el oído, en la página de escucha que genera.
 * Borra los diccionarios al terminar. Solo sintetiza: no toca assistants.
 *
 * Uso (con TELNYX_API_KEY en el entorno):
 *   npx tsx scripts/laboratorioDeUltra.ts [--salida <directorio>] [--voz <id>]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  telnyxAiAdapter,
  type EntradaDeDiccionario,
} from "../src/adapters/telnyx/TelnyxAiAdapter.js";

const BLANCA = "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6";

interface Prueba {
  nombre: string;
  texto: string;
  diccionario: "canarios" | "sonidos";
  /** Palabra que la transcripción debe contener si el diccionario se aplica
   * (canarios); sin ella, la prueba es de oído. */
  canario?: string;
  /** Lo que se espera ver: si el canario debe sonar o no. */
  esperado?: boolean;
}

const CANARIOS: EntradaDeDiccionario[] = [
  { texto: "dijous", alias: "pingüino" },
  { texto: "ara", alias: "canguro" },
  // «jirafa» no: Whisper la escribe «girafa» y el canario no se detecta.
  { texto: "què", alias: "elefante" },
  { texto: "d'acord", alias: "tortuga" },
  { texto: "vint-i-cinc", alias: "delfín" },
  { texto: "dimarts", ipa: "maɾiˈposa" },
];

const SONIDOS: EntradaDeDiccionario[] = [
  { texto: "caixa", ipa: "ˈkaʃə" },
  { texto: "pujar", ipa: "puˈʒa" },
  { texto: "pentinat", ipa: "pəntiˈnat" },
  { texto: "dona", ipa: "ˈdɔnə" },
  { texto: "rosa", ipa: "ˈrɔzə" },
  { texto: "llum", ipa: "ʎum" },
  { texto: "any", ipa: "aɲ" },
  { texto: "cel", ipa: "sɛl" },
  { texto: "gràcies", ipa: "ˈɡɾasiəs" },
  { texto: "cinc", ipa: "siŋ" },
  { texto: "dotze", ipa: "ˈdodzə" },
  { texto: "En què et puc ajudar", ipa: "ən ˈkɛ ət ˈpuk əʒuˈða" },
];

const PRUEBAS: Prueba[] = [
  {
    nombre: "Alias: palabra entera",
    texto: "Tinc lloc dijous a la tarda.",
    diccionario: "canarios",
    canario: "pingüino",
    esperado: true,
  },
  {
    nombre: "Alias: «ara» suelta",
    texto: "Ara mateix.",
    diccionario: "canarios",
    canario: "canguro",
    esperado: true,
  },
  {
    nombre: "Alias: «ara» dentro de «parar»",
    texto: "Vull parar la reserva.",
    diccionario: "canarios",
    canario: "canguro",
  },
  {
    nombre: "Alias: «què» con acento",
    texto: "Què vols?",
    diccionario: "canarios",
    canario: "elefante",
    esperado: true,
  },
  {
    nombre: "Alias: «que» sin acento",
    texto: "Que vols?",
    diccionario: "canarios",
    canario: "elefante",
  },
  {
    nombre: "Alias: apóstrofo recto",
    texto: "D'acord, perfecte.",
    diccionario: "canarios",
    canario: "tortuga",
    esperado: true,
  },
  {
    nombre: "Alias: apóstrofo curvo",
    texto: "D’acord, perfecte.",
    diccionario: "canarios",
    canario: "tortuga",
  },
  {
    nombre: "Alias: con guiones",
    texto: "Són vint-i-cinc euros.",
    diccionario: "canarios",
    canario: "delfín",
    esperado: true,
  },
  {
    nombre: "IPA con sonidos del castellano",
    texto: "Dimarts al matí.",
    diccionario: "canarios",
    canario: "mariposa",
    esperado: true,
  },
  {
    nombre: "IPA: ʃ ʒ ə ɛ ɔ z ʎ ɲ",
    texto: "La caixa i el cel. Pujar, pentinat, dona, rosa, llum, any.",
    diccionario: "sonidos",
  },
  {
    nombre: "IPA: la θ de la voz castellana",
    texto: "Gràcies. Són cinc o dotze.",
    diccionario: "sonidos",
  },
  {
    nombre: "IPA: el saludo como frase entera",
    texto: "Hola, gràcies per trucar. En què et puc ajudar?",
    diccionario: "sonidos",
  },
];

/** Telnyx devuelve a veces 502, 429 o se queda sin responder: reintentar
 * con espera. */
async function conReintentos<T>(intento: () => Promise<T>): Promise<T> {
  for (let vez = 1; ; vez++) {
    try {
      return await intento();
    } catch (error) {
      const estado = (error as { status?: number }).status;
      const pasajero =
        estado === undefined || [429, 500, 502, 503, 504].includes(estado);
      if (vez >= 4 || !pasajero) {
        throw error;
      }
      console.log(
        `[Ultra] Telnyx devolvió ${estado}; reintento en ${20 * vez} s`
      );
      await new Promise((resuelve) => setTimeout(resuelve, 20_000 * vez));
    }
  }
}

function argumento(nombre: string): string | undefined {
  const indice = process.argv.indexOf(nombre);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

/** Sin acentos ni mayúsculas, para buscar el canario en la transcripción. */
const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const escapar = (texto: string) =>
  texto.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!
  );

async function main() {
  const salida =
    argumento("--salida") ??
    join(process.cwd(), "..", ".laboratorio-de-voces", "ultra");
  const voz = argumento("--voz") ?? BLANCA;
  mkdirSync(salida, { recursive: true });
  const marca = Date.now().toString(36);

  const creados: string[] = [];
  try {
    const canarios = await telnyxAiAdapter.crearDiccionario(
      `alhabla-prueba-canarios-${marca}`,
      CANARIOS
    );
    creados.push(canarios.id);
    const sonidos = await telnyxAiAdapter.crearDiccionario(
      `alhabla-prueba-sonidos-${marca}`,
      SONIDOS
    );
    creados.push(sonidos.id);
    const ids = { canarios: canarios.id, sonidos: sonidos.id };

    const filas: string[] = [];
    let fallos = 0;
    for (const [indice, prueba] of PRUEBAS.entries()) {
      const resultado: Record<"sin" | "con", string> = { sin: "", con: "" };
      for (const modo of ["sin", "con"] as const) {
        const { audio } = await conReintentos(() =>
          telnyxAiAdapter.sintetizarVoz({
            texto: prueba.texto,
            voz,
            ...(modo === "con" ? { diccionario: ids[prueba.diccionario] } : {}),
          })
        );
        const fichero = `${indice}-${modo}.mp3`;
        writeFileSync(join(salida, fichero), audio);
        // Sin transcripción la prueba sigue valiendo de oído.
        resultado[modo] = await conReintentos(() =>
          telnyxAiAdapter.transcribirAudio({
            audio,
            nombre: fichero,
            idioma: "es",
          })
        ).catch(() => "(sin transcripción: Telnyx no respondió)");
      }
      let veredicto = "de oído";
      if (prueba.canario) {
        const suenaSin = normalizar(resultado.sin).includes(
          normalizar(prueba.canario)
        );
        const suenaCon = normalizar(resultado.con).includes(
          normalizar(prueba.canario)
        );
        veredicto = suenaSin
          ? "el canario suena también sin diccionario: no concluye"
          : suenaCon
            ? "SE APLICA"
            : "no se aplica";
        if (
          prueba.esperado !== undefined &&
          !suenaSin &&
          suenaCon !== prueba.esperado
        ) {
          fallos++;
        }
      }
      console.log(
        `${String(indice).padStart(2)} ${prueba.nombre}: ${veredicto}\n     sin: ${resultado.sin.trim()}\n     con: ${resultado.con.trim()}`
      );
      filas.push(`
      <section>
        <h2>${escapar(prueba.nombre)} <span class="veredicto">${escapar(veredicto)}</span></h2>
        <p class="texto">«${escapar(prueba.texto)}»</p>
        <div class="pareja">
          <figure><figcaption>Sin diccionario</figcaption><audio controls preload="none" src="ultra/${indice}-sin.mp3"></audio><p>${escapar(resultado.sin.trim())}</p></figure>
          <figure><figcaption>Con diccionario</figcaption><audio controls preload="none" src="ultra/${indice}-con.mp3"></audio><p>${escapar(resultado.con.trim())}</p></figure>
        </div>
      </section>`);
    }

    writeFileSync(
      join(salida, "..", "ultra.html"),
      `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>La Ultra en catalán</title>
<style>
  body { margin:0; font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color:#0a0a0a; background:#fafafa; }
  main { max-width:960px; margin:0 auto; padding:24px 16px 64px; }
  h1 { font-size:24px; margin:0 0 4px; } h2 { font-size:16px; margin:0 0 4px; }
  section { background:#fff; border:1px solid #e5e5e5; border-radius:14px; padding:14px; margin-top:12px; }
  .texto { color:#52525b; margin:0 0 8px; } .veredicto { font-weight:400; color:#6d28d9; font-size:13px; margin-left:8px; }
  .pareja { display:grid; gap:10px; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); }
  figure { margin:0; } figcaption { font-size:13px; color:#52525b; } figure p { font-size:13px; color:#52525b; margin:4px 0 0; }
  audio { width:100%; height:36px; }
</style></head><body><main>
<h1>La voz Ultra en catalán</h1>
<p class="texto">Voz ${escapar(voz)}. Cada frase, sin y con el diccionario de pronunciación. Debajo de cada audio, lo que entendió Whisper en castellano.</p>
${filas.join("")}
</main></body></html>`
    );
    console.log(
      `\n[Ultra] Página de escucha: ${join(salida, "..", "ultra.html")}`
    );
    if (fallos > 0) {
      console.log(`[Ultra] ${fallos} pruebas no dieron lo esperado.`);
      process.exitCode = 1;
    }
  } finally {
    for (const id of creados) {
      await telnyxAiAdapter.borrarDiccionario(id).catch((error) => {
        console.error(
          `[Ultra] BORRAR A MANO el diccionario ${id}: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }
  }
}

main().catch((error) => {
  console.error("[Ultra] Laboratorio fallido:", error);
  process.exitCode = 1;
});
