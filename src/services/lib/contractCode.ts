// Genera el siguiente código de contrato de un proyecto a partir de los
// códigos existentes (codigoLegado). Los proyectos migrados usan series
// letra+número por proyecto (K=Monarca II, V=Valle del Roble, C=JSA1, …) y
// codigo_legado es ÚNICO GLOBAL, así que:
//   - con códigos existentes: continúa la serie del prefijo dominante,
//     tomando el MÁXIMO numérico (no el más reciente)
//   - proyecto sin contratos: arranca una serie nueva con el código del
//     proyecto como prefijo (p.ej. "VSR001"), que no colisiona con las
//     series de una letra de los proyectos migrados

const CODE_RE = /^([A-Z]+)(\d+)$/;

export function nextContractCode(existingCodes: string[], projectCode: string): string {
  const counts = new Map<string, number>();
  const maxByPrefix = new Map<string, number>();

  for (const code of existingCodes) {
    const m = code.trim().toUpperCase().match(CODE_RE);
    if (!m) continue;
    const [, prefix, num] = m;
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    maxByPrefix.set(prefix, Math.max(maxByPrefix.get(prefix) ?? 0, parseInt(num, 10)));
  }

  if (counts.size === 0) {
    return `${projectCode.toUpperCase()}001`;
  }

  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const next = (maxByPrefix.get(dominant) ?? 0) + 1;
  return `${dominant}${String(next).padStart(3, '0')}`;
}
