import type { AgentLanguage, AgentSettings } from "@/lib/types";

/** Catalán, euskera y gallego: ninguna voz Ultra los pronuncia bien, así
 * que los habla una voz de Soniox (backend/src/lib/managedAgentPrompt.ts). */
const IDIOMAS_SIN_VOZ_ULTRA: AgentLanguage[] = ["ca-ES", "eu-ES", "gl-ES"];

const NOMBRE_DE_IDIOMA: Record<AgentLanguage, string> = {
  "es-ES": "español",
  "en-GB": "inglés",
  "fr-FR": "francés",
  "ca-ES": "catalán",
  "eu-ES": "euskera",
  "gl-ES": "gallego",
};

/** «catalán», «catalán y gallego», «catalán, euskera y gallego». */
function enumerar(nombres: string[]): string {
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * Lo que cambia con catalán, euskera o gallego, para que el dueño no se
 * sorprenda: como idioma principal saluda en él con otra voz; si solo están
 * activos, los entiende pero contesta en español.
 */
export function avisoDeIdiomas(
  settings: Pick<AgentSettings, "languages" | "voiceLanguage">
): string | null {
  if (IDIOMAS_SIN_VOZ_ULTRA.includes(settings.voiceLanguage)) {
    const idioma = NOMBRE_DE_IDIOMA[settings.voiceLanguage];
    return `Con ${idioma} como idioma principal saluda en ${idioma} y atiende con una voz que habla todos tus idiomas.`;
  }
  const entendidos = settings.languages.filter((language) =>
    IDIOMAS_SIN_VOZ_ULTRA.includes(language)
  );
  if (entendidos.length === 0) return null;
  const nombres = enumerar(entendidos.map((language) => NOMBRE_DE_IDIOMA[language]));
  return entendidos.length === 1
    ? `Entiende ${nombres}, pero contesta en español. Para que lo hable, elígelo como idioma principal.`
    : `Entiende ${nombres}, pero contesta en español. Para que hable uno de ellos, elígelo como idioma principal.`;
}
