-- Puerta del Sol tampoco se liquida por cortes, igual que VDR (2026-10-10).
UPDATE "projects" SET "sin_cortes" = true WHERE "code" = 'PDS';

UPDATE "Expense" SET "descontar_en_corte" = false
WHERE "corte_id" IS NULL AND "projectId" IN (SELECT "id" FROM "projects" WHERE "code" = 'PDS');
