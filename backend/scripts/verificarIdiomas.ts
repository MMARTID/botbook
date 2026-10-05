/**
 * Verificación de aceptación contra la API real de Telnyx: por cada nivel
 * del catálogo de idiomas (lib/idiomas) y cada voz candidata del
 * laboratorio, crea un assistant temporal con el builder real, comprueba
 * lo que Telnyx guardó, prueba volver a la voz Ultra (Telnyx exige borrar
 * los campos del proveedor anterior y fusiona los que no se borran) y lo
 * borra todo al terminar, también la app TeXML que Telnyx crea por
 * assistant y no borra con él. El caso «de catalán a español» manda el
 * payload completo de español sobre un assistant de catalán, como al
 * cambiar de idioma principal, y compara con un assistant nuevo. Los casos
 * con `espera` comprueban además, antes de crear nada, que el resolver
 * elige la voz, el idioma de Soniox y la transcripción acordados (saludo
 * en castellano con catalán activo, saludo en alemán, una voz elegida).
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
  /** La voz que eligió el dueño (AgentSettings.voz). */
  voz?: string;
  /** Voz candidata del laboratorio en lugar de la del catálogo. */
  vozCandidata?: { id: string; ajustes?: Record<string, unknown> };
  /** Tras crearlo, pasarlo a estos idiomas con el payload completo. */
  cambiarA?: { languages: CodigoDeIdioma[]; voiceLanguage: CodigoDeIdioma };
  /** Lo que tiene que salir del resolver (decisiones del 2026-10-05). */
  espera?: {
    voz: string;
    /** `voice_settings.language` (solo las de Soniox lo llevan). */
    idiomaDeLaVoz?: string;
    transcripcion: string;
    saludo: string;
  };
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
  // Las voces de MiniMax ya no están en el catálogo (2026-10-05), pero este
  // caso vigila que el adaptador borre su `language_boost` al volver a la
  // Ultra: Telnyx lo conservaba sin dar error.
  {
    nombre: "De catalán con MiniMax a español",
    languages: ["es-ES", "ca-ES"],
    voiceLanguage: "ca-ES",
    vozCandidata: {
      id: "Minimax.speech-2.8-turbo.Spanish_SereneWoman",
      ajustes: { language_boost: "Catalan" },
    },
    cambiarA: { languages: ["es-ES"], voiceLanguage: "es-ES" },
  },
  {
    nombre: "De español a catalán",
    languages: ["es-ES"],
    voiceLanguage: "es-ES",
    cambiarA: { languages: ["es-ES", "ca-ES"], voiceLanguage: "ca-ES" },
  },
  // Idiomas y voces del 2026-10-05: saludo y familia de voces por separado.
  {
    nombre: "Saludo en castellano con catalán activo",
    languages: ["es-ES", "ca-ES"],
    voiceLanguage: "es-ES",
    espera: {
      voz: "Soniox.tts-rt-v2.Marta",
      idiomaDeLaVoz: "ca",
      transcripcion: "soniox/stt-rt-v5",
      saludo:
        "Hola, gracias por llamar a Verificación de idiomas. ¿En qué te puedo ayudar?",
    },
  },
  {
    nombre: "Saludo en alemán",
    languages: ["es-ES", "de-DE"],
    voiceLanguage: "de-DE",
    espera: {
      voz: "Telnyx.Ultra.38aabb6a-f52b-4fb0-a3d1-988518f4dc06", // Alina
      transcripcion: "deepgram/flux",
      saludo:
        "Hallo, vielen Dank für Ihren Anruf bei Verificación de idiomas. Wie kann ich Ihnen helfen?",
    },
  },
  {
    nombre: "Español con una voz que no es la de por defecto (Lara)",
    languages: ["es-ES"],
    voiceLanguage: "es-ES",
    voz: "Telnyx.Ultra.85b356c1-c638-404d-b986-f54a53d957d6",
    espera: {
      voz: "Telnyx.Ultra.85b356c1-c638-404d-b986-f54a53d957d6",
      transcripcion: "deepgram/flux",
      saludo:
        "Hola, gracias por llamar a Verificación de idiomas. ¿En qué te puedo ayudar?",
    },
  },
];

const VOZ_ULTRA = IDIOMAS["es-ES"].voces![0].id;

/** Lo que quede de Soniox o de MiniMax en un assistant que ya no los usa. */
function restos(guardado: {
  voiceSettings: Record<string, unknown>;
  transcription: Record<string, unknown>;
  interruptionSettings: Record<string, unknown>;
}): string[] {
  const ajustes = (guardado.transcription.settings ?? {}) as Record<
    string,
    unknown
  >;
  const plan = (guardado.interruptionSettings.start_speaking_plan ??
    {}) as Record<string, unknown>;
  return [
    ["voice_settings.language", guardado.voiceSettings.language],
    ["voice_settings.language_boost", guardado.voiceSettings.language_boost],
    ["transcription.settings.language_hints", ajustes.language_hints],
    [
      "transcription.settings.enable_endpoint_detection",
      ajustes.enable_endpoint_detection,
    ],
    [
      "transcription.settings.max_endpoint_delay_ms",
      ajustes.max_endpoint_delay_ms,
    ],
    [
      "interruption_settings.start_speaking_plan.transcription_endpointing_plan",
      plan.transcription_endpointing_plan,
    ],
  ]
    .filter(([, valor]) => valor !== null && valor !== undefined)
    .map(([campo, valor]) => `queda ${campo}=${JSON.stringify(valor)}`);
}

function payloadBase(
  idiomas: ReturnType<typeof resolverIdiomas>,
  marca: string
) {
  return {
    businessId: "verificacion-idiomas",
    agentId: marca,
    businessName: "Verificación de idiomas",
    instructions: "Assistant temporal de verificación de idiomas. Borrar.",
    greeting: saludoDelNegocio(idiomas, "Verificación de idiomas"),
    idiomas,
  };
}

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
    ...payloadBase(idiomas, marca),
    voice: voz,
  });
  if (caso.vozCandidata?.ajustes) {
    payload.voiceSettings = {
      ...payload.voiceSettings!,
      ...caso.vozCandidata.ajustes,
    };
  }
  if (caso.espera) {
    const obtenido = {
      voz,
      idiomaDeLaVoz: payload.voiceSettings?.language,
      transcripcion: payload.transcription?.model,
      saludo: payload.greeting,
    };
    for (const [campo, esperado] of Object.entries(caso.espera)) {
      const valor = obtenido[campo as keyof typeof obtenido];
      if (valor !== esperado) {
        problemas.push(
          `el resolver da ${campo}=${JSON.stringify(valor)} (se esperaba ${JSON.stringify(esperado)})`
        );
      }
    }
    if (
      caso.espera.idiomaDeLaVoz === undefined &&
      obtenido.idiomaDeLaVoz !== undefined
    ) {
      problemas.push(
        `voice_settings.language=${JSON.stringify(obtenido.idiomaDeLaVoz)} en una voz Ultra`
      );
    }
    if (problemas.length > 0) return problemas;
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

    if (caso.cambiarA) {
      // Como al cambiar de idioma principal: el payload completo del nuevo.
      const nuevo = resolverIdiomas({
        ...caso.cambiarA,
        voiceGender: "femenina",
      });
      const destino = buildTelnyxAssistantPayload({
        ...payloadBase(nuevo, marca),
        voice: nuevo.voz.id,
      });
      try {
        await telnyxAiAdapter.updateAssistant(id, {
          greeting: destino.greeting,
          voiceSettings: destino.voiceSettings,
          transcription: destino.transcription,
          interruptionSettings: destino.interruptionSettings,
        });
        const despues = await telnyxAiAdapter.getAssistantVoiceConfig(id);
        if (despues.voiceSettings.voice !== nuevo.voz.id) {
          problemas.push("no cambió de voz");
        }
        if (despues.transcription.model !== destino.transcription?.model) {
          problemas.push(
            `transcripción tras el cambio ${String(despues.transcription.model)}`
          );
        }
        const umbral = (despues.interruptionSettings as Record<string, unknown>)
          .interrupt_prediction_threshold;
        problemas.push(
          ...(destino.transcription?.model === "deepgram/flux"
            ? restos(despues)
            : umbral !== null && umbral !== undefined
              ? [`queda interrupt_prediction_threshold=${String(umbral)}`]
              : [])
        );
      } catch (error) {
        problemas.push(`cambiar de idioma: ${mensajeDeError(error)}`);
      }
    } else {
      // Volver a la voz Ultra: el adaptador borra `language` y
      // `language_boost` (Telnyx los conserva si no se borran).
      try {
        await telnyxAiAdapter.updateAssistant(id, {
          voiceSettings: { voice: VOZ_ULTRA, expressive_mode: true },
        });
        const despues = await telnyxAiAdapter.getAssistantVoiceConfig(id);
        if (despues.voiceSettings.voice !== VOZ_ULTRA) {
          problemas.push("no volvió a la voz Ultra");
        }
        problemas.push(
          ...restos(despues).filter((resto) => resto.includes("voice_settings"))
        );
      } catch (error) {
        problemas.push(`volver a Ultra: ${mensajeDeError(error)}`);
      }
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
