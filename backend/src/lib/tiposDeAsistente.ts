import {
  buildTelnyxAssistantName,
  buildTelnyxVoiceTools,
  CANAL_DE_TOOLS_DE_VOZ,
  type CanalDeTools,
  type TelnyxWebhookToolInput,
} from "./telnyxAssistantPayload.js";
import {
  buildGestorTools,
  CANAL_DE_TOOLS_DEL_GESTOR,
  GESTOR_ASSISTANT_NAME,
} from "./gestorPayload.js";

/**
 * Registro ÚNICO de los tipos de asistente de IA de Alhabla. Cada tipo dice
 * cómo se llama su assistant en Telnyx, por qué canal le llegan las tools
 * (ruta + cabeceras de identidad), qué tools tiene, cómo se sincroniza y por
 * dónde habla. Los builders de payload (telnyxAssistantPayload.ts,
 * gestorPayload.ts) y los sincronizadores (telnyxAgentSync.ts,
 * gestorSync.ts) siguen siendo los que hablan con el adaptador; este
 * registro es el mapa que hay que ampliar para añadir un tipo nuevo — ver
 * AGENTS.md § «Cómo añadir un nuevo tipo de asistente».
 *
 * Solo metadatos y referencias a funciones puras: nada aquí llama a Telnyx
 * ni a Retell, ni cambia lo que se les envía.
 */

export type ClaveDeTipoDeAsistente = "recepcionista" | "demo" | "gestor";

export interface TipoDeAsistente {
  clave: ClaveDeTipoDeAsistente;
  descripcion: string;
  /** Uno por agente de negocio, uno por entorno, o reutiliza otro tipo. */
  ambito: "por_agente" | "plataforma" | "reutiliza_recepcionista";
  /** Canales por los que habla con personas. */
  canales: ReadonlyArray<"voz" | "whatsapp" | "web">;
  /** Proveedor principal y respaldo caliente, si lo hay. */
  proveedores: { principal: "telnyx"; respaldo?: "retell" };
  /** Canal de sus tools de webhook (null si no tiene tools propias). */
  canalDeTools: CanalDeTools | null;
  /** Nombre (o prefijo) del assistant en Telnyx: permite reconciliar y
   * comprobar que un id apunta al tipo esperado. */
  nombreEnTelnyx: (ids: { businessId: string; agentId: string }) => string;
  /** Tools de webhook del tipo (sin las nativas hangup/transfer, que añade
   * el builder del payload). */
  tools: ((baseUrl: string) => TelnyxWebhookToolInput[]) | null;
  /** Dónde vive su sincronización con el proveedor. */
  sincronizacion: string;
}

/** Prefijo de los assistants aislados de la demo pública (los crea
 * scripts/crearAssistantsDemoAislados.ts). */
export const PREFIJO_ASSISTANT_DE_DEMO = "alhabla-demo-";

export const TIPOS_DE_ASISTENTE: Readonly<
  Record<ClaveDeTipoDeAsistente, TipoDeAsistente>
> = {
  recepcionista: {
    clave: "recepcionista",
    descripcion:
      "Recepcionista de un negocio: atiende sus llamadas y, con el mismo assistant, el chat de clientes por WhatsApp (modules/whatsapp/chatCliente.ts).",
    ambito: "por_agente",
    canales: ["voz", "whatsapp"],
    proveedores: { principal: "telnyx", respaldo: "retell" },
    canalDeTools: CANAL_DE_TOOLS_DE_VOZ,
    nombreEnTelnyx: ({ businessId, agentId }) =>
      buildTelnyxAssistantName(businessId, agentId),
    tools: buildTelnyxVoiceTools,
    sincronizacion:
      "lib/telnyxAgentSync.ts (Telnyx, por hash del payload) y lib/agentBootstrap.ts#syncAgentToRetell (Retell, respaldo)",
  },
  demo: {
    clave: "demo",
    descripcion:
      "Demo pública de la landing: assistants aislados por nicho, llamadas web sin autenticar (modules/demo/routes.ts).",
    ambito: "reutiliza_recepcionista",
    canales: ["web"],
    proveedores: { principal: "telnyx" },
    canalDeTools: CANAL_DE_TOOLS_DE_VOZ,
    nombreEnTelnyx: () => PREFIJO_ASSISTANT_DE_DEMO,
    tools: buildTelnyxVoiceTools,
    sincronizacion:
      "scripts/crearAssistantsDemoAislados.ts (una vez); la ruta de demo solo reafirma supports_unauthenticated_web_calls",
  },
  gestor: {
    clave: "gestor",
    descripcion:
      "Gestor: asistente único de plataforma con el que chatea el dueño por WhatsApp (modules/whatsapp/chatDueno.ts, modules/gestor).",
    ambito: "plataforma",
    canales: ["whatsapp"],
    proveedores: { principal: "telnyx" },
    canalDeTools: CANAL_DE_TOOLS_DEL_GESTOR,
    nombreEnTelnyx: () => GESTOR_ASSISTANT_NAME,
    tools: buildGestorTools,
    sincronizacion:
      "lib/gestorSync.ts (reconciliador diario y scripts/manual/sincronizarGestor.mts)",
  },
};
