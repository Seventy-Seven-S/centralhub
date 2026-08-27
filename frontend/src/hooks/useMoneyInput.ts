import { useState, ChangeEvent } from 'react';

// Mismo patrón ya probado en el repo para el campo "Anticipo"
// (frontend/src/app/(admin)/lotes/page.tsx, rama fix/anticipo-mxn-format):
// separa el valor REAL (número) del valor VISUAL (texto del input).
// Mientras el campo tiene foco se muestran los dígitos crudos tal cual
// los teclea el usuario — nunca se reformatea en vivo, así el cursor no
// salta. Al perder el foco se reemplaza por el formato $x,xxx.xx.
//
// A propósito NO usa formatMoney de reciboHelpers.ts: ese formateador
// manual existe porque el entorno de render de @react-pdf/renderer
// tiene ICU incompleto. Un <input> normal del navegador no tiene ese
// problema — toLocaleString/Intl funciona bien aquí.

// Solo dígitos y UN punto decimal — si el usuario teclea un segundo
// punto, se descarta (no se inserta), igual que el precedente de Anticipo.
export function parseMoneyDigits(raw: string): string {
  return raw.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
}

// Vacío para 0 o negativo — mismo criterio "sin cero pegado" del
// precedente: un campo de monto vacío se lee mejor que "$0.00".
export function formatMoneyForDisplay(n: number): string {
  if (!n || n <= 0) return '';
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface UseMoneyInputResult {
  value: number;
  setValue: (n: number) => void;
  inputProps: {
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

  return {
    value,
    setValue,
    inputProps: {
      type: 'text',
      inputMode: 'decimal',
      value: focused ? text : formatMoneyForDisplay(value),
      onFocus: () => {
        setText(value > 0 ? String(value) : '');
        setFocused(true);
      },
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        const raw = parseMoneyDigits(e.target.value);
        setText(raw);
        setValue(Number(raw) || 0);
      },
      onBlur: () => setFocused(false),
    },
  };
}
