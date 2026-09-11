/**
 * Proyectos ocultos.
 *
 * Betania se retira de la operación por instrucción del arquitecto. Se ocultó
 * en vez de borrarse porque tiene 7 contratos, 77 pagos y $2.47M de historia:
 * borrarlo sería irreversible y dejaría huecos en la contabilidad. Ocultarlo
 * conserva todo y se revierte con un cambio de estatus.
 *
 * El requisito fuerte es que sus ingresos NO se cuelen en ningún total. Por
 * eso el filtro vive aquí y no repartido en cada consulta: con una decena de
 * lugares que agregan dinero, basta olvidar uno para que los $2.47M reaparezcan
 * en el dashboard.
 *
 * Regla: cuando NO hay proyecto elegido (o sea, "todos"), se excluyen los
 * ocultos. Cuando alguien elige un proyecto a propósito, se respeta — ocultar
 * no es prohibir el acceso, es sacarlo de los agregados y de los selectores.
 */
// Literal en vez de importar el enum de @prisma/client: este módulo es lógica
// pura y no debe arrastrar el cliente generado. Importarlo obligaba a que TODO
// test que mockea @prisma/client exportara ProjectStatus, y rompió siete
// archivos de test que ni siquiera hablan de proyectos ocultos.
// Prisma acepta el literal igual que el miembro del enum.
export const PROYECTO_OCULTO = 'HIDDEN' as const;

export interface OpcionesVisibilidad {
  /** Un administrador puede pedir explícitamente ver también los ocultos. */
  incluirOcultos?: boolean;
}

const noOculto = { status: { not: PROYECTO_OCULTO } };

/** Para consultas sobre `project`. */
export function whereProyectoVisible(projectId?: string, o: OpcionesVisibilidad = {}) {
  if (projectId) return { id: projectId };
  return o.incluirOcultos ? {} : noOculto;
}

/** Para consultas sobre `contract` (y cualquier modelo con projectId directo). */
export function whereContratoVisible(projectId?: string, o: OpcionesVisibilidad = {}) {
  if (projectId) return { projectId };
  return o.incluirOcultos ? {} : { project: noOculto };
}

/** Para `lot`. */
export const whereLoteVisible = whereContratoVisible;

/** Para `Expense`. */
export const whereGastoVisible = whereContratoVisible;

/** Para `payment`, que llega al proyecto a través del contrato. */
export function wherePagoVisible(projectId?: string, o: OpcionesVisibilidad = {}) {
  if (projectId) return { contract: { projectId } };
  return o.incluirOcultos ? {} : { contract: { project: noOculto } };
}
