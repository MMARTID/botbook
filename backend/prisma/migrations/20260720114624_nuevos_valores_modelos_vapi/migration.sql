-- AlterTable
ALTER TABLE "agents" ALTER COLUMN "llmModel" SET DEFAULT 'openai/gpt-oss-20b',
ALTER COLUMN "sttModel" SET DEFAULT 'nova-2',
ALTER COLUMN "voiceId" SET DEFAULT 'es-ES-AbrilNeural',
ALTER COLUMN "voiceModel" SET DEFAULT '',
ALTER COLUMN "voiceProvider" SET DEFAULT 'azure';
