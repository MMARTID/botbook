ALTER TABLE "businesses"
  ADD COLUMN "paymentFailureInvoiceId" TEXT,
  ADD COLUMN "paymentFailureNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "paymentFailureSuspensionAt" TIMESTAMP(3),
  ADD COLUMN "callsSuspendedAt" TIMESTAMP(3),
  ADD COLUMN "cancellationNoticeSentAt" TIMESTAMP(3);
