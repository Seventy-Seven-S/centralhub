-- Traspasos: un lote cambia de manos.
-- TRASPASADO es distinto de CANCELED: la venta no se deshizo, cambió de dueño.

CREATE TYPE "TraspasoTipo" AS ENUM ('CAMBIO_TITULAR', 'REUBICACION');

ALTER TYPE "ContractStatus" ADD VALUE IF NOT EXISTS 'TRASPASADO';
ALTER TYPE "PaymentType"    ADD VALUE IF NOT EXISTS 'TRASPASO_ENTRADA';

CREATE TABLE "traspasos" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "tipo" "TraspasoTipo" NOT NULL,
    "contrato_origen_id" TEXT NOT NULL,
    "contrato_destino_id" TEXT,
    "cliente_anterior_id" TEXT NOT NULL,
    "cliente_nuevo_id" TEXT NOT NULL,
    "monto_abonado" DOUBLE PRECISION NOT NULL,
    "monto_respetado" DOUBLE PRECISION NOT NULL,
    "motivo" TEXT,
    "nota" TEXT,
    "documento_url" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "traspasos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "traspasos_numero_key" ON "traspasos"("numero");
CREATE INDEX "traspasos_contrato_origen_id_idx" ON "traspasos"("contrato_origen_id");
CREATE INDEX "traspasos_fecha_idx" ON "traspasos"("fecha");

ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_contrato_origen_id_fkey"
    FOREIGN KEY ("contrato_origen_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_contrato_destino_id_fkey"
    FOREIGN KEY ("contrato_destino_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_cliente_anterior_id_fkey"
    FOREIGN KEY ("cliente_anterior_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_cliente_nuevo_id_fkey"
    FOREIGN KEY ("cliente_nuevo_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD COLUMN "traspaso_id" TEXT;
CREATE INDEX "payments_traspaso_id_idx" ON "payments"("traspaso_id");
ALTER TABLE "payments" ADD CONSTRAINT "payments_traspaso_id_fkey"
    FOREIGN KEY ("traspaso_id") REFERENCES "traspasos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
