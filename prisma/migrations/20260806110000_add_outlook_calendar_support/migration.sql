-- Add Outlook / Microsoft calendar support to businesses
ALTER TABLE "businesses"
  ADD COLUMN "calendarProvider" TEXT,
  ADD COLUMN "outlookRefreshToken" TEXT,
  ADD COLUMN "outlookCalendarId" TEXT,
  ADD COLUMN "outlookUserEmail" TEXT,
  ADD COLUMN "outlookCalendarConnected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "outlookCalendarDisconnectedAt" TIMESTAMP(3),
  ADD COLUMN "outlookCalendarLastError" TEXT;
