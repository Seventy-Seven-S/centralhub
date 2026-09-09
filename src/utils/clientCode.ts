// Generación del globalCode del cliente.
//
// En la BD conviven TRES formatos, heredados de rutas de escritura distintas:
//   CLI-0001        → 1,609 registros, escritos por migrate-project.ts (padStart 4)
//   CLI-000001      → los que creó el controlador (padStart 6)
//   CLI-MON2-K117   → con prefijo de proyecto, sin consecutivo numérico
//
// El controlador tomaba el cliente más reciente por createdAt y hacía
// parseInt(globalCode.split('-')[1]). Como el más reciente era CLI-MON2-K117,
// eso daba parseInt('MON2') = NaN y el código generado era literalmente
// "CLI-000NaN". Ese registro llegó a crearse una vez, así que a partir de ahí
// TODOS los intentos chocaban contra el índice único: el alta de clientes
// quedó rota al 100%, no de forma intermitente.
//
// La regla ahora: el consecutivo sale del MÁXIMO numérico entre los códigos
// que sí tienen número, y los que traen prefijo de proyecto simplemente no
// participan.

/** El consecutivo de un globalCode, o null si ese código no tiene uno. */
export function numeroDeGlobalCode(globalCode: string | null | undefined): number | null {
  if (!globalCode) return null;
  const m = /^CLI-(\d+)$/.exec(globalCode.trim());
  if (!m) return null;                       // CLI-MON2-K117, CLI-000NaN, basura
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
}

/** Siguiente código libre a partir de los existentes. Puro, sin Prisma. */
export function siguienteGlobalCode(existentes: Array<string | null | undefined>): string {
  const max = existentes.reduce<number>((acc, c) => {
    const n = numeroDeGlobalCode(c);
    return n !== null && n > acc ? n : acc;
  }, 0);
  return formatearGlobalCode(max + 1);
}

export function formatearGlobalCode(n: number): string {
  return `CLI-${String(n).padStart(6, '0')}`;
}
