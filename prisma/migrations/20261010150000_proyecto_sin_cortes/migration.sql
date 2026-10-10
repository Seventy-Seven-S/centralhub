-- Proyectos que no se liquidan por cortes.
ALTER TABLE "projects" ADD COLUMN "sin_cortes" BOOLEAN NOT NULL DEFAULT false;

-- Valle del Roble es el único (decisión del arquitecto, 2026-10-10).
UPDATE "projects" SET "sin_cortes" = true WHERE "code" = 'VDR';

-- Sus gastos ya cuentan en egresos; marcados "por descontar" esperarían un
-- corte que nunca llega (V464 y V465, cargados el mismo día).
UPDATE "Expense" SET "descontar_en_corte" = false
WHERE "corte_id" IS NULL AND "projectId" IN (SELECT "id" FROM "projects" WHERE "code" = 'VDR');
