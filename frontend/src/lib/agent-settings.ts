import type { AgentSettings } from "@/lib/types";

/** Los mismos valores por defecto que DEFAULT_AGENT_SETTINGS en
 * backend/src/lib/managedAgentPrompt.ts: con el español de principal habla
 * los siete idiomas de sus voces (idiomasQueHabla en el backend). */
export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  version: 1,
  tone: "warm",
  primaryGoal: "bookings",
  responseStyle: "concise",
  escalation: "take_message",
  voiceGender: "femenina",
  languages: ["es-ES", "en-GB", "fr-FR", "de-DE", "it-IT", "pt-PT", "nl-NL"],
  voiceLanguage: "es-ES",
};
