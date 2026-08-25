-- CreateEnum
CREATE TYPE "CallSentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- AlterTable
ALTER TABLE "calls" ADD COLUMN     "sentiment" "CallSentiment";
