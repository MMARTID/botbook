CREATE TYPE "SubscriptionStatus" AS ENUM (
  'INCOMPLETE',
  'INCOMPLETE_EXPIRED',
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'UNPAID',
  'PAUSED'
);

ALTER TABLE "businesses"
  ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT,
  ADD COLUMN "stripePriceId" TEXT,
  ADD COLUMN "subscriptionStatus" "SubscriptionStatus",
  ADD COLUMN "subscriptionCurrentPeriodStart" TIMESTAMP(3),
  ADD COLUMN "subscriptionCurrentPeriodEnd" TIMESTAMP(3),
  ADD COLUMN "subscriptionTrialEnd" TIMESTAMP(3),
  ADD COLUMN "subscriptionCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "businesses_stripeCustomerId_key"
  ON "businesses"("stripeCustomerId");

CREATE UNIQUE INDEX "businesses_stripeSubscriptionId_key"
  ON "businesses"("stripeSubscriptionId");

CREATE TABLE "stripe_webhook_events" (
  "id" TEXT NOT NULL,
  "businessId" TEXT,
  "type" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,

  CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stripe_webhook_events_businessId_idx"
  ON "stripe_webhook_events"("businessId");

CREATE INDEX "stripe_webhook_events_type_idx"
  ON "stripe_webhook_events"("type");

ALTER TABLE "stripe_webhook_events"
  ADD CONSTRAINT "stripe_webhook_events_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
