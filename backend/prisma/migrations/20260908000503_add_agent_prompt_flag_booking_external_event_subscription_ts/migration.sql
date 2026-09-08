-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "promptManuallyEdited" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "externalEventId" TEXT;

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "subscriptionEventCreatedAt" TIMESTAMP(3);
