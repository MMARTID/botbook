ALTER TABLE "businesses" ADD COLUMN "usageBillingStartsAt" TIMESTAMP(3);

CREATE TABLE "billing_usage_periods" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "reportedMinutes" INTEGER NOT NULL DEFAULT 0,
  "warningEmailSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_usage_periods_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_usage_periods_businessId_periodStart_key" ON "billing_usage_periods"("businessId", "periodStart");
CREATE INDEX "billing_usage_periods_periodEnd_idx" ON "billing_usage_periods"("periodEnd");
ALTER TABLE "billing_usage_periods" ADD CONSTRAINT "billing_usage_periods_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "billing_usage_reports" (
  "id" TEXT NOT NULL,
  "periodId" TEXT NOT NULL,
  "minutes" INTEGER NOT NULL,
  "identifier" TEXT NOT NULL,
  "reportedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_usage_reports_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_usage_reports_identifier_key" ON "billing_usage_reports"("identifier");
CREATE INDEX "billing_usage_reports_periodId_reportedAt_idx" ON "billing_usage_reports"("periodId", "reportedAt");
ALTER TABLE "billing_usage_reports" ADD CONSTRAINT "billing_usage_reports_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "billing_usage_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
