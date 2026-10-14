// Monto en letra para recibos: "CATORCE MIL DOSCIENTOS CINCUENTA PESOS 00/100 M.N."
// Lo que se firma de recibido tiene que decir la cantidad también en letra.

const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function hasta999(n: number): string {
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100), r = n % 100;
  const resto = r < 30 ? UNIDADES[r] : `${DECENAS[Math.floor(r / 10)]}${r % 10 ? ` Y ${UNIDADES[r % 10]}` : ''}`;
  return [CENTENAS[c], resto].filter(Boolean).join(' ');
}

function entero(n: number): string {
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1_000_000), miles = Math.floor((n % 1_000_000) / 1000), resto = n % 1000;
  return [
    millones ? (millones === 1 ? 'UN MILLÓN' : `${entero(millones)} MILLONES`) : '',
    miles ? (miles === 1 ? 'MIL' : `${hasta999(miles)} MIL`) : '',
    resto ? hasta999(resto) : '',
  ].filter(Boolean).join(' ');
}

export function cantidadEnLetra(monto: number): string {
  const centavos = Math.round(Math.abs(monto) * 100);
  const pesos = Math.floor(centavos / 100);
  const cts = String(centavos % 100).padStart(2, '0');
  // "UN MILLÓN DE PESOS", pero "UN MILLÓN DOSCIENTOS MIL PESOS".
  const de = pesos >= 1_000_000 && pesos % 1_000_000 === 0 ? ' DE' : '';
  return `${entero(pesos)}${de} ${pesos === 1 ? 'PESO' : 'PESOS'} ${cts}/100 M.N.`;
}
