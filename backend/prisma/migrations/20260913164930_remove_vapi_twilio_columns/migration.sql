-- Eliminación de Vapi y Twilio: columnas exclusivas de cada proveedor, ya
-- inactivos (Retell/Telnyx son los únicos orquestador/telefonía en uso).
-- twilioPhoneNumberStatus y vapiCallId/vapiUrl NO se tocan aquí — son
-- campos genéricos compartidos, se renombran en la siguiente migración.
ALTER TABLE "businesses" DROP COLUMN "twilioPhoneNumber";
ALTER TABLE "businesses" DROP COLUMN "twilioPhoneNumberSid";
ALTER TABLE "businesses" DROP COLUMN "twilioPhoneNumberPurchasedAt";
ALTER TABLE "businesses" DROP COLUMN "vapiPhoneNumberId";
ALTER TABLE "agents" DROP COLUMN "vapiAssistantId";
ALTER TABLE "agents" DROP COLUMN "files";
