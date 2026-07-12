-- CreateEnum
CREATE TYPE "NotificationAudience" AS ENUM ('ADMIN', 'MANAGER', 'CLIENT');

-- DropIndex
DROP INDEX "notifications_read_createdAt_idx";

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "audience" "NotificationAudience" NOT NULL DEFAULT 'ADMIN',
ADD COLUMN     "clientId" TEXT;

-- CreateIndex
CREATE INDEX "notifications_audience_read_createdAt_idx" ON "notifications"("audience", "read", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_clientId_read_idx" ON "notifications"("clientId", "read");
