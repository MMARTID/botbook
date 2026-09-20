-- WhatsApp, fase 1 / PR 3: avisos al negocio. Solo añade.

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "notificationPrefs" JSONB;

-- AlterTable
ALTER TABLE "leads"
  ADD COLUMN "notifiedAt" TIMESTAMP(3),
  ADD COLUMN "notifiedVia" TEXT;

-- AlterTable
ALTER TABLE "bookings"
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledBy" TEXT;
