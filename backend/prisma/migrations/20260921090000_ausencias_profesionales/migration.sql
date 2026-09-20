-- WhatsApp, fase 2 / PR 4: ausencias de profesionales (el Gestor). Solo añade.

-- CreateTable
CREATE TABLE "professional_absences" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdVia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professional_absences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "professional_absences_businessId_startsAt_idx" ON "professional_absences"("businessId", "startsAt");

-- CreateIndex
CREATE INDEX "professional_absences_professionalId_endsAt_idx" ON "professional_absences"("professionalId", "endsAt");

-- AddForeignKey
ALTER TABLE "professional_absences" ADD CONSTRAINT "professional_absences_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_absences" ADD CONSTRAINT "professional_absences_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
