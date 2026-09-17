-- DropIndex
DROP INDEX "calls_vapiCallId_idx";

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "weeklySummarySentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "sent_messages" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sent_messages_sentAt_idx" ON "sent_messages"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "sent_messages_channel_idempotencyKey_key" ON "sent_messages"("channel", "idempotencyKey");

-- CreateIndex
CREATE INDEX "bookings_programedAt_idx" ON "bookings"("programedAt");

-- CreateIndex
CREATE INDEX "bookings_createdAt_idx" ON "bookings"("createdAt");

-- CreateIndex
CREATE INDEX "calls_businessId_startedAt_idx" ON "calls"("businessId", "startedAt");

-- CreateIndex
CREATE INDEX "calls_businessId_createdAt_idx" ON "calls"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "calls_businessId_status_startedAt_idx" ON "calls"("businessId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "calls_status_updatedAt_idx" ON "calls"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "leads_type_resolvedAt_idx" ON "leads"("type", "resolvedAt");

-- CreateIndex
CREATE INDEX "leads_createdAt_idx" ON "leads"("createdAt");

-- CreateIndex
CREATE INDEX "recordings_createdAt_idx" ON "recordings"("createdAt");

-- CreateIndex
CREATE INDEX "recordings_storageKey_deletedAt_idx" ON "recordings"("storageKey", "deletedAt");

-- RenameIndex
ALTER INDEX "calls_vapiCallId_key" RENAME TO "calls_callId_key";

