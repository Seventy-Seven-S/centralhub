/**
 * Ajustes de pantalla por usuario. Se guardan en un solo campo JSON para no
 * agregar una columna cada vez que aparece una preferencia nueva.
 *
 * Todo lo que sale de aquí viene del cliente, así que se valida la forma antes
 * de usarlo: un orden corrupto debe degradar al orden por omisión, no romper
 * la pantalla de Proyectos.
 */
export type Preferencias = Record<string, unknown>;

/** Fusiona en vez de reemplazar: guardar el orden de Proyectos no debe borrar
 *  las demás preferencias del usuario. */
export function fusionarPreferencias(actuales: unknown, nuevas: Preferencias): Preferencias {
  const base = actuales && typeof actuales === 'object' && !Array.isArray(actuales)
    ? (actuales as Preferencias)
    : {};
  return { ...base, ...nuevas };
}

export function leerOrdenProyectos(prefs: unknown): string[] {
  if (!prefs || typeof prefs !== 'object') return [];
  const v = (prefs as Preferencias).ordenProyectos;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}
