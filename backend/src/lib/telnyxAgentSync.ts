import { createHash } from "node:crypto";
import { prisma } from "./prisma.js";
import { telnyxAiAdapter } from "../adapters/telnyx/TelnyxAiAdapter.js";
import {
  buildTelnyxAssistantPayload,
  buildTelnyxVoiceTools,
  type TelnyxWebhookToolInput,
} from "./telnyxAssistantPayload.js";
import { getPublicWebhookBaseUrl } from "./serverUrl.js";
import {
  buildManagedAgentPrompt,
  buildTransferInstruction,
  parseAgentSettings,
  TITULO_DEL_BLOQUE_DE_TRANSFERENCIA,
} from "./managedAgentPrompt.js";
import { resolveTelnyxEligibility } from "./telnyxEligibility.js";
import { isBusinessType, type BusinessType } from "./businessType.js";
import { buildRetellBeginMessage } from "./agentBootstrap.js";
import { listaDeEsperaDisponible } from "../modules/whatsapp/service.js";
import { resolverTransferenciaAlDueno } from "./transferenciaAlDueno.js";
import type { CreateTelnyxAssistantInput } from "../adapters/telnyx/TelnyxAiAdapter.js";

/** Hash del payload enviado a Telnyx: si no cambia, la sincronización no
 * vuelve a llamar a la API. Determinista mientras el propio builder del
 * payload no cambie el orden de sus claves. */
function hashConfig(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Prompt/greeting/idioma de un negocio, para no repetir la misma consulta y
 * transformación en createTelnyxAssistantForAgent y syncAgentToTelnyx.
 */
async function loadManagedAssistantConfig(
  businessId: string,
  prismaClient: typeof prisma
) {
  const business = await prismaClient.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      timezone: true,
      businessDetails: true,
      businessType: true,
      agentSettings: true,
      minAdvanceBookingMinutes: true,
      maxAppointmentDurationMinutes: true,
      hideOwnerNumberFromClients: true,
      // Transferencia al dueño (fase 4): de aquí salen el origen (número de
      // Alhabla), el destino (móvil del dueño) y el modo por defecto.
      customerLineType: true,
      phone: true,
      telnyxPhoneNumber: true,
      ownerWhatsappNumber: true,
      ownerPhoneIsCustomerLine: true,
    },
  });
  if (!business) return null;

  const businessType: BusinessType = isBusinessType(business.businessType)
    ? business.businessType
    : "other";
  const agentSettings = parseAgentSettings(business.agentSettings);
  // La misma resolución decide el bloque del prompt Y la tool: nunca uno
  // sin el otro.
  const transferenciaAlDueno = resolverTransferenciaAlDueno(
    business,
    agentSettings.pasarLlamadas
  );
  const systemPrompt = buildManagedAgentPrompt({
    businessName: business.name,
    businessDetails: business.businessDetails,
    businessType,
    settings: agentSettings,
    timezone: business.timezone,
    minAdvanceBookingMinutes: business.minAdvanceBookingMinutes,
    maxAppointmentDurationMinutes: business.maxAppointmentDurationMinutes,
    listaDeEspera: await listaDeEsperaDisponible(),
    ocultarNumeroDelNegocio: business.hideOwnerNumberFromClients,
    transferenciaAlDueno,
  });

  return {
    business,
    agentSettings,
    systemPrompt,
    transferenciaAlDueno: transferenciaAlDueno.activa
      ? { from: transferenciaAlDueno.origen!, to: transferenciaAlDueno.destino! }
      : null,
    /** El bloque «## Pasar la llamada» suelto, para los prompts editados a
     * mano (ver promptManualConSuRegla). null si la tool no se registra. */
    bloqueDeTransferencia: buildTransferInstruction(transferenciaAlDueno),
  };
}

/**
 * Un prompt editado a mano (PATCH /agents/:id) se manda tal cual, pero la
 * tool `transfer` se registra según los ajustes del negocio, no según el
 * prompt: si el bloque no está, se añade al final para no romper la
 * garantía «nunca la tool sin su regla». Si el dueño ya escribió su propio
 * «## Pasar la llamada», se respeta.
 */
export function promptManualConSuRegla(
  prompt: string,
  bloqueDeTransferencia: string | null
): string {
  if (
    !bloqueDeTransferencia ||
    prompt.includes(TITULO_DEL_BLOQUE_DE_TRANSFERENCIA)
  ) {
    return prompt;
  }
  return `${prompt.trimEnd()}\n\n${bloqueDeTransferencia}`;
}

/** Motivo que queda guardado cuando falta la URL pública del backend. */
const SIN_BASE_URL =
  "Falta BASE_URL; no se pueden registrar las tools de Telnyx";

type ConfiguracionGestionada = NonNullable<
  Awaited<ReturnType<typeof loadManagedAssistantConfig>>
>;

type AgenteDeRecepcionista = {
  id: string;
  systemPrompt: string;
  promptManuallyEdited: boolean;
};

/**
 * Nombres de los servicios y profesionales activos: sesgan la transcripción
 * (`keyterm` de deepgram/flux) hacia lo que de verdad se nombra en las
 * llamadas del negocio.
 */
async function cargarPalabrasClave(
  businessId: string,
  prismaClient: typeof prisma
): Promise<string[]> {
  const [services, professionals] = await Promise.all([
    prismaClient.service.findMany({
      where: { businessId, active: true, deletedAt: null },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
    prismaClient.professional.findMany({
      where: { businessId, active: true, deletedAt: null },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return [
    ...services.map((service) => service.name),
    ...professionals.map((professional) => professional.name),
  ];
}

/**
 * El payload COMPLETO de la recepcionista de un agente: prompt (el
 * gestionado, o el manual con su regla de transferencia), las tools de voz,
 * las palabras clave y la tool `transfer` cuando procede. Lo usan la
 * creación y la sincronización, así que las dos mandan exactamente lo mismo
 * y guardan el mismo hash: la primera sincronización tras crear el
 * assistant no tiene nada que cambiar.
 */
function construirPayloadDeRecepcionista(args: {
  businessId: string;
  agent: AgenteDeRecepcionista;
  config: ConfiguracionGestionada;
  voz: string;
  tools: TelnyxWebhookToolInput[];
  palabrasClave: string[];
}): CreateTelnyxAssistantInput {
  const { config } = args;
  return buildTelnyxAssistantPayload({
    businessId: args.businessId,
    agentId: args.agent.id,
    businessName: config.business.name,
    timezone: config.business.timezone,
    instructions: args.agent.promptManuallyEdited
      ? promptManualConSuRegla(
          args.agent.systemPrompt,
          config.bloqueDeTransferencia
        )
      : config.systemPrompt,
    greeting: buildRetellBeginMessage(config.business.name),
    languages: config.agentSettings.languages,
    voice: args.voz,
    voiceLanguage: config.agentSettings.voiceLanguage,
    boostedKeywords: args.palabrasClave,
    tools: args.tools,
    // Va aparte de `tools` (que solo lleva tools de webhook).
    transferenciaAlDueno: config.transferenciaAlDueno,
  });
}

/** Lo que se guarda en el `Agent` tras mandar su payload a Telnyx. */
function datosDeSincronizacion(
  payload: CreateTelnyxAssistantInput,
  agent: AgenteDeRecepcionista,
  config: ConfiguracionGestionada
) {
  return {
    telnyxConfigHash: hashConfig(payload),
    telnyxSyncedAt: new Date(),
    telnyxSyncError: null,
    // La copia del prompt que ve el panel (/agente) es la que ejecuta
    // Telnyx, el primary: con el bloque de transferencia cuando la tool
    // está registrada y sin él cuando no. Los prompts editados a mano no
    // se pisan.
    ...(agent.promptManuallyEdited
      ? {}
      : { systemPrompt: config.systemPrompt }),
  };
}

/**
 * Crea el assistant Telnyx de un `Agent`, si el negocio es elegible
 * (idioma/voz), con el payload completo desde el primer momento: tools de
 * voz, palabras clave y transferencia. Antes nacía solo con `hangup` y
 * dependía de una segunda sincronización para poder consultar horario o
 * reservar; si esa segunda llamada fallaba, el negocio quedaba en Telnyx
 * con una recepcionista incapaz de reservar (incidente real 2026-09-14).
 *
 * Nunca lanza: un fallo aquí no debe impedir que `createBusinessAgent()`
 * devuelva el agente ya creado en Retell. Lo llaman `createBusinessAgent()`
 * y el backfill (`scripts/backfillTelnyxAssistants.ts`); para agentes que
 * ya tienen assistant usa `syncAgentToTelnyx`.
 */
export async function createTelnyxAssistantForAgent(args: {
  agentId: string;
  businessId: string;
  prismaClient?: typeof prisma;
}): Promise<{ eligible: boolean; reason: string | null }> {
  const client = args.prismaClient ?? prisma;

  try {
    const config = await loadManagedAssistantConfig(args.businessId, client);
    if (!config) return { eligible: false, reason: "Negocio no encontrado." };

    const eligibility = await resolveTelnyxEligibility(config.agentSettings);
    if (!eligibility.eligible) {
      return { eligible: false, reason: eligibility.reason };
    }

    // Sin URL pública las tools no tendrían adónde llamar: mejor no crear
    // el assistant (el negocio sigue en Retell y el motivo queda guardado)
    // que crear uno que contesta pero no puede consultar ni reservar nada.
    const baseUrl = getPublicWebhookBaseUrl();
    if (!baseUrl) return { eligible: false, reason: SIN_BASE_URL };

    const agent = await client.agent.findUnique({
      where: { id: args.agentId },
      select: { id: true, systemPrompt: true, promptManuallyEdited: true },
    });
    if (!agent) return { eligible: false, reason: "Agente no encontrado." };

    const payload = construirPayloadDeRecepcionista({
      businessId: args.businessId,
      agent,
      config,
      voz: eligibility.voiceId!,
      tools: buildTelnyxVoiceTools(baseUrl),
      palabrasClave: await cargarPalabrasClave(args.businessId, client),
    });

    const assistant = await telnyxAiAdapter.createAssistant(payload);
    await client.agent.update({
      where: { id: args.agentId },
      data: {
        telnyxAssistantId: assistant.id,
        ...datosDeSincronizacion(payload, agent, config),
      },
    });
    return { eligible: true, reason: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Agent] No se pudo crear el assistant Telnyx:", {
      agentId: args.agentId,
      businessId: args.businessId,
      message,
    });
    return { eligible: false, reason: message };
  }
}

/**
 * Reconstruye la configuración gestionada de Telnyx y la sincroniza con los
 * agentes que ya tienen `telnyxAssistantId` — espejo de `syncAgentToRetell`,
 * pero SIN lanzar nunca: un fallo aquí no debe tumbar el flujo (reservas,
 * ajustes) que dispara esta sincronización. El estado queda en
 * `telnyxSyncError` para que el panel lo muestre. Solo llama a Telnyx si el
 * hash del payload cambió.
 */
export async function syncAgentToTelnyx(
  businessId: string,
  prismaClient: typeof prisma = prisma,
  options?: {
    onlyManagedPrompts?: boolean;
    onlyActive?: boolean;
  }
): Promise<void> {
  try {
    const config = await loadManagedAssistantConfig(businessId, prismaClient);
    if (!config) return;

    const agents = await prismaClient.agent.findMany({
      where: {
        businessId,
        deletedAt: null,
        telnyxAssistantId: { not: null },
        ...(options?.onlyActive ? { active: true } : {}),
      },
    });
    if (agents.length === 0) return;

    const [palabrasClave, eligibility] = await Promise.all([
      cargarPalabrasClave(businessId, prismaClient),
      resolveTelnyxEligibility(config.agentSettings),
    ]);

    // Las tools de voz van SIEMPRE, las pida quien las pida: guardar el
    // horario, crear/editar un servicio o profesional, conectar el
    // calendario o el reconciliador diario. Cuando cada llamada decidía si
    // pasaba `tools`, las que no las pasaban sobrescribían el assistant real
    // con `tools: []` — dejándolo sin get_catalog/check_availability/
    // book_appointment/find_my_appointment/cancel_appointment pese a que el
    // prompt seguía instruyéndole a usarlas. Hallazgo real 2026-09-14: los 5
    // assistants de las cuentas de prueba lo sufrieron (probablemente el
    // reconciliador diario) y las 25 llamadas reales de
    // telnyxCallBattery.ts fallaron en el 100% de los casos.
    const baseUrl = getPublicWebhookBaseUrl();
    const tools = baseUrl ? buildTelnyxVoiceTools(baseUrl) : undefined;
    if (!tools) {
      console.error(`[Agent] ${SIN_BASE_URL} para ${businessId}`);
    }

    for (const agent of agents) {
      if (options?.onlyManagedPrompts && agent.promptManuallyEdited) continue;

      try {
        if (!eligibility.eligible) {
          throw new Error(
            eligibility.reason ?? "Negocio no elegible para Telnyx."
          );
        }
        if (!tools) throw new Error(SIN_BASE_URL);

        const payload = construirPayloadDeRecepcionista({
          businessId,
          agent,
          config,
          voz: eligibility.voiceId!,
          tools,
          palabrasClave,
        });
        const datos = datosDeSincronizacion(payload, agent, config);
        if (agent.telnyxConfigHash !== datos.telnyxConfigHash) {
          await telnyxAiAdapter.updateAssistant(
            agent.telnyxAssistantId!,
            payload
          );
        }
        await prismaClient.agent.update({
          where: { id: agent.id },
          data: datos,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[Agent] No se pudo sincronizar el agente con Telnyx:", {
          agentId: agent.id,
          businessId,
          message,
        });
        await prismaClient.agent
          .update({ where: { id: agent.id }, data: { telnyxSyncError: message } })
          .catch(() => {});
      }
    }
  } catch (error) {
    console.error("[Agent] Fallo inesperado sincronizando Telnyx (no afecta a Retell):", {
      businessId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
