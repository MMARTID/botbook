-- Cambiar una cita por teléfono o por WhatsApp es cancelar + reservar. La
-- reserva cancelada apunta a la nueva para que el panel pueda decir
-- «Reserva modificada» en la conversación original en vez de nada.
ALTER TABLE "bookings" ADD COLUMN "rescheduledToId" TEXT;
