// La tarjeta del proyecto y el tablero tienen que reflejar al momento lo que
// se acaba de guardar: el arquitecto registra un gasto o una comisión y quiere
// ver la cifra moverse. Antes cada pantalla tenía que acordarse de avisar, y
// ninguna lo hacía — las cifras esperaban a que caducara el caché.
//
// Aquí se decide en UN solo lugar, en la respuesta de cualquier guardado. Así
// una pantalla nueva no se puede quedar fuera.

/** Guardados que no mueven dinero ni lotes: no hace falta recargar cifras. */
const NO_CAMBIAN_CIFRAS = ['/auth/', '/users/mis-preferencias', '/notifications'];

export function cambiaCifras(method: string | undefined, url: string | undefined): boolean {
  const m = (method ?? 'get').toLowerCase();
  if (m === 'get' || m === 'head' || m === 'options') return false;
  return !NO_CAMBIAN_CIFRAS.some(p => (url ?? '').includes(p));
}

/** Lo que se recarga después de un guardado. */
export const CONSULTAS_DE_CIFRAS = [['proyectos'], ['dashboard'], ['ingresos']] as const;

type Aviso = () => void;
const avisos = new Set<Aviso>();

export function alCambiarCifras(fn: Aviso): () => void {
  avisos.add(fn);
  return () => { avisos.delete(fn); };
}

export function avisarCambioDeCifras(method: string | undefined, url: string | undefined) {
  if (cambiaCifras(method, url)) avisos.forEach(fn => fn());
}
