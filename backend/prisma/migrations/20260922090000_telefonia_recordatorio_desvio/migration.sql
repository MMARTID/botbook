-- Telefonía sin confusión, fase 5 (PLAN-TELEFONIA-UX.md § 5). Marca del
-- recordatorio único «aún no has comprobado el desvío» que manda el job
-- recordar-desvio-sin-comprobar entre 24 y 48 h después de comprar el
-- número. Solo una columna nueva; los negocios existentes quedan a null.
ALTER TABLE "businesses" ADD COLUMN "forwardingReminderSentAt" TIMESTAMP(3);
