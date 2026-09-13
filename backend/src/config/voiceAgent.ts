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

export const LLM_MODELS = [
  "gpt-4-turbo-preview",
  "gpt-4o",
  "gpt-4o-mini",
  "claude-3-haiku-20240307",
  "claude-3-5-sonnet-20241022",
  "llama-3.1-8b-instant",
  "llama-3.1-70b-versatile",
  "gemini-1.5-flash-002",
  "gemini-1.5-pro",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
] as const;

export const STT_PROVIDERS = [
  "deepgram",
  "assembly-ai",
  "azure",
  "google",
  "openai",
  "soniox",
  "talkscriber",
] as const;

export const STT_MODELS = [
  "nova-2",
  "nova-2-phonecall",
  "flux-general-en",
  "whisper-1",
] as const;
