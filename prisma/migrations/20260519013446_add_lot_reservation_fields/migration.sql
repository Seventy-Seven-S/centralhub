-- AlterTable
ALTER TABLE "lots" ADD COLUMN     "reservedByAgentId" TEXT,
ADD COLUMN     "reservedByEmail" TEXT,
ADD COLUMN     "reservedByName" TEXT,
ADD COLUMN     "reservedByPhone" TEXT;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_reservedByAgentId_fkey" FOREIGN KEY ("reservedByAgentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
