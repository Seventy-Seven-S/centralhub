// ¿Este error significa que la sesión de verdad se acabó?
//
// Antes, cualquier fallo al renovar el token cerraba la sesión. Eso incluía un
// parpadeo de internet o el backend reiniciándose por un despliegue: la
// secretaria estaba capturando y de golpe aparecía en la pantalla de acceso,
// varias veces al día.
//
// Solo cuenta como sesión vencida si el SERVIDOR RESPONDIÓ diciendo que las
// credenciales no sirven. Si no hubo respuesta, o el servidor falló por su
// cuenta, la sesión sigue viva y lo correcto es dejar que la operación falle
// y que la persona reintente.

export function laSesionDeVerdadExpiro(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
}

/**
 * ¿El servidor dijo que esto no existe, o simplemente no se pudo consultar?
 *
 * Las pantallas de detalle mostraban "no encontrado" ante cualquier error, así
 * que un parpadeo de red se leía como "el registro se borró". Son dos cosas
 * distintas y el usuario necesita saber cuál le tocó: una se resuelve
 * reintentando y la otra no.
 */
export function esNoEncontrado(error: unknown): boolean {
  return (error as { response?: { status?: number } })?.response?.status === 404;
}
