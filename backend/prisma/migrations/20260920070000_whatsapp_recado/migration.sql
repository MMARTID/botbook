-- WhatsApp, fase 1 / PR 5: recado por post-conversación. Solo añade.

-- AlterTable
ALTER TABLE "calls"
  ADD COLUMN "postCallReport" JSONB,
  ADD COLUMN "postCallReportAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "leads" ADD COLUMN "snoozedUntil" TIMESTAMP(3);
