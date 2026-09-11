-- Los recursos configurables e históricos se retiran del panel sin perder
-- las relaciones que explican llamadas, citas y revisiones anteriores.
ALTER TABLE "agents" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "services" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "professionals" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "recordings" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "agents_businessId_deletedAt_idx" ON "agents"("businessId", "deletedAt");
CREATE INDEX "services_businessId_deletedAt_idx" ON "services"("businessId", "deletedAt");
CREATE INDEX "professionals_businessId_deletedAt_idx" ON "professionals"("businessId", "deletedAt");
CREATE INDEX "recordings_deletedAt_idx" ON "recordings"("deletedAt");
