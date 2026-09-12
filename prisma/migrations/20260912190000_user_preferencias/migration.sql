-- Ajustes de pantalla por usuario (orden de las tarjetas de Proyectos, etc.).
-- Nullable a propósito: un usuario sin preferencias ve el orden por omisión.
ALTER TABLE "users" ADD COLUMN "preferencias" JSONB;
