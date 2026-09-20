-- WhatsApp, fase 1 / PR 4: lado cliente (PLAN-CANAL-DUENO.md § 5 y § Cambios de datos). Solo añade.

-- AlterTable
ALTER TABLE "businesses"
  ADD COLUMN "placeId" TEXT,
  ADD COLUMN "address" TEXT;

-- AlterTable
ALTER TABLE "bookings"
  ADD COLUMN "confirmedByClientAt" TIMESTAMP(3),
  ADD COLUMN "createdVia" TEXT,
  ADD COLUMN "clientNotifiedAt" TIMESTAMP(3);
