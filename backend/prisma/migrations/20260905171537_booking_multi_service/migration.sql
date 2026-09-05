/*
  Warnings:

  - You are about to drop the column `serviceId` on the `bookings` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_serviceId_fkey";

-- DropIndex
DROP INDEX "bookings_serviceId_idx";

-- AlterTable
ALTER TABLE "bookings" DROP COLUMN "serviceId",
ADD COLUMN     "serviceIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
