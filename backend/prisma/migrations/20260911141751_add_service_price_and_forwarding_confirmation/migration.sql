-- AlterTable
ALTER TABLE "onboarding_states" ADD COLUMN     "forwardingConfirmedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "priceCents" INTEGER;
