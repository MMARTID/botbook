const STATUS_PAGE_COMPONENTS_URL =
  "https://status.telnyx.com/api/v2/components.json";

const STATUS_PAGE_TIMEOUT_MS = 5_000;

export interface TelnyxStatusComponent {
  id: string;
  name: string;
  status: string;
}

export interface TelnyxStatusCheckResult {
  healthy: boolean;
  /** true si `TELNYX_STATUS_COMPONENT_IDS` está vacío — sin componentes que
   * vigilar no hay lectura de salud real, y el job debe tratarlo como "no
   * evaluable", nunca como "sano" ni como "degradado". */
  unconfigured: boolean;
  components: TelnyxStatusComponent[];
}

/**
 * Consulta el status page PÚBLICO de Telnyx (statuspage.io, sin
 * autenticación) y evalúa solo los componentes configurados en
 * `TELNYX_STATUS_COMPONENT_IDS` (IDs separados por comas).
 *
 * Verificado en vivo el 2026-09-11: el status page de Telnyx NO publica
 * ningún componente específico de "AI Assistants" ni "Inference" — la
 * granularidad real es por región/carrier (p. ej. "Inbound Calling Services
 * - United States") y por modelo de LLM hosteado (p. ej. "GLM-5.3",
 * "Kimi-K2.6"). El diseño del plan que asume "componentes de AI/Inference"
 * como una categoría propia no se corresponde con lo que Telnyx publica hoy
 * — decidir qué IDs monitorizar (y si son un proxy suficiente) es una
 * decisión de negocio pendiente (Fase 0), no algo que este código pueda
 * resolver solo. Por eso el job trata "sin componentes configurados" como
 * "no evaluable" en vez de asumir un valor por defecto.
 */
export async function checkTelnyxAiInfraStatus(): Promise<TelnyxStatusCheckResult> {
  const configuredIds = (process.env.TELNYX_STATUS_COMPONENT_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (configuredIds.length === 0) {
    return { healthy: false, unconfigured: true, components: [] };
  }

  const response = await fetch(STATUS_PAGE_COMPONENTS_URL, {
    signal: AbortSignal.timeout(STATUS_PAGE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Telnyx status page respondió HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    components?: TelnyxStatusComponent[];
  };
  const components = (data.components ?? []).filter((component) =>
    configuredIds.includes(component.id)
  );

  return {
    healthy:
      components.length > 0 &&
      components.every((component) => component.status === "operational"),
    unconfigured: false,
    components,
  };
}
