// Color con que cada usuario marca sus tarjetas de Proyectos. Es personal, como
// el orden: el arquitecto puede pintar por un motivo suyo y eso no debe
// confundir a nadie más.
//
// Se pinta como un velo translúcido sobre la superficie de la tarjeta, no como
// un fondo sólido: así el mismo color se ve pastel en modo claro y en oscuro, y
// el texto conserva su contraste.

export const COLORES_PROYECTO = {
  verde:    { nombre: 'Verde',    rgb: '74, 222, 128' },
  amarillo: { nombre: 'Amarillo', rgb: '250, 204, 21' },
  rojo:     { nombre: 'Rojo',     rgb: '248, 113, 113' },
  azul:     { nombre: 'Azul',     rgb: '96, 165, 250' },
  rosa:     { nombre: 'Rosa',     rgb: '244, 114, 182' },
  morado:   { nombre: 'Morado',   rgb: '167, 139, 250' },
} as const;

export type ColorProyecto = keyof typeof COLORES_PROYECTO;

const OPACIDAD_VELO = 0.18;

export function esColorProyecto(v: unknown): v is ColorProyecto {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(COLORES_PROYECTO, v);
}

/** Lo guardado viene del servidor tal cual lo mandó el cliente: lo que no sea
 *  un color conocido se descarta en vez de romper la pantalla. */
export function leerColores(v: unknown): Record<string, ColorProyecto> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([, c]) => esColorProyecto(c))) as Record<string, ColorProyecto>;
}

/** Asigna o quita (null) el color de un proyecto sin tocar los demás. */
export function conColor(actuales: Record<string, ColorProyecto>, projectId: string, color: ColorProyecto | null) {
  const resto = { ...actuales };
  delete resto[projectId];
  return color ? { ...resto, [projectId]: color } : resto;
}

export function veloDeColor(color: ColorProyecto, opacidad = OPACIDAD_VELO) {
  const c = `rgba(${COLORES_PROYECTO[color].rgb}, ${opacidad})`;
  return `linear-gradient(${c}, ${c})`;
}
