-- CreateTable
CREATE TABLE "estado_cuenta_logs" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedByIp" TEXT,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "estado_cuenta_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estado_cuenta_logs_folio_key" ON "estado_cuenta_logs"("folio");

-- AddForeignKey
ALTER TABLE "estado_cuenta_logs" ADD CONSTRAINT "estado_cuenta_logs_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
