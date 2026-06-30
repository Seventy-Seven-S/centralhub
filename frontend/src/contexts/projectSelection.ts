// Lógica pura de selección de proyecto (sin React, sin DOM).
// El storage se recibe por parámetro para poder testear sin jsdom.

export const STORAGE_KEY = 'centralhub.selectedProjectId';

type Readable = Pick<Storage, 'getItem'>;
type Writable = Pick<Storage, 'setItem' | 'removeItem'>;

/** Lee el id guardado; null si no hay nada. */
export function readStoredProjectId(storage: Readable): string | null {
  return storage.getItem(STORAGE_KEY);
}

/** Guarda el id; si es null, borra la clave (estado "Todos"). */
export function writeStoredProjectId(storage: Writable, id: string | null): void {
  if (id === null) {
    storage.removeItem(STORAGE_KEY);
  } else {
    storage.setItem(STORAGE_KEY, id);
  }
}

/**
 * Resuelve la selección contra la lista cargada:
 *   - null → null ("Todos los proyectos").
 *   - id presente en la lista → ese id.
 *   - id que ya no existe → null (fallback a "Todos").
 */
export function resolveStoredSelection(
  projects: { id: string }[],
  storedId: string | null,
): string | null {
  if (storedId === null) return null;
  return projects.some((p) => p.id === storedId) ? storedId : null;
}
