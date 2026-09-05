-- Cortes: entrega periódica de ingresos al dueño del terreno
CREATE TABLE "cortes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "periodoInicio" TIMESTAMP(3),
    "periodoFin" TIMESTAMP(3),
    "totalIngresos" DOUBLE PRECISION NOT NULL,
    "totalEgresos" DOUBLE PRECISION NOT NULL,
    "entregadoDueno" DOUBLE PRECISION NOT NULL,
    "dueno" TEXT NOT NULL,
    "notas" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cortes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cortes_projectId_numero_key" ON "cortes"("projectId", "numero");
ALTER TABLE "cortes" ADD CONSTRAINT "cortes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cortes" ADD CONSTRAINT "cortes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD COLUMN "corte_id" TEXT;
CREATE INDEX "payments_corte_id_idx" ON "payments"("corte_id");
ALTER TABLE "payments" ADD CONSTRAINT "payments_corte_id_fkey" FOREIGN KEY ("corte_id") REFERENCES "cortes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Expense" ADD COLUMN "corte_id" TEXT;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_corte_id_fkey" FOREIGN KEY ("corte_id") REFERENCES "cortes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
