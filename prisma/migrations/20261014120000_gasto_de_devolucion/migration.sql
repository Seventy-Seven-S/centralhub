-- Gasto que registra la devolución al cliente de un contrato cancelado.
ALTER TABLE "Expense" ADD COLUMN "pago_devolucion_id" TEXT;
CREATE UNIQUE INDEX "Expense_pago_devolucion_id_key" ON "Expense"("pago_devolucion_id");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_pago_devolucion_id_fkey"
  FOREIGN KEY ("pago_devolucion_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
