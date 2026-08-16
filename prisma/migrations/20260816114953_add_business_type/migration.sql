/*
  Warnings:

  - You are about to drop the `Booking` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Order` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_callId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_callId_fkey";

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "businessType" TEXT NOT NULL DEFAULT 'other';

-- DropTable
DROP TABLE "Booking";

-- DropTable
DROP TABLE "Order";

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "programedAt" TIMESTAMP(3) NOT NULL,
    "numberPeople" INTEGER NOT NULL,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "order" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bookings_callId_key" ON "bookings"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_callId_key" ON "orders"("callId");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
