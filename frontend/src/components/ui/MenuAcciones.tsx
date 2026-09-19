'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface AccionMenu {
  label: string;
  icono: React.ReactNode;
  onClick: () => void;
  /** Acciones que no se deshacen: se pintan en rojo y van al final. */
  peligrosa?: boolean;
  disabled?: boolean;
  /** Texto de estado mientras la acción corre (abrir un PDF, subir un archivo). */
  cargando?: string;
}

/**
 * Menú de acciones de una pantalla de detalle.
 *
 * Existe porque el encabezado del contrato acumulaba diez botones en fila y la
 * información que la secretaria necesita de un golpe competía con ellos por el
 * mismo espacio.
 */
export function MenuAcciones({ acciones }: { acciones: AccionMenu[] }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  const visibles = acciones.filter(Boolean);
  if (visibles.length === 0) return null;

  const ordenadas = [...visibles.filter(a => !a.peligrosa), ...visibles.filter(a => a.peligrosa)];

  return (
    <div className="relative" ref={caja}>
      <button
        onClick={() => setAbierto(v => !v)}
        aria-label="Acciones del contrato"
        aria-expanded={abierto}
        className="flex items-center justify-center w-9 h-9 rounded-xl shadow-sm transition hover:opacity-80"
        style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}
      >
        <MoreHorizontal className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
      </button>

      {abierto && (
        <div
          className="absolute right-0 mt-1.5 w-60 rounded-xl shadow-lg overflow-hidden z-20 py-1"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {ordenadas.map((a, i) => (
            <button
              key={i}
              onClick={() => { setAbierto(false); a.onClick(); }}
              disabled={a.disabled}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left transition hover:opacity-70 disabled:opacity-40"
              style={{ color: a.peligrosa ? 'var(--danger)' : 'var(--text-primary)' }}
            >
              <span className="shrink-0">{a.icono}</span>
              <span>{a.cargando ?? a.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
