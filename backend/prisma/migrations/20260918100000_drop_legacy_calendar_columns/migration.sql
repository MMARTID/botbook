-- Fase "contract" 2 del paso a calendar_connections (PR #77 creó la tabla y
-- copió estos datos; PR #78 dejó de leer y escribir estas columnas y las
-- retiró del cliente Prisma). Solo puede aplicarse con esa revisión ya
-- desplegada: la anterior aún las seleccionaba en consultas sin `select`.
-- AlterTable
ALTER TABLE "businesses" DROP COLUMN "googleCalendarConnected",
DROP COLUMN "googleCalendarDisconnectedAt",
DROP COLUMN "googleCalendarId",
DROP COLUMN "googleCalendarLastError",
DROP COLUMN "googleRefreshToken",
DROP COLUMN "outlookCalendarConnected",
DROP COLUMN "outlookCalendarDisconnectedAt",
DROP COLUMN "outlookCalendarId",
DROP COLUMN "outlookCalendarLastError",
DROP COLUMN "outlookRefreshToken",
DROP COLUMN "outlookUserEmail";

