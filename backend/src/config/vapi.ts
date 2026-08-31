// src/config/vapi.ts

export const VAPI_VOICE_PROVIDERS = [
  "vapi",
  "11labs",
  "hume",
  "azure",
  "google",
  "openai",
  "deepgram",
  "cartesia",
  "custom",
] as const;

export const VAPI_LLM_PROVIDERS = [
  "openai",
  "anthropic",
  "custom",
  "groq",
] as const;

export const VAPI_LLM_MODELS = [
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

export const VAPI_STT_PROVIDERS = [
  "deepgram",
  "assembly-ai",
  "azure",
  "google",
  "openai",
  "soniox",
  "talkscriber",
] as const;

export const VAPI_STT_MODELS = [
  "nova-2",
  "nova-2-phonecall",
  "flux-general-en",
  "whisper-1",
] as const;

