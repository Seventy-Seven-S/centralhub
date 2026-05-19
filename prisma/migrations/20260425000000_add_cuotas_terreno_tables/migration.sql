-- CreateEnum
CREATE TYPE "CuotaStatus" AS ENUM ('PENDIENTE', 'PAGADA', 'MORA');

-- AlterTable: Add codigo_legado to contracts
ALTER TABLE "contracts" ADD COLUMN "codigo_legado" TEXT;
CREATE UNIQUE INDEX "contracts_codigo_legado_key" ON "contracts"("codigo_legado");

-- AlterTable: Add mes to payment_schedules
ALTER TABLE "payment_schedules" ADD COLUMN "mes" TEXT;

-- AlterTable: Add compromisosTerreno relation to projects (no column needed, handled by FK)

-- CreateTable: cuotas
CREATE TABLE "cuotas" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "numero_cuota" INTEGER NOT NULL,
    "mes" TEXT NOT NULL,
    "monto_esperado" DOUBLE PRECISION NOT NULL,
    "monto_pagado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fecha_vencimiento" TIMESTAMP(3) NOT NULL,
    "fecha_pago" TIMESTAMP(3),
    "status" "CuotaStatus" NOT NULL DEFAULT 'PENDIENTE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable: compromisos_terreno
CREATE TABLE "compromisos_terreno" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "descripcion" TEXT,
    "beneficiario" TEXT NOT NULL,
    "monto_total" DOUBLE PRECISION NOT NULL,
    "pagado_acumulado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pendiente" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compromisos_terreno_pkey" PRIMARY KEY ("id")
);

-- CreateTable: pagos_terreno
CREATE TABLE "pagos_terreno" (
    "id" TEXT NOT NULL,
    "compromiso_id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "concepto" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_terreno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cuotas_contract_id_idx" ON "cuotas"("contract_id");
CREATE INDEX "cuotas_status_idx" ON "cuotas"("status");
CREATE UNIQUE INDEX "cuotas_contract_id_numero_cuota_key" ON "cuotas"("contract_id", "numero_cuota");

-- CreateIndex
CREATE INDEX "compromisos_terreno_project_id_idx" ON "compromisos_terreno"("project_id");

-- CreateIndex
CREATE INDEX "pagos_terreno_compromiso_id_idx" ON "pagos_terreno"("compromiso_id");

-- AddForeignKey
ALTER TABLE "cuotas" ADD CONSTRAINT "cuotas_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compromisos_terreno" ADD CONSTRAINT "compromisos_terreno_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_terreno" ADD CONSTRAINT "pagos_terreno_compromiso_id_fkey" FOREIGN KEY ("compromiso_id") REFERENCES "compromisos_terreno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
