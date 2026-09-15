-- Ingresos del proyecto que no vienen de un cliente: aportaciones del dueño
-- del terreno para cubrir gastos, reembolsos, etc. No caben en "payments",
-- donde cada pago exige contrato y cliente.
CREATE TABLE "otros_ingresos" (
  "id"          TEXT NOT NULL,
  "projectId"   TEXT NOT NULL,
  "monto"       DOUBLE PRECISION NOT NULL,
  "fecha"       TIMESTAMP(3) NOT NULL,
  "concepto"    TEXT NOT NULL,
  "notas"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "otros_ingresos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "otros_ingresos_projectId_fecha_idx" ON "otros_ingresos"("projectId", "fecha");

ALTER TABLE "otros_ingresos" ADD CONSTRAINT "otros_ingresos_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "otros_ingresos" ADD CONSTRAINT "otros_ingresos_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
