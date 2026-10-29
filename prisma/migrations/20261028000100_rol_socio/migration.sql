-- Rol SOCIO: dueño o inversionista que solo consulta sus proyectos.
ALTER TYPE "UserRole" ADD VALUE 'SOCIO';

-- Qué proyectos puede consultar cada socio.
CREATE TABLE "proyectos_socio" (
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyectos_socio_pkey" PRIMARY KEY ("user_id","project_id")
);

CREATE INDEX "proyectos_socio_project_id_idx" ON "proyectos_socio"("project_id");

ALTER TABLE "proyectos_socio" ADD CONSTRAINT "proyectos_socio_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proyectos_socio" ADD CONSTRAINT "proyectos_socio_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
