import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { vapiAdapter } from '../../adapters/vapi/VapiAdapter.js';
import { createWriteStream } from 'fs';
import { rm } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';

const allowedExtensions = new Set(['.pdf', '.txt', '.doc', '.docx', '.csv']);

type StoredAgentFile = {
  id: string;
  name: string;
  url?: string;
};

function getStoredFiles(files: unknown): StoredAgentFile[] {
  if (!Array.isArray(files)) return [];

  return files.filter((file): file is StoredAgentFile => {
    if (!file || typeof file !== 'object') return false;
    const candidate = file as Partial<StoredAgentFile>;
    return typeof candidate.id === 'string' && typeof candidate.name === 'string';
  });
}

export const filesRoutes: FastifyPluginAsync = async (fastify) => {
  const authOpts = {
    onRequest: [fastify.authenticate],
  };

  /**
   * Upload a file to Vapi for an agent
   */
  fastify.post('/:agentId/files', {
    ...authOpts,
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const { user } = request as any;

    if (!user || !user.businessId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      // 1. Verify agent belongs to user's business
      const agent = await prisma.agent.findFirst({
        where: { 
          id: agentId,
          businessId: user.businessId 
        },
      });

      if (!agent || !agent.vapiAssistantId) {
        return reply.status(404).send({ error: 'Agent not found or has no Vapi Assistant ID' });
      }

      // 2. Handle file upload
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const extension = path.extname(data.filename).toLowerCase();
      if (!allowedExtensions.has(extension)) {
        data.file.resume();
        return reply.status(415).send({ error: 'Unsupported file type' });
      }

      const tempFilePath = path.join(os.tmpdir(), `${randomUUID()}${extension}`);

      try {
        await pipeline(data.file, createWriteStream(tempFilePath));

        // 3. Upload to Vapi
        const vapiFile = await vapiAdapter.uploadFile(
          tempFilePath,
          agent.vapiAssistantId,
          data.mimetype
        );

        // 4. Save the uploaded file in the assistant's knowledge base.
        const currentFiles = getStoredFiles(agent.files);
        const updatedFiles = [
          ...currentFiles,
          { id: vapiFile.id, name: data.filename, url: vapiFile.url },
        ];
        const assistant = await vapiAdapter.getAssistant(agent.vapiAssistantId);

        if (!assistant.model?.provider) {
          throw new Error('Vapi assistant has no model provider');
        }

        await vapiAdapter.updateAssistant(agent.vapiAssistantId, {
          model: {
            ...assistant.model,
            knowledgeBase: {
              fileIds: updatedFiles.map((file) => file.id),
              provider: 'google',
            },
          },
        });

        // 5. Persist the same file list locally after Vapi accepts the change.
        await prisma.agent.update({
          where: { id: agentId },
          data: {
            files: updatedFiles,
          },
        });

        return reply.status(200).send({ success: true, file: vapiFile });
      } catch (vapiError: unknown) {
        fastify.log.error({ err: vapiError }, 'Failed to upload file to Vapi');
        const details = vapiError instanceof Error ? vapiError.message : 'Unknown upload error';
        return reply.status(502).send({ error: 'Failed to upload file to Vapi', details });
      } finally {
        await rm(tempFilePath, { force: true }).catch((cleanupError) => {
          fastify.log.warn({ err: cleanupError, tempFilePath }, 'Failed to remove temporary upload');
        });
      }

    } catch (error) {
      fastify.log.error({ err: error }, 'Error processing file upload');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};