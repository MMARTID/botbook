/**
 * Verificación de aceptación contra la API real de Telnyx: por cada nivel
 * del catálogo de idiomas (lib/idiomas) y cada voz candidata del
 * laboratorio, crea un assistant temporal con el builder real, comprueba
 * lo que Telnyx guardó, prueba volver a la voz Ultra (Telnyx exige borrar
 * los campos del proveedor anterior) y lo borra todo al terminar, también
 * la app TeXML que Telnyx crea por assistant y no borra con él.
 *
 * Uso (con TELNYX_API_KEY en el entorno):
 *   npx tsx scripts/verificarIdiomas.ts
 */
import { telnyxAiAdapter } from "../src/adapters/telnyx/TelnyxAiAdapter.js";
import { buildTelnyxAssistantPayload } from "../src/lib/telnyxAssistantPayload.js";
import {
  resolverIdiomas,
  saludoDelNegocio,
} from "../src/lib/idiomas/resolver.js";
import { IDIOMAS, type CodigoDeIdioma } from "../src/lib/idiomas/catalogo.js";

interface Caso {
  nombre: string;
  languages: CodigoDeIdioma[];
  voiceLanguage: CodigoDeIdioma;
  /** Voz candidata del laboratorio en lugar de la del catálogo. */
  vozCandidata?: { id: string; ajustes?: Record<string, unknown> };
}

const CASOS: Caso[] = [
  { nombre: "Solo español", languages: ["es-ES"], voiceLanguage: "es-ES" },
  {
    nombre: "Español, inglés y francés",
    languages: ["es-ES", "en-GB", "fr-FR"],
    voiceLanguage: "es-ES",
  },
  {
    nombre: "Catalán principal",
    languages: ["es-ES", "ca-ES"],
    voiceLanguage: "ca-ES",
  },
  {
    nombre: "Euskera principal",
    languages: ["es-ES", "eu-ES"],
    voiceLanguage: "eu-ES",
  },
  {
    nombre: "Gallego principal",
    languages: ["es-ES", "gl-ES"],
    voiceLanguage: "gl-ES",
  },
  {
    nombre: "Catalán con MiniMax",
    languages: ["es-ES", "ca-ES"],
    voiceLanguage: "ca-ES",
    vozCandidata: {
      id: "Minimax.speech-2.8-turbo.Spanish_SereneWoman",
      ajustes: { language_boost: "Catalan" },
    },
  },
  {
    nombre: "Catalán con Azure",
    languages: ["es-ES", "ca-ES"],
    voiceLanguage: "ca-ES",
    vozCandidata: { id: "Azure.ca-ES-JoanaNeural" },
  },
  {
    nombre: "Euskera con Azure",
    languages: ["es-ES", "eu-ES"],
    voiceLanguage: "eu-ES",
    vozCandidata: { id: "Azure.eu-ES-AinhoaNeural" },
  },
  {
    nombre: "Gallego con Azure",
    languages: ["es-ES", "gl-ES"],
    voiceLanguage: "gl-ES",
    vozCandidata: { id: "Azure.gl-ES-SabelaNeural" },
  },
];

const VOZ_ULTRA = IDIOMAS["es-ES"].voces!.femenina.id;

function mensajeDeError(error: unknown): string {
  const detalle = (error as { error?: unknown })?.error;
  return detalle
    ? JSON.stringify(detalle).slice(0, 300)
    : error instanceof Error
      ? error.message
      : String(error);
}

async function verificar(caso: Caso, marca: string): Promise<string[]> {
  const problemas: string[] = [];
  const idiomas = resolverIdiomas({ ...caso, voiceGender: "femenina" });
  const voz = caso.vozCandidata?.id ?? idiomas.voz.id;
  const payload = buildTelnyxAssistantPayload({
    businessId: "verificacion-idiomas",
    agentId: marca,
    businessName: "Verificación de idiomas",
    instructions: "Assistant temporal de verificación de idiomas. Borrar.",
    greeting: saludoDelNegocio(idiomas, "Verificación de idiomas"),
    idiomas,
    voice: voz,
  });
  if (caso.vozCandidata?.ajustes) {
    payload.voiceSettings = {
      ...payload.voiceSettings!,
      ...caso.vozCandidata.ajustes,
    };
  }

  let id: string | null = null;
  try {
    id = (await telnyxAiAdapter.createAssistant(payload)).id;
    const guardado = await telnyxAiAdapter.getAssistantVoiceConfig(id);
    if (guardado.voiceSettings.voice !== voz) {
      problemas.push(`voz guardada ${String(guardado.voiceSettings.voice)}`);
    }
    if (guardado.transcription.model !== payload.transcription?.model) {
      problemas.push(`transcripción ${String(guardado.transcription.model)}`);
    }
    for (const [clave, valor] of Object.entries(payload.voiceSettings ?? {})) {
      if (
        ["language", "language_boost"].includes(clave) &&
        guardado.voiceSettings[clave] !== valor
      ) {
        problemas.push(
          `voice_settings.${clave} guardado ${String(guardado.voiceSettings[clave])}`
        );
      }
    }

    // Volver a la voz Ultra: el adaptador borra `language`; si la voz era
    // de MiniMax, Telnyx puede exigir borrar también `language_boost`.
    try {
      await telnyxAiAdapter.updateAssistant(id, {
        voiceSettings: { voice: VOZ_ULTRA, expressive_mode: true },
      });
      const despues = await telnyxAiAdapter.getAssistantVoiceConfig(id);
      if (despues.voiceSettings.voice !== VOZ_ULTRA) {
        problemas.push("no volvió a la voz Ultra");
      }
    } catch (error) {
      problemas.push(`volver a Ultra: ${mensajeDeError(error)}`);
    }
  } catch (error) {
    problemas.push(`crear: ${mensajeDeError(error)}`);
  } finally {
    if (id) {
      await telnyxAiAdapter.deleteAssistant(id).catch((error) => {
        problemas.push(
          `BORRAR A MANO el assistant ${id}: ${mensajeDeError(error)}`
        );
      });
      await telnyxAiAdapter.deleteTexmlAppOfAssistant(id).catch((error) => {
        problemas.push(
          `BORRAR A MANO la app TeXML de ${id}: ${mensajeDeError(error)}`
        );
      });
    }
  }
  return problemas;
}

async function main() {
  const marca = Date.now().toString(36);
  let fallos = 0;
  for (const [indice, caso] of CASOS.entries()) {
    const problemas = await verificar(caso, `${marca}-${indice}`);
    if (problemas.length === 0) {
      console.log(`OK     ${caso.nombre}`);
    } else {
      fallos++;
      console.log(`FALLO  ${caso.nombre}: ${problemas.join(" · ")}`);
    }
  }
  console.log(
    `\n${CASOS.length - fallos}/${CASOS.length} casos sin problemas.`
  );
  if (fallos > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[Idiomas] Verificación fallida:", error);
  process.exitCode = 1;
});
