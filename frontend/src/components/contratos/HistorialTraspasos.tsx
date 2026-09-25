'use client';

import { ArrowRightLeft } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Persona { firstName: string; lastName: string }

export interface TraspasoEnFicha {
  numero: number;
  fecha: string;
  tipo: string;
  montoRespetado: number;
  montoAbonado: number;
  motivo: string | null;
  nota: string | null;
  clienteAnterior: Persona;
  clienteNuevo: Persona;
  contratoOrigen?: { codigoLegado: string | null; contractNumber: string } | null;
  contratoDestino?: { codigoLegado: string | null; contractNumber: string } | null;
}

const nombre = (p: Persona) => `${p.firstName} ${p.lastName}`;

/**
 * De quién viene este contrato.
 *
 * Un contrato traspasado se veía idéntico a uno que siempre fue del mismo
 * cliente: no había forma de saber que cambió de manos, ni de quién venía, ni
 * por qué. La nota del acta es justo lo que la secretaria necesita leer cuando
 * el cliente llega a preguntar.
 */
export function HistorialTraspasos({ traspasos }: { traspasos: TraspasoEnFicha[] }) {
  if (traspasos.length === 0) return null;

  return (
    <div className="rounded-2xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--surface)' }}>
      <div className="px-6 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <ArrowRightLeft className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          Este contrato cambió de manos
          {traspasos.length > 1 && (
            <span className="font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>({traspasos.length} veces)</span>
          )}
        </h3>
      </div>

      <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {traspasos.map(t => {
          const seQuedoSinRespetar = Math.round((t.montoAbonado - t.montoRespetado) * 100) / 100;
          return (
            <li key={t.numero} className="px-6 py-3.5">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span style={{ color: 'var(--text-tertiary)' }}>De</span>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{nombre(t.clienteAnterior)}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>a</span>
                <span className="font-semibold" style={{ color: 'var(--accent)' }}>{nombre(t.clienteNuevo)}</span>
              </div>

              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                {formatDate(t.fecha)}
                {' · '}
                {t.tipo === 'CAMBIO_TITULAR' ? 'Mismo lote, cambió el titular' : 'Se reubicó a otro lote'}
                {' · Se le respetaron '}
                {formatCurrency(t.montoRespetado)}
                {seQuedoSinRespetar > 0 && ` de ${formatCurrency(t.montoAbonado)} abonados`}
                {t.contratoDestino && ` · pasó a ${t.contratoDestino.codigoLegado ?? t.contratoDestino.contractNumber}`}
                {t.contratoOrigen && ` · viene de ${t.contratoOrigen.codigoLegado ?? t.contratoOrigen.contractNumber}`}
              </p>

              {t.motivo && (
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>Motivo: </span>{t.motivo}
                </p>
              )}
              {t.nota && (
                <p className="text-xs mt-1 px-2.5 py-1.5 rounded-lg"
                   style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                  {t.nota}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
