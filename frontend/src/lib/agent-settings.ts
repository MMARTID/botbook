import type { AgentSettings } from "@/lib/types";

/** Los mismos valores por defecto que DEFAULT_AGENT_SETTINGS en
 * backend/src/lib/managedAgentPrompt.ts. */
export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  version: 1,
  tone: "warm",
  primaryGoal: "bookings",
  responseStyle: "concise",
  escalation: "take_message",
  voiceGender: "femenina",
  languages: ["es-ES"],
  voiceLanguage: "es-ES",
};
