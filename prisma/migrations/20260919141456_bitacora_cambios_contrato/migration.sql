-- Bitácora de cambios a los datos de un contrato. Antes de esto no existía
-- ninguna auditoría: se podía cambiar el precio o el balance sin dejar rastro.
CREATE TABLE "cambios_contrato" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valor_anterior" TEXT,
    "valor_nuevo" TEXT,
    "motivo" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cambios_contrato_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cambios_contrato_contract_id_idx" ON "cambios_contrato"("contract_id");

ALTER TABLE "cambios_contrato" ADD CONSTRAINT "cambios_contrato_contract_id_fkey"
    FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cambios_contrato" ADD CONSTRAINT "cambios_contrato_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
