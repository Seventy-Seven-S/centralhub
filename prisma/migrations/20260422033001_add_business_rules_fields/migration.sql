-- CreateEnum
CREATE TYPE "CommissionConfigType" AS ENUM ('PERCENTAGE', 'FIXED');

-- AlterEnum
ALTER TYPE "ContractStatus" ADD VALUE 'IN_MORA';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentType" ADD VALUE 'RESCISSION_REFUND';
ALTER TYPE "PaymentType" ADD VALUE 'RESERVATION_DEPOSIT';

-- AlterTable
ALTER TABLE "commissions" ADD COLUMN     "fixedAmount" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "balance" DOUBLE PRECISION,
ADD COLUMN     "moraMonthsCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "lots" ADD COLUMN     "reservationDeposit" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "extraAmount" DOUBLE PRECISION,
ADD COLUMN     "installmentAmount" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "commissionType" "CommissionConfigType" NOT NULL DEFAULT 'PERCENTAGE',
ADD COLUMN     "commissionValue" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "co_owners" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "ine" TEXT NOT NULL,
    "estadoCivil" TEXT NOT NULL,
    "lugarNacimiento" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "co_owners_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "co_owners" ADD CONSTRAINT "co_owners_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
