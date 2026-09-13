-- Renombra campos que llevaban nombre de "vapi"/"twilio" pero ya son
-- genéricos, usados por Retell y Telnyx. RENAME COLUMN preserva los datos e
-- índices existentes (a diferencia de un drop+add, que los perdería).
ALTER TABLE "businesses" RENAME COLUMN "twilioPhoneNumberStatus" TO "phoneNumberStatus";
ALTER TABLE "calls" RENAME COLUMN "vapiCallId" TO "callId";
ALTER TABLE "recordings" RENAME COLUMN "vapiUrl" TO "externalUrl";
