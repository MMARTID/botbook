-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "googleCalendarConnected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "googleCalendarDisconnectedAt" TIMESTAMP(3),
ADD COLUMN     "googleCalendarLastError" TEXT;
