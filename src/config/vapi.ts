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

export const VAPI_VOICE_IDS = [
  "Elliot",
  "Clara",
  "Savannah",
  "Nico",
  "Kai",
  "Emma",
  "Sagar",
  "Neil",
  "Layla",
  "Sid",
  "Gustavo",
  "Kylie",
  "Rohan",
  "Lily",
  "Hana",
  "Neha",
  "Cole",
  "Harry",
  "Paige",
  "Spencer",
  "Naina",
  "Leah",
  "Tara",
  "Jess",
  "Leo",
  "Dan",
  "Mia",
  "Zac",
  "Zoe",
] as const;

export const VAPI_LLM_PROVIDERS = [
  "openai",
  "anthropic",
  "custom",
  "groq",
] as const;
export const VAPI_LLM_BY_PROVIDER = {
  openai: ["gpt-4-turbo-preview", "gpt-4o", "gpt-4o-mini"],
  azureOpenai: [
    // GPT-4.1
    "gpt-4.1-2025-04-14",
    "gpt-4.1-mini-2025-04-14",
    "gpt-4.1-nano-2025-04-14",
    // GPT-4o
    "gpt-4o-2024-11-20",
    "gpt-4o-2024-08-06",
    "gpt-4o-2024-05-13",
    "gpt-4o-mini-2024-07-18",
    // GPT-4
    "gpt-4-turbo-2024-04-09",
    "gpt-4-0125-preview",
    "gpt-4-1106-preview",
    "gpt-4-0613",
    // GPT-3.5
    "gpt-35-turbo-0125",
    "gpt-35-turbo-1106",
  ],
  anthropic: ["claude-3-haiku-20240307", "claude-3-5-sonnet-20241022", "claude-haiku-4-5-20251001"],
  google: ["gemini-1.5-flash-002", "gemini-1.5-pro"],
  groq: [
    "llama-3.1-8b-instant",
    "llama-3.1-70b-versatile",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b"
  ],
  xai: ["grok-4.20-0309-non-reasoning", "grok-4.20-0309-reasoning"],

};

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

