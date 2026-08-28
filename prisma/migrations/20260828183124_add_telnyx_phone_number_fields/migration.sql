/*
  Warnings:

  - A unique constraint covering the columns `[telnyxNumberOrderId]` on the table `businesses` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[telnyxPhoneNumber]` on the table `businesses` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[telnyxPhoneNumberId]` on the table `businesses` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "telnyxNumberOrderId" TEXT,
ADD COLUMN     "telnyxPhoneNumber" TEXT,
ADD COLUMN     "telnyxPhoneNumberId" TEXT,
ADD COLUMN     "telnyxPhoneNumberPurchasedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_telnyxNumberOrderId_key" ON "businesses"("telnyxNumberOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_telnyxPhoneNumber_key" ON "businesses"("telnyxPhoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_telnyxPhoneNumberId_key" ON "businesses"("telnyxPhoneNumberId");
