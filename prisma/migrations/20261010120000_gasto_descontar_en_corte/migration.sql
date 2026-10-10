-- Gastos que se le descuentan al dueño en el próximo corte del proyecto.
ALTER TABLE "Expense" ADD COLUMN "descontar_en_corte" BOOLEAN NOT NULL DEFAULT false;
