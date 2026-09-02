import {
  VAPI_LLM_MODELS,
  VAPI_LLM_PROVIDERS,
  VAPI_STT_MODELS,
  VAPI_STT_PROVIDERS,
  VAPI_VOICE_PROVIDERS,
} from "../../config/vapi.js";

type VoiceProvider = (typeof VAPI_VOICE_PROVIDERS)[number];
type LlmProvider = (typeof VAPI_LLM_PROVIDERS)[number];
type LlmModel = (typeof VAPI_LLM_MODELS)[number];
type SttProvider = (typeof VAPI_STT_PROVIDERS)[number];
type SttModel = (typeof VAPI_STT_MODELS)[number];

// Vapi API request types
export interface VapiCreateAssistantRequest {
  name: string;
  firstMessage?: string;
  firstMessageMode?: "assistant-speaks-first" | "assistant-speaks-first-with-model-generated-message" | "assistant-waits-for-user";
  system?: string;
  voiceId?: string;
  voice?: {
    provider: VoiceProvider | string;
    voiceId?: string;
    name?: string;
    model?: string;
    fallbackPlan?: any;
    reduceLatency?: boolean;
    pauseBetweenBrackets?: boolean;
    phonemizeBetweenBrackets?: boolean;
  };
  model?: {
    provider: LlmProvider | string;
    model?: LlmModel | string;
    temperature?: number;
    knowledgeBase?: {
      fileIds: string[];
      provider: "google";
    };
    tools?: Array<{
      type?: string;
      knowledgeBases?: Array<{
        name?: string;
        provider?: string;
        model?: string;
        description?: string;
        fileIds?: string[];
      }>;
      [key: string]: unknown;
    }>;
    messages?: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }>;
  };
  transcriber?: {
    provider: SttProvider | string;
    model?: SttModel | string;
    language?: string;
    formatTurns?: boolean;
    speechModel?: string;
    fallbackPlan?: {
      autoFallback?: {
        enabled?: boolean;
      };
      transcribers?: Array<{
        model?: string;
        language?: string;
        provider?: string;
        confidenceThreshold?: number;
      }>;
    } | any;
    languageDetection?: boolean;
    confidenceThreshold?: number;
    disablePartialTranscripts?: boolean;
  };
  backgroundDenoisingEnabled?: boolean;
  backgroundSound?: string;
  startSpeakingPlan?: {
    smartEndpointingPlan?: {
      provider?: string;
    };
  } | any;
  server?: {
    url: string;
    timeoutSeconds?: number;
  };
}
export interface VapiStartedEvent{
  message:{
    type: "assistant.started";
    timestamp: number;
  }
  call: VapiCall;
  assistant: VapiAssistant;
  timestamp?: string;
}
// Vapi webhook event types
export interface VapiFunctionCallEvent {
  message: {
    type: "function-call";
    toolUse: {
      type: "function";
      function: {
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
      };
      result?: Record<string, unknown>;
      id?: string;
    };
  };
  call: VapiCall;
  assistant: VapiAssistant;
  timestamp?: string;
}

export interface VapiEndOfCallReportEvent {
  message: {
    type: "end-of-call-report";
    callStatus: "completed" | "failed" | "forwarded";
    endedReason?: string;
    summary?: string;
    transcript?: string;
    recordingUrl?: string;
    cost?: number;
    duration?: number;
    messages?: Array<{
      role: "user" | "assistant";
      message: string;
      timestamp?: number;
    }>;
  };
  call: VapiCall;
  assistant: VapiAssistant;
  timestamp?: string;
}

export interface VapiStatusUpdateEvent {
  message: {
    type: "status-update";
    status: "queued" | "ringing" | "active" | "ended" | "in-progress" ;
    reason?: string;
  };
  call: VapiCall;
  assistant: VapiAssistant;
  timestamp?: string;
}

export type VapiWebhookEvent =
  | VapiFunctionCallEvent
  | VapiEndOfCallReportEvent
  | VapiStatusUpdateEvent;

export interface VapiCall {
  id: string;
  phoneNumberId?: string;
  phoneNumber?: string;
  customerId?: string;
  assistantId?: string;
  startedAt?: string;
  endedAt?: string;
  duration?: number;
  cost?: number;
  messages?: Array<{
    role: "user" | "assistant";
    message: string;
    timestamp?: number;
  }>;
}

export interface VapiAssistant {
  id: string;
  name?: string;
  model?: {
    provider: string;
    model: string;
    knowledgeBase?: {
      fileIds?: string[];
      provider?: string;
    };
    tools?: Array<{
      type?: string;
      knowledgeBases?: Array<{
        name?: string;
        provider?: string;
        model?: string;
        description?: string;
        fileIds?: string[];
      }>;
    }>;
  };
}

export interface VapiPhoneNumber {
  id: string;
  orgId?: string;
  createdAt?: string;
  updatedAt?: string;
  assistantId?: string;
  number: string;
  name?: string;
  provider?: string;
}

export interface VapiCreatePhoneNumberRequest {
  provider: "twilio" | "vonage" | "vapi" | string;
  number: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  assistantId?: string;
  name?: string;
}
