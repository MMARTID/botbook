-- WhatsApp, fase 1 / PR 2: alta del dueño y bajas globales por número.
-- Solo añade: ninguna columna existente cambia.

-- AlterTable
ALTER TABLE "businesses"
  ADD COLUMN "ownerWhatsappOptInAt" TIMESTAMP(3),
  ADD COLUMN "ownerWhatsappOptInVia" TEXT,
  ADD COLUMN "ownerWhatsappOptInMessageId" TEXT,
  ADD COLUMN "ownerWhatsappOptOutAt" TIMESTAMP(3),
  ADD COLUMN "ownerWhatsappUnreachableAt" TIMESTAMP(3),
  ADD COLUMN "ownerWhatsappActivationSentAt" TIMESTAMP(3),
  ADD COLUMN "ownerWindowOpenUntil" TIMESTAMP(3),
  ADD COLUMN "ownerAltaCode" TEXT,
  ADD COLUMN "ownerAltaCodeExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_ownerAltaCode_key" ON "businesses"("ownerAltaCode");

-- CreateIndex
CREATE INDEX "inbound_messages_handledAt_receivedAt_idx" ON "inbound_messages"("handledAt", "receivedAt");

-- CreateTable
CREATE TABLE "whatsapp_opt_outs" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "optedOutAt" TIMESTAMP(3) NOT NULL,
    "keyword" TEXT NOT NULL,
    "inboundMessageId" TEXT,
    "businessId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_opt_outs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_opt_outs_phoneNumber_audience_key" ON "whatsapp_opt_outs"("phoneNumber", "audience");
