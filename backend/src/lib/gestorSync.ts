import { telnyxAiAdapter } from "../adapters/telnyx/TelnyxAiAdapter.js";
import { getPublicWebhookBaseUrl } from "./serverUrl.js";
import { errorMessage } from "./logUtils.js";
import { buildGestorAssistantPayload } from "./gestorPayload.js";

/**
 * Mantiene el Gestor (assistant único de plataforma, lib/gestorPayload.ts)
 * igual al payload del código. Lo llama el reconciliador diario (y el
 * deploy lo fuerza cuando cambia el payload) y el script
 * scripts/manual/sincronizarGestor.mts (`--crear` la primera vez por
 * entorno). Compara lo que importa — instrucciones, modelo y la firma de las
 * tools (nombre, url, cabeceras, descripción, parámetros) — y no el JSON
 * entero que devuelve Telnyx, que trae valores por defecto que no enviamos.
 */

export type EstadoDelGestor =
  | { estado: "sin_id" }
  | { estado: "sin_base_url" }
  | { estado: "al_dia"; id: string }
  | { estado: "actualizado"; id: string }
  | { estado: "creado"; id: string }
  | { estado: "error"; id: string | null; motivo: string };

interface FirmaDeTool {
  name: string;
  url: string;
  description: string;
  headers: Array<{ name: string; value: string }>;
  required: string[];
  properties: string[];
}

function firmaDeTools(tools: unknown[] | undefined): FirmaDeTool[] {
  return (tools ?? [])
    .map((tool) => {
      const t = tool as {
        type?: string;
        webhook?: {
          name?: string;
          url?: string;
          description?: string;
          headers?: Array<{ name?: string; value?: string }>;
          body_parameters?: {
            required?: string[];
            properties?: Record<string, unknown>;
          };
        };
      };
      if (t.type !== "webhook" || !t.webhook) return null;
      return {
        name: t.webhook.name ?? "",
        url: t.webhook.url ?? "",
        description: t.webhook.description ?? "",
        headers: (t.webhook.headers ?? [])
          .map((h) => ({ name: h.name ?? "", value: h.value ?? "" }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        required: [...(t.webhook.body_parameters?.required ?? [])].sort(),
        properties: Object.keys(
          t.webhook.body_parameters?.properties ?? {}
        ).sort(),
      };
    })
    .filter((x): x is FirmaDeTool => x !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function gestorAlDia(
  remoto: { instructions: string; model?: string; tools?: unknown[] },
  local: { instructions: string; model?: string; tools?: unknown[] }
): boolean {
  return (
    remoto.instructions === local.instructions &&
    (local.model === undefined || remoto.model === local.model) &&
    JSON.stringify(firmaDeTools(remoto.tools)) ===
      JSON.stringify(firmaDeTools(local.tools))
  );
}

export async function sincronizarGestor(
  opciones: {
    crear?: boolean;
  } = {}
): Promise<EstadoDelGestor> {
  const baseUrl = getPublicWebhookBaseUrl();
  if (!baseUrl) {
    return { estado: "sin_base_url" };
  }
  const payload = buildGestorAssistantPayload(baseUrl);
  const id = process.env.TELNYX_GESTOR_ASSISTANT_ID?.trim() || null;

  try {
    if (!id) {
      if (!opciones.crear) {
        return { estado: "sin_id" };
      }
      const creado = await telnyxAiAdapter.createAssistant(payload);
      console.log(`[Gestor] Assistant creado en Telnyx: ${creado.id}`);
      return { estado: "creado", id: creado.id };
    }
    const remoto = await telnyxAiAdapter.getAssistant(id);
    if (gestorAlDia(remoto, payload)) {
      return { estado: "al_dia", id };
    }
    await telnyxAiAdapter.updateAssistant(id, payload);
    console.log(
      `[Gestor] Assistant ${id} actualizado con el payload del código`
    );
    return { estado: "actualizado", id };
  } catch (error) {
    const motivo = errorMessage(error);
    console.error(
      `[Gestor] No se pudo sincronizar el assistant ${id ?? "(nuevo)"}: ${motivo}`
    );
    return { estado: "error", id, motivo };
  }
}
