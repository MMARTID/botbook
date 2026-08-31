/*
  Warnings:

  - You are about to drop the column `completed` on the `onboarding_states` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[twilioPhoneNumber]` on the table `businesses` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[twilioPhoneNumberSid]` on the table `businesses` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[vapiPhoneNumberId]` on the table `businesses` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "twilioPhoneNumber" TEXT,
ADD COLUMN     "twilioPhoneNumberPurchasedAt" TIMESTAMP(3),
ADD COLUMN     "twilioPhoneNumberSid" TEXT,
ADD COLUMN     "twilioPhoneNumberStatus" TEXT DEFAULT 'pending',
ADD COLUMN     "vapiPhoneNumberId" TEXT;

-- AlterTable
ALTER TABLE "onboarding_states" DROP COLUMN "completed",
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "dismissedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_twilioPhoneNumber_key" ON "businesses"("twilioPhoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_twilioPhoneNumberSid_key" ON "businesses"("twilioPhoneNumberSid");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_vapiPhoneNumberId_key" ON "businesses"("vapiPhoneNumberId");
