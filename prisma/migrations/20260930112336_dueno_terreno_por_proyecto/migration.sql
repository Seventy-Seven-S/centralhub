-- Quién firma de recibido en los cortes de cada proyecto. Estaba como un mapa
-- fijo en el código del frontend, con JSA 4 mal escrito, así que el sistema
-- prellenaba un nombre equivocado en cada corte.
ALTER TABLE "projects" ADD COLUMN "dueno_terreno" TEXT;
