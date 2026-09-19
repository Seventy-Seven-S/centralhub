// Lógica pura del formulario de traspaso (sin React), para poder probarla.
// Las mismas reglas viven en el backend (services/lib/traspaso.ts): aquí es
// para que la secretaria vea el error antes de enviar, no para confiar en el
// cliente.

export interface FormTraspaso {
  clienteNuevoId: string;
  lotIdsDestino: string[];
  projectIdDestino: string;
  montoRespetado: string;
  abonado: number;
  nota: string;
}

const aNumero = (s: string) => {
  const n = Number((s ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export function resumenDinero(abonado: number, montoRespetado: string) {
  const respetado = aNumero(montoRespetado);
  const sePierde = Math.round((abonado - respetado) * 100) / 100;
  return { respetado, sePierde: Math.max(0, sePierde), hayDiferencia: Math.abs(sePierde) >= 0.5 };
}

export function validarFormularioTraspaso(f: FormTraspaso): string | null {
  if (!f.clienteNuevoId) return 'Elige al cliente que recibe';
  if (!f.lotIdsDestino.length) return 'Elige al menos un lote destino';
  if (!f.projectIdDestino) return 'Elige el proyecto destino';

  const { respetado, hayDiferencia } = resumenDinero(f.abonado, f.montoRespetado);
  if (respetado < 0) return 'El monto no puede ser negativo';
  if (respetado > f.abonado + 0.5) return 'No puedes respetar más de lo abonado por el cliente';
  if (hayDiferencia && !f.nota.trim()) return 'No se respeta todo lo abonado: escribe una nota explicando por qué';
  return null;
}

/**
 * Los listados del API responden `{ status, data: { projects: [...] } }`, pero
 * algunos endpoints devuelven el arreglo directo. El modal leía `data.data` a
 * secas y recibía el objeto envoltorio, así que `proyectos.map` reventaba y se
 * caía la pantalla completa del contrato.
 */
export function listaDe<T>(cuerpo: unknown, clave: string): T[] {
  if (Array.isArray(cuerpo)) return cuerpo as T[];
  if (cuerpo && typeof cuerpo === 'object') {
    const dentro = (cuerpo as Record<string, unknown>)[clave];
    if (Array.isArray(dentro)) return dentro as T[];
  }
  return [];
}
