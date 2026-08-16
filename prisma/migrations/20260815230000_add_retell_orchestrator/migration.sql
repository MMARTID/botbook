/*
  Warnings:

  - A unique constraint covering the columns `[retellAgentId]` on the table `agents` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[retellPhoneNumberId]` on the table `businesses` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[retellPhoneNumber]` on the table `businesses` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "retellAgentId" TEXT,
ADD COLUMN     "retellLlmId" TEXT;

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "orchestrator" TEXT NOT NULL DEFAULT 'retell',
ADD COLUMN     "retellPhoneNumber" TEXT,
ADD COLUMN     "retellPhoneNumberId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "agents_retellAgentId_key" ON "agents"("retellAgentId");

-- CreateIndex
CREATE INDEX "agents_retellAgentId_idx" ON "agents"("retellAgentId");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_retellPhoneNumberId_key" ON "businesses"("retellPhoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_retellPhoneNumber_key" ON "businesses"("retellPhoneNumber");
