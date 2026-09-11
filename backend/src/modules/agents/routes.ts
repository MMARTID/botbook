// src/modules/agents/routes.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { vapiAdapter } from "../../adapters/vapi/VapiAdapter.js";
import {
  VAPI_LLM_PROVIDERS,
  VAPI_STT_PROVIDERS,
  VAPI_VOICE_PROVIDERS,
} from "../../config/vapi.js";
import {
  buildVapiAssistantPayload,
  buildRetellLlmPayload,
  buildRetellAgentPayload,
  buildPostCallAnalysisDataForBusiness,
  createBusinessAgent,
  getRetellEditableDraft,
  publishRetellAgentUpdate,
  resolveRetellVoiceProfile,
} from "../../lib/agentBootstrap.js";
import { parseAgentSettings } from "../../lib/managedAgentPrompt.js";
import { retellAdapter } from "../../adapters/retell/RetellAdapter.js";
import { getPublicWebhookBaseUrl } from "../../lib/serverUrl.js";

// Extraemos los tipos literales de las listas de configuración
type VoiceProvider = (typeof VAPI_VOICE_PROVIDERS)[number];
type VoiceId = string;
type LlmProvider = (typeof VAPI_LLM_PROVIDERS)[number];
type LlmModel = string;
type SttProvider = (typeof VAPI_STT_PROVIDERS)[number];
type SttModel = string;

const CreateAgentSchema = z.object({
  name: z.string().min(1).optional(),
});

const UpdateAgentSchema = z.object({
  name: z.string().optional(),
  voice: z.string().optional(),
  voiceId: z.string().optional(),
  voiceProvider: z.enum(VAPI_VOICE_PROVIDERS).optional(),
  voiceModel: z.string().optional(),
  language: z.string().optional(),
  systemPrompt: z.string().optional(),
  llmProvider: z.enum(VAPI_LLM_PROVIDERS).optional(),
  llmModel: z.string().optional(),
  llmTemperature: z.number().min(0).max(2).optional(),
  sttProvider: z.enum(VAPI_STT_PROVIDERS).optional(),
  sttModel: z.string().optional(),
  active: z.boolean().optional(),
  firstMessage: z.string().optional(),
  firstMessageMode: z
    .enum(["assistant-speaks-first", "assistant-waits-for-user"])
    .optional(),
  files: z.array(z.string()).optional(),
  integrations: z.record(z.any()).optional(),
});

export async function agentsRoutes(fastify: FastifyInstance) {
  // Create agent
  fastify.post<{ Body: z.infer<typeof CreateAgentSchema> }>(
    "/agents",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const data = CreateAgentSchema.parse(request.body);
        const businessId = request.user!.businessId;

        const business = await prisma.business.findUnique({
          where: { id: businessId },
        });

        if (!business) {
          return reply.status(404).send({ error: "Business not found" });
        }

        const agent = await createBusinessAgent({
          businessId: business.id,
          name: data.name || business.name,
        });

        return reply.status(201).send(agent);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        return reply.status(500).send({ error: "Failed to create agent" });
      }
    }
  );

  // Get agents for the authenticated business
  fastify.get(
    "/business/me/agents",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const agents = await prisma.agent.findMany({
          where: {
            businessId: request.user!.businessId,
            deletedAt: null,
          },
        });
        return reply.send(agents);
      } catch (error) {
        return reply.status(500).send({ error: "Failed to fetch agents" });
      }
    }
  );

  // Get agent by ID
  fastify.get<{ Params: { id: string } }>(
    "/agents/:id",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      try {
        const agent = await prisma.agent.findFirst({
          where: {
            id: request.params.id,
            businessId: request.user!.businessId,
            deletedAt: null,
          },
          include: {
            calls: { take: 5, orderBy: { createdAt: "desc" } },
          },
        });

        if (!agent) {
          return reply.status(404).send({ error: "Agent not found" });
        }

        return reply.send(agent);
      } catch (error) {
        return reply.status(500).send({ error: "Failed to fetch agent" });
      }
    }
  );

  // Update agent
  fastify.patch<{
    Params: { id: string };
    Body: z.infer<typeof UpdateAgentSchema>;
  }>(
    "/agents/:id",
    { preValidation: [fastify.authenticate] },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof UpdateAgentSchema>;
      }>,
      reply
    ) => {
      try {
        const data = UpdateAgentSchema.parse(request.body);
        const agent = await prisma.agent.findFirst({
          where: {
            id: request.params.id,
            businessId: request.user!.businessId,
            deletedAt: null,
          },
        });

        if (!agent) {
          return reply.status(404).send({ error: "Agent not found" });
        }

        const business = await prisma.business.findUnique({
          where: { id: agent.businessId },
          select: { orchestrator: true, agentSettings: true },
        });

        const orchestrator = business?.orchestrator || "retell";
        // En Retell la voz y los idiomas se gestionan desde Ajustes del
        // negocio. Así un PATCH individual no puede volver a poner una voz
        // Cartesia incompatible cuando el negocio ha activado catalán.
        const retellVoiceProfile = resolveRetellVoiceProfile(
          parseAgentSettings(business?.agentSettings)
        );
        const agentLanguages = parseAgentSettings(business?.agentSettings).languages;
        const catalanEnabled = agentLanguages.includes("ca-ES");

        const agentWithConfig = agent as typeof agent & {
          voiceId?: string | null;
          voice?: string | null;
          voiceProvider?: string | null;
          voiceModel?: string | null;
          llmProvider?: string | null;
          llmModel?: string | null;
          llmTemperature?: number | null;
          sttProvider?: string | null;
          sttModel?: string | null;
          firstMessage?: string | null;
          firstMessageMode?: string | null;
        };

        const voiceId = (data.voiceId ||
          data.voice ||
          agentWithConfig.voiceId ||
          agentWithConfig.voice ||
          "538a8872-3799-4df5-b373-b78493b766c6") as VoiceId;
        const persistedVoiceId =
          orchestrator === "retell" && catalanEnabled
            ? retellVoiceProfile.voiceId
            : voiceId;
        const persistedVoiceProvider =
          orchestrator === "retell" && catalanEnabled
            ? retellVoiceProfile.voiceProvider
            : data.voiceProvider;
        const llmProvider = (data.llmProvider ||
          agentWithConfig.llmProvider ||
          "groq") as LlmProvider;
        const llmModel = (data.llmModel ||
          agentWithConfig.llmModel ||
          "openai/gpt-oss-20b") as LlmModel;
        const llmTemperature =
          data.llmTemperature ?? agentWithConfig.llmTemperature ?? 0.3;
        const sttProvider = (data.sttProvider ||
          agentWithConfig.sttProvider ||
          "deepgram") as SttProvider;
        const sttModel = (data.sttModel ||
          agentWithConfig.sttModel ||
          "nova-2") as SttModel;

        const agentUpdateData = {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.voiceId !== undefined || data.voice !== undefined
            ? { voiceId: persistedVoiceId }
            : {}),
          ...(data.voiceProvider !== undefined ||
          (orchestrator === "retell" &&
            catalanEnabled &&
            (data.voiceId !== undefined || data.voice !== undefined))
            ? { voiceProvider: persistedVoiceProvider }
            : {}),
          ...(data.voiceModel !== undefined
            ? { voiceModel: data.voiceModel }
            : {}),
          ...(data.language !== undefined ? { language: data.language } : {}),
          ...(data.systemPrompt !== undefined
            ? // Marca este agente como editado a mano — syncAgentToRetell lo
              // usa para dejar de reconstruir y sobrescribir el prompt aquí
              // cuando cambien servicios/profesionales/ajustes del negocio
              // (hallazgo #27 de la auditoría: la propia función afirmaba
              // en su comentario que ya hacía esto, pero nunca estaba
              // implementado).
              { systemPrompt: data.systemPrompt, promptManuallyEdited: true }
            : {}),
          ...(data.llmProvider !== undefined
            ? { llmProvider: data.llmProvider }
            : {}),
          ...(data.llmModel !== undefined ? { llmModel: data.llmModel } : {}),
          ...(data.llmTemperature !== undefined
            ? { llmTemperature: data.llmTemperature }
            : {}),
          ...(data.sttProvider !== undefined
            ? { sttProvider: data.sttProvider }
            : {}),
          ...(data.sttModel !== undefined ? { sttModel: data.sttModel } : {}),
          ...(data.active !== undefined ? { active: data.active } : {}),
          ...(data.firstMessage !== undefined
            ? { firstMessage: data.firstMessage }
            : {}),
          ...(data.firstMessageMode !== undefined
            ? { firstMessageMode: data.firstMessageMode }
            : {}),
        };

        const updated = await prisma.agent.update({
          where: { id: request.params.id },
          data: agentUpdateData,
        });

        const shouldSync =
          data.name ||
          data.systemPrompt ||
          data.voice ||
          data.voiceId ||
          data.voiceProvider ||
          data.voiceModel ||
          data.llmProvider ||
          data.llmModel ||
          typeof data.llmTemperature === "number" ||
          data.sttProvider ||
          data.sttModel ||
          data.firstMessage ||
          data.firstMessageMode;

        if (shouldSync) {
          if (
            orchestrator === "retell" &&
            agent.retellAgentId &&
            agent.retellLlmId
          ) {
            try {
              const baseUrl = getPublicWebhookBaseUrl();
              const webhookUrl = baseUrl
                ? `${baseUrl.replace(/\/$/, "")}/webhooks/retell`
                : undefined;
              const retellDraft = await getRetellEditableDraft(agent.retellAgentId);

              const retellLlmPayload = buildRetellLlmPayload({
                  name: data.name || agent.name,
                  systemPrompt: data.systemPrompt || agent.systemPrompt,
                  firstMessage:
                    data.firstMessage ??
                    agentWithConfig.firstMessage ??
                    undefined,
                });
              await retellAdapter.updateLlm(retellDraft.llmId, {
                ...retellLlmPayload,
                version: retellDraft.llmVersion,
              });

              const postCallAnalysisData =
                await buildPostCallAnalysisDataForBusiness(agent.businessId);
              const updatedRetellAgent = await retellAdapter.updateAgent(
                agent.retellAgentId,
                {
                  ...buildRetellAgentPayload({
                  name: data.name || agent.name,
                  llmId: retellDraft.llmId,
                  webhookUrl,
                  postCallAnalysisData,
                  // Catalán exige una voz compatible: no dejamos que una
                  // edición individual vuelva a enviar Cartesia, que Retell
                  // rechaza para ca-ES. Sin catalán se respeta la voz manual
                  // y se conservan sus fallbacks remotos.
                  voiceId: catalanEnabled ? retellVoiceProfile.voiceId : voiceId,
                  ...(catalanEnabled
                    ? {
                        voiceModel: retellVoiceProfile.voiceModel,
                        fallbackVoiceIds: retellVoiceProfile.fallbackVoiceIds,
                      }
                    : {}),
                  languages: agentLanguages,
                  }),
                  version: retellDraft.agentVersion,
                }
              );
              await publishRetellAgentUpdate(
                agent.retellAgentId,
                updatedRetellAgent
              );
            } catch (retellError) {
              console.error(
                "[Agent] Failed to sync update to Retell:",
                retellError
              );
            }
          } else if (agent.vapiAssistantId) {
            try {
              await vapiAdapter.updateAssistant(
                agent.vapiAssistantId,
                buildVapiAssistantPayload({
                  name: data.name || agent.name,
                  systemPrompt: data.systemPrompt || agent.systemPrompt,
                  voiceId,
                  voiceProvider: (data.voiceProvider ||
                    agentWithConfig.voiceProvider ||
                    "cartesia") as VoiceProvider,
                  voiceModel:
                    data.voiceModel || agentWithConfig.voiceModel || undefined,
                  llmProvider,
                  llmModel,
                  llmTemperature,
                  sttProvider,
                  sttModel,
                  firstMessage:
                    data.firstMessage ??
                    agentWithConfig.firstMessage ??
                    undefined,
                  firstMessageMode: (data.firstMessageMode ??
                    agentWithConfig.firstMessageMode ??
                    undefined) as
                    | "assistant-speaks-first"
                    | "assistant-waits-for-user"
                    | undefined,
                })
              );
            } catch (vapiError) {
              console.error(
                "[Agent] Failed to sync update to Vapi:",
                vapiError
              );
            }
          }
        }

        return reply.send(updated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        return reply.status(500).send({ error: "Failed to update agent" });
      }
    }
  );

  // Retiramos el agente sin borrar llamadas ni la configuración remota. Así
  // se preserva la trazabilidad y las llamadas históricas siguen resolviendo
  // su agente original; el webhook entrante solo selecciona agentes activos.
  fastify.delete<{ Params: { id: string } }>(
    "/agents/:id",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      try {
        const agent = await prisma.agent.findFirst({
          where: {
            id: request.params.id,
            businessId: request.user!.businessId,
            deletedAt: null,
          },
        });

        if (!agent) {
          return reply.status(404).send({ error: "Agent not found" });
        }

        await prisma.agent.update({
          where: { id: agent.id },
          data: { active: false, deletedAt: new Date() },
        });

        return reply.status(204).send();
      } catch (error) {
        return reply.status(500).send({ error: "Failed to delete agent" });
      }
    }
  );
}
