-- AlterTable
ALTER TABLE "agents" ALTER COLUMN "firstMessageMode" SET DEFAULT 'flux-general-multilingual';

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "businessDetails" TEXT,
ADD COLUMN     "googleCalendarId" TEXT,
ADD COLUMN     "googleRefreshToken" TEXT,
ADD COLUMN     "systemPrompt" TEXT;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "isLead" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_businessId_idx" ON "users"("businessId");

-- CreateIndex
CREATE INDEX "agents_vapiAssistantId_idx" ON "agents"("vapiAssistantId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
