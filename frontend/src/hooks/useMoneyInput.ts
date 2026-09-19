import { useState, useRef, useLayoutEffect, ChangeEvent, RefObject } from 'react';
import {
  soloNumero, formatearMientrasTeclea, formatearAlSalir, cursorTrasFormatear, aNumero,
} from '@/lib/formatoMoneda';

// Campo de dinero para formularios que guardan el monto como NÚMERO (los dos
// modales de cobro). Misma presentación que InputMoneda: $250,000.00 mientras
// se teclea, con el cursor recolocado a mano para que insertar una coma no lo
// mande al final del campo.
//
// Se reexportan los nombres viejos porque sus pruebas los usan.
export const parseMoneyDigits = soloNumero;
// Ojo: soloNumero tira el signo menos, así que un negativo pasado directo se
// volvería positivo. Cero o menos se muestra vacío.
export const formatMoneyForDisplay = (n: number) => (!n || n <= 0 ? '' : formatearAlSalir(String(n)));

export interface UseMoneyInputResult {
  value: number;
  setValue: (n: number) => void;
  inputProps: {
    ref: RefObject<HTMLInputElement | null>;
    type: 'text';
    inputMode: 'decimal';
    value: string;
    onFocus: () => void;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onBlur: () => void;
  };
}

export function useMoneyInput(initialValue: number = 0): UseMoneyInputResult {
  const [value, setValue] = useState(initialValue);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const cursorDeseado = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (cursorDeseado.current !== null && ref.current) {
      ref.current.setSelectionRange(cursorDeseado.current, cursorDeseado.current);
      cursorDeseado.current = null;
    }
  });

  return {
    value,
    setValue: (n: number) => { setValue(n); setText(n > 0 ? String(n) : ''); },
    inputProps: {
      ref,
      type: 'text',
      inputMode: 'decimal',
      value: focused ? formatearMientrasTeclea(text) : formatMoneyForDisplay(value),
      onFocus: () => {
        setText(value > 0 ? String(value) : '');
        setFocused(true);
      },
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        const escrito = e.target.value;
        const hasta = e.target.selectionStart ?? escrito.length;
        const digitosAntes = soloNumero(escrito.slice(0, hasta)).length;

        const limpio = soloNumero(escrito);
        cursorDeseado.current = cursorTrasFormatear(formatearMientrasTeclea(limpio), digitosAntes);
        setText(limpio);
        setValue(aNumero(limpio));
      },
      onBlur: () => setFocused(false),
    },
  };
}
