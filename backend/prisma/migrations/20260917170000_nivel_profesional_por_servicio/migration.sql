-- Nivel de cada profesional en cada servicio: ESPECIALISTA o NO_SUGERIR.
-- El caso normal ("lo hace") no tiene fila. Las filas que ya existen eran
-- la casilla "especialidad" del panel y conservan ese significado gracias
-- al valor por defecto: no hay que rellenar nada.

-- CreateEnum
CREATE TYPE "ProfessionalServiceLevel" AS ENUM ('ESPECIALISTA', 'NO_SUGERIR');

-- AlterTable
ALTER TABLE "professional_services" ADD COLUMN     "level" "ProfessionalServiceLevel" NOT NULL DEFAULT 'ESPECIALISTA';
