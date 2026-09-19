// Formato de los campos donde se teclea dinero.
//
// El hook anterior (useMoneyInput) solo formateaba al salir del campo, y su
// propio comentario explicaba por qué: formatear en vivo hacía saltar el
// cursor. Eso se resuelve recolocando el cursor a mano, contando cuántos
// dígitos quedaban a su izquierda — ver cursorTrasFormatear.
//
// A propósito NO se usa formatMoney de reciboHelpers.ts: ese formateador
// manual existe porque el entorno de @react-pdf/renderer tiene ICU incompleto.
// Un <input> del navegador no tiene ese problema.

/** Deja solo dígitos, un punto decimal y como mucho dos decimales. */
export function soloNumero(raw: string): string {
  const limpio = (raw ?? '').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
  const punto = limpio.indexOf('.');
  return punto === -1 ? limpio : limpio.slice(0, punto + 3);
}

/**
 * Cómo se ve el campo mientras se teclea.
 *
 * Los decimales se respetan tal cual van: quien escribió "1234." todavía no
 * termina de teclear y completarle ".00" le movería el cursor a media captura.
 * El relleno a dos decimales ocurre al salir del campo.
 */
export function formatearMientrasTeclea(raw: string): string {
  const n = soloNumero(raw);
  if (n === '') return '';

  const [entera, decimal] = n.split('.');
  const conComas = (entera === '' ? '0' : entera).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${conComas}${n.includes('.') ? `.${decimal ?? ''}` : ''}`;
}

/** Valor con los dos decimales completos, para cuando el campo pierde el foco. */
export function formatearAlSalir(raw: string): string {
  const n = soloNumero(raw);
  if (n === '' || Number(n) === 0) return '';
  return `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Dónde dejar el cursor después de reformatear.
 *
 * `digitosAntes` es cuántos dígitos (y el punto) había a la izquierda del
 * cursor en lo que el usuario tecleó. Se avanza sobre el texto ya formateado
 * hasta haber pasado esa misma cantidad, de modo que las comas que se
 * insertaron no arrastren el cursor.
 */
export function cursorTrasFormatear(formateado: string, digitosAntes: number): number {
  let vistos = 0;
  for (let i = 0; i < formateado.length; i++) {
    if (/[\d.]/.test(formateado[i])) {
      vistos++;
      if (vistos > digitosAntes) return i;
    }
  }
  return formateado.length;
}

/** El número real detrás del formato. */
export function aNumero(texto: string): number {
  const n = Number(soloNumero(texto));
  return Number.isFinite(n) ? n : 0;
}
