-- El total de lotes de un proyecto se capturaba a mano y nadie lo mantuvo:
-- JSA 1 declaraba 50 con 113 lotes cargados, Valle del Roble 450 con 513.
-- Ahora siempre se cuenta de los lotes reales, así que la columna sale.
ALTER TABLE "projects" DROP COLUMN "totalLots";
