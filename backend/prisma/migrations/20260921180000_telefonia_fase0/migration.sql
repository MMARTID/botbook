-- Telefonía sin confusión, fase 0 (PLAN-TELEFONIA-UX.md § 5). Solo columnas
-- nuevas: tipo de la línea de clientes, «avisos al mismo móvil» (caso C),
-- privacidad «no des mi número a los clientes» y la fecha en que el desvío
-- se comprobó de verdad (distinta de forwardingConfirmedAt, «el usuario
-- dice»). Los negocios existentes quedan con null/false y nada cambia.
ALTER TABLE "businesses" ADD COLUMN "customerLineType" TEXT;
ALTER TABLE "businesses" ADD COLUMN "ownerPhoneIsCustomerLine" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "businesses" ADD COLUMN "hideOwnerNumberFromClients" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "onboarding_states" ADD COLUMN "forwardingCheckedAt" TIMESTAMP(3);
