-- WhatsApp, fase 1 / cimientos (PLAN-CANAL-DUENO.md): remitentes por
-- audiencia, plantillas sincronizadas, mensajes entrantes y entrega/coste de
-- los enviados. Solo añade: ninguna columna existente cambia.

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "ownerWhatsappNumber" TEXT;

-- AlterTable
ALTER TABLE "sent_messages"
  ADD COLUMN "providerMessageId" TEXT,
  ADD COLUMN "businessId" TEXT,
  ADD COLUMN "audience" TEXT,
  ADD COLUMN "fromNumber" TEXT,
  ADD COLUMN "toNumber" TEXT,
  ADD COLUMN "kind" TEXT,
  ADD COLUMN "templateName" TEXT,
  ADD COLUMN "templateLanguage" TEXT,
  ADD COLUMN "callbackData" TEXT,
  ADD COLUMN "deliveryStatus" TEXT,
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "readAt" TIMESTAMP(3),
  ADD COLUMN "failedAt" TIMESTAMP(3),
  ADD COLUMN "errorCode" TEXT,
  ADD COLUMN "errorDetail" TEXT,
  ADD COLUMN "costAmount" DECIMAL(10,5),
  ADD COLUMN "costCurrency" TEXT;

-- CreateTable
CREATE TABLE "whatsapp_senders" (
    "id" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "telnyxPhoneNumberId" TEXT,
    "metaPhoneNumberId" TEXT,
    "displayName" TEXT,
    "displayNameStatus" TEXT,
    "status" TEXT NOT NULL,
    "qualityRating" TEXT,
    "messagingLimit" TEXT,
    "profileVersion" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_senders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "telnyxTemplateId" TEXT NOT NULL,
    "metaTemplateId" TEXT,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "qualityRating" TEXT,
    "rejectionReason" TEXT,
    "components" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_messages" (
    "id" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "foreignId" TEXT,
    "eventId" TEXT,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "audience" TEXT,
    "role" TEXT NOT NULL,
    "businessId" TEXT,
    "kind" TEXT NOT NULL,
    "text" TEXT,
    "buttonId" TEXT,
    "buttonTitle" TEXT,
    "contextMessageId" TEXT,
    "contactName" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "handledAt" TIMESTAMP(3),
    "handler" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "businesses_ownerWhatsappNumber_idx" ON "businesses"("ownerWhatsappNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sent_messages_providerMessageId_key" ON "sent_messages"("providerMessageId");

-- CreateIndex
CREATE INDEX "sent_messages_businessId_sentAt_idx" ON "sent_messages"("businessId", "sentAt");

-- CreateIndex
CREATE INDEX "sent_messages_toNumber_sentAt_idx" ON "sent_messages"("toNumber", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_senders_audience_key" ON "whatsapp_senders"("audience");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_senders_phoneNumber_key" ON "whatsapp_senders"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_key_key" ON "whatsapp_templates"("key");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_telnyxTemplateId_key" ON "whatsapp_templates"("telnyxTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_name_language_key" ON "whatsapp_templates"("name", "language");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_messages_providerMessageId_key" ON "inbound_messages"("providerMessageId");

-- CreateIndex
CREATE INDEX "inbound_messages_fromNumber_receivedAt_idx" ON "inbound_messages"("fromNumber", "receivedAt");

-- CreateIndex
CREATE INDEX "inbound_messages_businessId_receivedAt_idx" ON "inbound_messages"("businessId", "receivedAt");

-- CreateIndex
CREATE INDEX "inbound_messages_contextMessageId_idx" ON "inbound_messages"("contextMessageId");
