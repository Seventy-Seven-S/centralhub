-- Magnolia del Sur y Monarca II tampoco se liquidan por cortes (2026-10-10).
UPDATE "projects" SET "sin_cortes" = true WHERE "code" IN ('MDS', 'MON2');

-- Sus gastos ya cuentan en egresos; las comisiones de MON2 cargadas hoy
-- quedarían esperando un corte que no va a llegar.
UPDATE "Expense" SET "descontar_en_corte" = false
WHERE "corte_id" IS NULL AND "projectId" IN (SELECT "id" FROM "projects" WHERE "code" IN ('MDS', 'MON2'));
