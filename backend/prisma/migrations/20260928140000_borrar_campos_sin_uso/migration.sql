-- Fase «contract» de la limpieza de campos sin uso: borra las seis columnas
-- que la fase anterior ya sacó del schema.prisma. Ningún código las leía ni
-- las escribía (los tres campos de Retell eran para un reconciliador
-- simétrico que nunca se hizo; profileVersion, para un script de perfil de
-- WhatsApp que tampoco existe).
--
-- Solo es seguro cuando la revisión desplegada ya corre con el cliente de
-- Prisma SIN estos campos: si no, sigue seleccionándolos mientras cambia el
-- tráfico y todo lo que lee Agent da 500. Por eso va en un deploy aparte,
-- después de la fase «dejar de usarlos» (AGENTS.md § Deployment Notes).
ALTER TABLE "agents" DROP COLUMN "promptVersion",
DROP COLUMN "retellConfigHash",
DROP COLUMN "retellSyncError",
DROP COLUMN "retellSyncedAt";

ALTER TABLE "professional_services" DROP COLUMN "assignedAt";

ALTER TABLE "whatsapp_senders" DROP COLUMN "profileVersion";
