'use client';

import { Handshake } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export interface ParteDelReparto {
  porcentaje: number;
  leToca: number;
  entregado: number;
  falta: number;
  avance: number;
}

export interface Reparto {
  valorBase: number;
  dueno: ParteDelReparto;
  central: ParteDelReparto;
  repartido: number;
  avanceTotal: number;
  desbalance: number;
  nota: string | null;
}

/**
 * Cómo va el reparto del valor del proyecto entre el dueño del terreno y la
 * inmobiliaria. Solo aparece en los proyectos que tienen acuerdo.
 *
 * El avance de cada parte se mide contra LO QUE LE TOCA, no contra el valor
 * total: "al dueño le falta el 90% de su parte" es la pregunta que responde, y
 * medirlo contra el proyecto entero lo volvería incomparable con el de Central.
 */
export function RepartoProyecto({ reparto }: { reparto: Reparto }) {
  const partes: Array<{ nombre: string; p: ParteDelReparto; color: string }> = [
    { nombre: 'Dueño del terreno', p: reparto.dueno, color: 'var(--gold)' },
    { nombre: 'Central Inmobiliaria', p: reparto.central, color: 'var(--accent)' },
  ];

  return (
    <div className="rounded-2xl shadow-sm p-5 space-y-4" style={{ backgroundColor: 'var(--surface)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Handshake className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Acuerdo de reparto {reparto.dueno.porcentaje}/{reparto.central.porcentaje}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Sobre {formatCurrency(reparto.valorBase)}, el valor pactado del proyecto
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{reparto.avanceTotal}%</p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>repartido</p>
        </div>
      </div>

      <div className="space-y-3">
        {partes.map(({ nombre, p, color }) => (
          <div key={nombre} className="space-y-1.5">
            <div className="flex items-baseline justify-between text-xs gap-2">
              <span style={{ color: 'var(--text-secondary)' }}>
                {nombre} <span style={{ color: 'var(--text-tertiary)' }}>· {p.porcentaje}% = {formatCurrency(p.leToca)}</span>
              </span>
              <span className="font-semibold shrink-0" style={{ color: 'var(--text-primary)' }}>{p.avance}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <div className="h-full rounded-full transition-all duration-700"
                   style={{ width: `${Math.min(100, p.avance)}%`, backgroundColor: color }} />
            </div>
            <div className="flex justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
              <span>Recibido {formatCurrency(p.entregado)}</span>
              <span>Falta {formatCurrency(p.falta)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* El desbalance y la nota del acuerdo siguen en la API y en la base, pero
          no se pintan: el bloque se lee mejor cerrando con las dos barras. */}
    </div>
  );
}
