-- CreateTable
CREATE TABLE "recibo_logs" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "clienteNombre" TEXT NOT NULL,
    "codigoLegado" TEXT,
    "proyecto" TEXT NOT NULL,
    "loteLabel" TEXT,
    "numeroCuota" INTEGER NOT NULL,
    "mes" TEXT NOT NULL,
    "plazoTotal" INTEGER NOT NULL,
    "montoPagado" DOUBLE PRECISION NOT NULL,
    "fechaPago" TIMESTAMP(3) NOT NULL,
    "concepto" TEXT NOT NULL,
    "balanceDespues" DOUBLE PRECISION NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedByIp" TEXT,

    CONSTRAINT "recibo_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recibo_logs_paymentId_key" ON "recibo_logs"("paymentId");
