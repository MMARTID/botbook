-- WhatsApp, fase 2 / PR 1: cimientos de las conversaciones (Beta). Solo añade.

-- AlterTable
ALTER TABLE "businesses"
  ADD COLUMN "clientChatEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "ownerChatEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "ownerConversationId" TEXT,
  ADD COLUMN "ownerConversationCreatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "client_conversations" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientPhone" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "turns" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_conversations_conversationId_key" ON "client_conversations"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "client_conversations_callId_key" ON "client_conversations"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "client_conversations_businessId_clientPhone_key" ON "client_conversations"("businessId", "clientPhone");

-- AddForeignKey
ALTER TABLE "client_conversations" ADD CONSTRAINT "client_conversations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
