-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "maxAppointmentDurationMinutes" INTEGER,
ADD COLUMN     "minAdvanceBookingMinutes" INTEGER;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "resolvedAt" TIMESTAMP(3);
