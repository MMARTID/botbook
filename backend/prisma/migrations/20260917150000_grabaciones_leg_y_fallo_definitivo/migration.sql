-- Grabaciones: leg de Telnyx para pedir una URL de descarga nueva cuando la
-- del webhook (firmada 10 min) ha caducado, y marca de "irrecuperable" para
-- que retryStuckRecordings deje de reencolar lo que ya no tiene arreglo.
-- Las tres columnas son opcionales: no hay que rellenar nada en las filas
-- existentes; el job deduce el leg de la URL antigua la primera vez.

-- AlterTable
ALTER TABLE "recordings" ADD COLUMN     "processingError" TEXT,
ADD COLUMN     "processingFailedAt" TIMESTAMP(3),
ADD COLUMN     "providerLegId" TEXT;
