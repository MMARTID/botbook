-- CreateTable
CREATE TABLE "calendar_connections" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "calendarId" TEXT,
    "credentials" JSONB,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "disconnectedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "accountEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_connections_businessId_provider_key" ON "calendar_connections"("businessId", "provider");

-- AddForeignKey
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill desde las columnas google*/outlook* de businesses (que se conservan
-- como espejo hasta el PR "contract"). Se crea fila para todo negocio que tenga
-- cualquier rastro del proveedor: credenciales, calendario elegido, flag de
-- conectado o una desconexión registrada (para no perder disconnectedAt /
-- lastError, que el panel muestra). El id se genera con md5 del par
-- (negocio, proveedor): determinista, así la migración es reejecutable sin
-- duplicar (ON CONFLICT DO NOTHING).
INSERT INTO "calendar_connections"
  ("id", "businessId", "provider", "calendarId", "credentials", "connected",
   "disconnectedAt", "lastError", "accountEmail", "createdAt", "updatedAt")
SELECT
  'cal_' || md5(b."id" || ':google'),
  b."id",
  'google',
  b."googleCalendarId",
  CASE WHEN b."googleRefreshToken" IS NOT NULL
       THEN jsonb_build_object('provider', 'google', 'refreshToken', b."googleRefreshToken")
       ELSE NULL END,
  b."googleCalendarConnected",
  b."googleCalendarDisconnectedAt",
  b."googleCalendarLastError",
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "businesses" b
WHERE b."googleRefreshToken" IS NOT NULL
   OR b."googleCalendarId" IS NOT NULL
   OR b."googleCalendarConnected" = true
   OR b."googleCalendarDisconnectedAt" IS NOT NULL
ON CONFLICT ("businessId", "provider") DO NOTHING;

INSERT INTO "calendar_connections"
  ("id", "businessId", "provider", "calendarId", "credentials", "connected",
   "disconnectedAt", "lastError", "accountEmail", "createdAt", "updatedAt")
SELECT
  'cal_' || md5(b."id" || ':outlook'),
  b."id",
  'outlook',
  b."outlookCalendarId",
  CASE WHEN b."outlookRefreshToken" IS NOT NULL
       THEN jsonb_build_object('provider', 'outlook', 'refreshToken', b."outlookRefreshToken")
       ELSE NULL END,
  b."outlookCalendarConnected",
  b."outlookCalendarDisconnectedAt",
  b."outlookCalendarLastError",
  b."outlookUserEmail",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "businesses" b
WHERE b."outlookRefreshToken" IS NOT NULL
   OR b."outlookCalendarId" IS NOT NULL
   OR b."outlookCalendarConnected" = true
   OR b."outlookCalendarDisconnectedAt" IS NOT NULL
   OR b."outlookUserEmail" IS NOT NULL
ON CONFLICT ("businessId", "provider") DO NOTHING;
