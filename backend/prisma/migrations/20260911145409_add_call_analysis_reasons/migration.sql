-- CreateEnum
CREATE TYPE "CallEscalationReason" AS ENUM ('CLIENTE_LO_PIDIO', 'FALLO_TECNICO', 'FUERA_DE_HORARIO', 'CONSULTA_COMPLEJA', 'NO_APLICA');

-- AlterTable
ALTER TABLE "calls" ADD COLUMN     "escalationReason" "CallEscalationReason",
ADD COLUMN     "requestedService" TEXT,
ADD COLUMN     "toolFailureDetected" BOOLEAN;
