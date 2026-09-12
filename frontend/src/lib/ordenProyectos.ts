/**
 * Orden de las tarjetas de Proyectos, acomodado por cada usuario.
 *
 * El orden se guarda como una lista de ids. Al dibujar hay que reconciliarla
 * con lo que devuelve el servidor: puede haber proyectos nuevos que nadie ha
 * acomodado todavía, y ids guardados de proyectos que ya no existen.
 */

/** Un proyecto nuevo va al FINAL en vez de desaparecer, y un id guardado que ya
 *  no existe se ignora en vez de dejar un hueco. */
export function aplicarOrden<T extends { id: string }>(proyectos: T[], orden: string[] | null | undefined): T[] {
  if (!orden?.length) return [...proyectos];
  const posicion = new Map(orden.map((id, i) => [id, i]));
  const AL_FINAL = orden.length;
  return [...proyectos].sort((a, b) => {
    const pa = posicion.get(a.id) ?? AL_FINAL;
    const pb = posicion.get(b.id) ?? AL_FINAL;
    // Empate: los que no estaban en el orden guardado conservan el del servidor.
    if (pa === pb) return proyectos.indexOf(a) - proyectos.indexOf(b);
    return pa - pb;
  });
}

/** Saca el elemento de `desde` y lo inserta en `hasta`. */
export function mover<T>(lista: T[], desde: number, hasta: number): T[] {
  if (desde < 0 || hasta < 0 || desde >= lista.length || hasta >= lista.length) return [...lista];
  const copia = [...lista];
  const [x] = copia.splice(desde, 1);
  copia.splice(hasta, 0, x);
  return copia;
}
