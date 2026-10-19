-- El módulo viejo de Comisiones se retira: las comisiones de los asesores
-- ahora se registran como gastos de la categoría Asesores (con su recibo).
-- La tabla nunca tuvo filas en producción, así que no se pierde nada.
DROP TABLE IF EXISTS "commissions";

-- Sus enums solo los usaba esa tabla.
DROP TYPE IF EXISTS "CommissionType";
DROP TYPE IF EXISTS "CommissionStatus";
