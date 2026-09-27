// src/config/voiceAgent.ts
//
// Catálogo genérico de proveedores/modelos de voz, LLM y STT para el modelo
// Agent — usado por PATCH /agents/:id para validar y tipar los campos
// voiceProvider/llmProvider/sttProvider, independientemente del orquestador
// (Retell/Telnyx) que use el negocio.

export const VOICE_PROVIDERS = [
  "11labs",
  "hume",
  "azure",
  "google",
  "openai",
  "deepgram",
  "cartesia",
  "custom",
] as const;

export const LLM_PROVIDERS = ["openai", "anthropic", "custom", "groq"] as const;


export const STT_PROVIDERS = [
  "deepgram",
  "assembly-ai",
  "azure",
  "google",
  "openai",
  "soniox",
  "talkscriber",
] as const;

