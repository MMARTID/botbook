-- WhatsApp, fase 2 / PR 2: el Gestor (acciones propuestas y MAL). Solo añade.

-- CreateTable
CREATE TABLE "owner_pending_actions" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "conversationId" TEXT,
    "inboundMessageId" TEXT,
    "tipo" TEXT NOT NULL,
    "parametros" JSONB NOT NULL,
    "resumen" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "resultado" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_pending_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_chat_feedback" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "conversationId" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_chat_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "owner_pending_actions_businessId_createdAt_idx" ON "owner_pending_actions"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "owner_chat_feedback_businessId_createdAt_idx" ON "owner_chat_feedback"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "owner_pending_actions" ADD CONSTRAINT "owner_pending_actions_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_chat_feedback" ADD CONSTRAINT "owner_chat_feedback_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
