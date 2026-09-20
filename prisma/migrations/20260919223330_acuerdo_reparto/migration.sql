-- Reparto del valor de un proyecto entre el dueño del terreno y la
-- inmobiliaria. valor_base queda congelado: el trato firmado no cambia porque
-- mañana se corrija el precio de un lote.
CREATE TABLE "acuerdos_reparto" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "porcentaje_dueno" DOUBLE PRECISION NOT NULL,
    "porcentaje_central" DOUBLE PRECISION NOT NULL,
    "valor_base" DOUBLE PRECISION NOT NULL,
    "nota" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acuerdos_reparto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "acuerdos_reparto_project_id_key" ON "acuerdos_reparto"("project_id");

ALTER TABLE "acuerdos_reparto" ADD CONSTRAINT "acuerdos_reparto_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
