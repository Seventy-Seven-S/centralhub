-- El módulo viejo de Comisiones se retira: las comisiones de los asesores
-- ahora se registran como gastos de la categoría Asesores (con su recibo).
--
-- Al 2026-10-14 la tabla tenía 0 filas en producción, pero el código viejo
-- seguía creando una fila si alguien elegía "Vendedor" con % de comisión al dar
-- de alta un contrato. Para no borrar a ciegas: si para cuando esto corre ya
-- hay filas, la tabla se renombra como respaldo (y sus enums se quedan, porque
-- la usan) en vez de tirarse. Si está vacía, se borra con sus enums.
DO $$
BEGIN
  IF to_regclass('public.commissions') IS NULL THEN
    DROP TYPE IF EXISTS "CommissionType";
    DROP TYPE IF EXISTS "CommissionStatus";
  ELSIF EXISTS (SELECT 1 FROM "commissions" LIMIT 1) THEN
    ALTER TABLE "commissions" RENAME TO "commissions_respaldo_20261019";
  ELSE
    DROP TABLE "commissions";
    DROP TYPE IF EXISTS "CommissionType";
    DROP TYPE IF EXISTS "CommissionStatus";
  END IF;
END $$;
