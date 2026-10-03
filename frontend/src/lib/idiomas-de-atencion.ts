import type { AgentLanguage, AgentSettings } from "@/lib/types";

/** Idiomas de atención en el orden en que los guarda el backend
 * (AGENT_LANGUAGES en backend/src/lib/managedAgentPrompt.ts): mismo orden,
 * mismos ajustes, y la barra de guardar no aparece sin cambios reales. */
export const IDIOMAS_DE_ATENCION: Array<{ valor: AgentLanguage; nombre: string }> = [
  { valor: "es-ES", nombre: "Español" },
  { valor: "en-GB", nombre: "Inglés" },
  { valor: "fr-FR", nombre: "Francés" },
  { valor: "ca-ES", nombre: "Catalán" },
  { valor: "eu-ES", nombre: "Euskera" },
  { valor: "gl-ES", nombre: "Gallego" },
];

export function nombreDeIdioma(idioma: AgentLanguage): string {
  return IDIOMAS_DE_ATENCION.find((opcion) => opcion.valor === idioma)?.nombre ?? idioma;
}

/** Catalán, euskera y gallego: activarlos es hablarlos, con una voz de
 * Soniox que habla todos los idiomas del negocio y saluda en uno de ellos.
 * Las mismas reglas que el backend (usaSoniox, normalizarIdiomaPrincipal). */
const IDIOMAS_DE_SONIOX: AgentLanguage[] = ["ca-ES", "eu-ES", "gl-ES"];

export function esIdiomaDeSoniox(idioma: AgentLanguage): boolean {
  return IDIOMAS_DE_SONIOX.includes(idioma);
}

export function usaSoniox(idiomas: AgentLanguage[]): boolean {
  return idiomas.some(esIdiomaDeSoniox);
}

/**
 * Idiomas en el orden guardado y un idioma principal válido: uno activo y,
 * con catalán, euskera o gallego activos, uno de ellos.
 */
export function normalizarIdiomas(
  idiomas: AgentLanguage[],
  principal: AgentLanguage
): Pick<AgentSettings, "languages" | "voiceLanguage"> {
  const languages = IDIOMAS_DE_ATENCION.map((opcion) => opcion.valor).filter((valor) =>
    idiomas.includes(valor)
  );
  let voiceLanguage = languages.includes(principal) ? principal : "es-ES";
  if (usaSoniox(languages) && !esIdiomaDeSoniox(voiceLanguage)) {
    voiceLanguage = languages.find(esIdiomaDeSoniox)!;
  }
  return { languages, voiceLanguage };
}

/** «catalán», «catalán y gallego», «catalán, euskera y gallego». */
function enumerar(nombres: string[]): string {
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** Qué hace al descolgar, según la configuración y no un texto fijo. */
export function entradillaDeIdiomas(
  settings: Pick<AgentSettings, "languages" | "voiceLanguage">
): string {
  if (settings.languages.length === 1) return "Atiende siempre en español.";
  return `Saluda en ${nombreDeIdioma(settings.voiceLanguage).toLowerCase()} y sigue en el idioma de quien llama.`;
}

/**
 * Lo que cambia con catalán, euskera o gallego, para que el dueño no se
 * sorprenda en la primera llamada: la voz es otra y menos expresiva.
 */
export function avisoDeIdiomas(
  settings: Pick<AgentSettings, "languages" | "voiceLanguage">
): string | null {
  const propios = settings.languages.filter(esIdiomaDeSoniox);
  if (propios.length === 0) return null;
  const nombres = enumerar(propios.map((idioma) => nombreDeIdioma(idioma).toLowerCase()));
  return `Con ${nombres} ${propios.length === 1 ? "activo" : "activos"} atiende con otra voz, que habla todos tus idiomas pero suena algo menos expresiva que la de siempre.`;
}
