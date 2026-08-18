// Si N requests reciben 401 al mismo tiempo (token vencido), no deben
// disparar N refreshes en paralelo — deben compartir uno solo y todas
// reintentar con el mismo resultado. Este lock guarda la promesa del
// refresh en curso; una nueva llamada mientras hay una activa la reutiliza
// en vez de invocar doRefresh de nuevo. Se libera al resolver o rechazar
// (éxito o fallo), así la siguiente ronda de 401s dispara un refresh nuevo.
let inFlight: Promise<string> | null = null;

export function refreshOnce(doRefresh: () => Promise<string>): Promise<string> {
  if (!inFlight) {
    inFlight = doRefresh().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
