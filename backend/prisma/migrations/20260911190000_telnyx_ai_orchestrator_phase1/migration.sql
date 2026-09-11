-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "retellConfigHash" TEXT,
ADD COLUMN     "retellSyncError" TEXT,
ADD COLUMN     "retellSyncedAt" TIMESTAMP(3),
ADD COLUMN     "telnyxAssistantId" TEXT,
ADD COLUMN     "telnyxConfigHash" TEXT,
ADD COLUMN     "telnyxSyncError" TEXT,
ADD COLUMN     "telnyxSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "telnyxEligibilityReason" TEXT,
ADD COLUMN     "telnyxEligibilityStatus" TEXT,
ADD COLUMN     "voiceFailoverActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "voiceFailoverReason" TEXT,
ADD COLUMN     "voiceRoutingChangedAt" TIMESTAMP(3),
ADD COLUMN     "voiceRoutingTarget" TEXT NOT NULL DEFAULT 'retell';

-- AlterTable
ALTER TABLE "calls" ADD COLUMN     "providerCallId" TEXT,
ADD COLUMN     "providerConversationId" TEXT,
ADD COLUMN     "providerCostCents" INTEGER,
ADD COLUMN     "voiceProvider" TEXT NOT NULL DEFAULT 'retell';

-- CreateTable
CREATE TABLE "voice_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "callId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "result" TEXT,
    "lastError" TEXT,

    CONSTRAINT "voice_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voice_webhook_events_callId_idx" ON "voice_webhook_events"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "voice_webhook_events_provider_eventId_key" ON "voice_webhook_events"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "agents_telnyxAssistantId_key" ON "agents"("telnyxAssistantId");

-- CreateIndex
CREATE UNIQUE INDEX "calls_voiceProvider_providerCallId_key" ON "calls"("voiceProvider", "providerCallId");

-- AddForeignKey
ALTER TABLE "voice_webhook_events" ADD CONSTRAINT "voice_webhook_events_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

