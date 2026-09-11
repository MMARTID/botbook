-- Impide que una reserva confirmada se libere al consultar un calendario
-- distinto del que creó su evento externo.
ALTER TABLE "bookings"
  ADD COLUMN "externalCalendarProvider" TEXT,
  ADD COLUMN "externalCalendarId" TEXT;

CREATE INDEX "bookings_externalCalendarProvider_externalCalendarId_idx"
  ON "bookings"("externalCalendarProvider", "externalCalendarId");
