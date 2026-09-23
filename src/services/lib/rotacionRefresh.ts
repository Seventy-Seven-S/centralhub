// Rotación del token de sesión.
//
// Cada vez que se renueva la sesión se entrega un token nuevo y el anterior
// deja de servir. Eso está bien: si alguien roba un token, deja de valer en
// cuanto el dueño renueve.
//
// El problema es que se invalidaba en el MISMO INSTANTE. Con dos pestañas
// abiertas —lo normal en ventanilla— las dos renuevan casi a la vez, la
// segunda llega con el token que la primera acabó de gastar, y a la secretaria
// la sacaban del sistema en plena captura.
//
// La solución es una gracia corta: un token recién rotado se sigue aceptando
// unos segundos, los suficientes para que las peticiones que ya venían en
// camino no queden fuera. Pasada la gracia se rechaza, que es lo que protege
// contra un token robado.

export const GRACIA_ROTACION_MS = 30_000;

export interface TokenGuardado {
  expiresAt: Date;
  /** Cuándo se usó para renovar. null si nunca se ha usado. */
  rotatedAt: Date | null;
}

export type Decision =
  | { aceptar: true; rotar: boolean }
  | { aceptar: false; motivo: 'inexistente' | 'vencido' | 'ya rotado' };

export function decidirRotacion(token: TokenGuardado | null, ahora: Date = new Date()): Decision {
  if (!token) return { aceptar: false, motivo: 'inexistente' };
  if (token.expiresAt < ahora) return { aceptar: false, motivo: 'vencido' };

  if (token.rotatedAt) {
    const transcurrido = ahora.getTime() - token.rotatedAt.getTime();
    if (transcurrido > GRACIA_ROTACION_MS) return { aceptar: false, motivo: 'ya rotado' };
    // Dentro de la gracia: se entregan tokens nuevos pero no se vuelve a
    // marcar la rotación, para que la ventana no se alargue sola.
    return { aceptar: true, rotar: false };
  }

  return { aceptar: true, rotar: true };
}
