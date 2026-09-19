'use client';

import { useRef, useLayoutEffect, useState, InputHTMLAttributes } from 'react';
import {
  soloNumero, formatearMientrasTeclea, formatearAlSalir, cursorTrasFormatear,
} from '@/lib/formatoMoneda';

type PropsHeredadas = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>;

interface Props extends PropsHeredadas {
  /** El número como texto limpio, sin formato: "250000" o "3473.5". */
  valor: string;
  onValorChange: (valor: string) => void;
}

/**
 * Campo para teclear dinero. Muestra $250,000.00 mientras se escribe y entrega
 * el número limpio al formulario, así nadie tiene que acordarse de quitar las
 * comas antes de mandar al backend.
 *
 * El cursor se recoloca a mano después de cada tecla: sin eso, insertar una
 * coma lo manda al final del campo y teclear en medio de una cifra se vuelve
 * imposible.
 */
export function InputMoneda({ valor, onValorChange, onBlur, onFocus, ...resto }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const cursorDeseado = useRef<number | null>(null);
  const [enFoco, setEnFoco] = useState(false);

  useLayoutEffect(() => {
    if (cursorDeseado.current !== null && ref.current) {
      ref.current.setSelectionRange(cursorDeseado.current, cursorDeseado.current);
      cursorDeseado.current = null;
    }
  });

  const mostrado = enFoco ? formatearMientrasTeclea(valor) : formatearAlSalir(valor);

  return (
    <input
      {...resto}
      ref={ref}
      type="text"
      inputMode="decimal"
      value={mostrado}
      onFocus={e => { setEnFoco(true); onFocus?.(e); }}
      onBlur={e => { setEnFoco(false); onBlur?.(e); }}
      onChange={e => {
        const texto = e.target.value;
        const hasta = e.target.selectionStart ?? texto.length;
        // Cuántos dígitos quedaban a la izquierda del cursor: es lo único que
        // sobrevive al reformateo, las comas se recalculan.
        const digitosAntes = soloNumero(texto.slice(0, hasta)).length;

        const limpio = soloNumero(texto);
        cursorDeseado.current = cursorTrasFormatear(formatearMientrasTeclea(limpio), digitosAntes);
        onValorChange(limpio);
      }}
    />
  );
}
