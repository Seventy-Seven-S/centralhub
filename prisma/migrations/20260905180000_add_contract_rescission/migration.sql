-- Rescisión / cancelación de contratos: evidencia y trazabilidad
ALTER TABLE "contracts" ADD COLUMN "rescindedAt" TIMESTAMP(3);
ALTER TABLE "contracts" ADD COLUMN "rescindedById" TEXT;
ALTER TABLE "contracts" ADD COLUMN "rescissionReason" TEXT;
ALTER TABLE "contracts" ADD COLUMN "rescissionFileUrl" TEXT;
