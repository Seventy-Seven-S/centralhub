-- Corte diario: entrega del efectivo cobrado en el día al administrador.
-- Eje distinto al de "cortes" (liquidación al dueño del terreno), por eso
-- payments lleva corte_diario_id aparte de corte_id.

CREATE TYPE "CorteDiarioStatus" AS ENUM ('PENDIENTE_ENTREGA', 'RECIBIDO');

CREATE TABLE "cortes_diarios" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "cobrador_id" TEXT NOT NULL,
    "status" "CorteDiarioStatus" NOT NULL DEFAULT 'PENDIENTE_ENTREGA',
    "total_efectivo" DOUBLE PRECISION NOT NULL,
    "total_otros" DOUBLE PRECISION NOT NULL,
    "declarado" DOUBLE PRECISION NOT NULL,
    "recibido" DOUBLE PRECISION,
    "diferencia" DOUBLE PRECISION,
    "cerrado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recibido_at" TIMESTAMP(3),
    "recibido_por_id" TEXT,
    "nota_cobrador" TEXT,
    "nota_admin" TEXT,
    CONSTRAINT "cortes_diarios_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cortes_diarios_numero_key" ON "cortes_diarios"("numero");
-- Un corte por persona por día.
CREATE UNIQUE INDEX "cortes_diarios_cobrador_id_fecha_key" ON "cortes_diarios"("cobrador_id", "fecha");
CREATE INDEX "cortes_diarios_status_fecha_idx" ON "cortes_diarios"("status", "fecha");

ALTER TABLE "cortes_diarios" ADD CONSTRAINT "cortes_diarios_cobrador_id_fkey"
    FOREIGN KEY ("cobrador_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cortes_diarios" ADD CONSTRAINT "cortes_diarios_recibido_por_id_fkey"
    FOREIGN KEY ("recibido_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments" ADD COLUMN "corte_diario_id" TEXT;
CREATE INDEX "payments_corte_diario_id_idx" ON "payments"("corte_diario_id");
ALTER TABLE "payments" ADD CONSTRAINT "payments_corte_diario_id_fkey"
    FOREIGN KEY ("corte_diario_id") REFERENCES "cortes_diarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
