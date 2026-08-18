import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshOnce } from './tokenRefreshLock';

describe('refreshOnce — un solo refresh en curso, aunque N requests lo pidan a la vez', () => {
  it('N llamadas concurrentes → doRefresh se ejecuta UNA sola vez, todas reciben el mismo resultado', async () => {
    let calls = 0;
    let resolvePending: (token: string) => void;
    const pending = new Promise<string>((resolve) => { resolvePending = resolve; });
    const doRefresh = vi.fn(() => {
      calls++;
      return pending;
    });

    // 5 "requests" que dieron 401 al mismo tiempo, todas piden refresh
    const results = Promise.all([
      refreshOnce(doRefresh),
      refreshOnce(doRefresh),
      refreshOnce(doRefresh),
      refreshOnce(doRefresh),
      refreshOnce(doRefresh),
    ]);

    expect(calls).toBe(1); // el lock ya evitó los otros 4 antes de resolver nada

    resolvePending!('new-access-token');
    const tokens = await results;

    expect(tokens).toEqual(Array(5).fill('new-access-token'));
    expect(doRefresh).toHaveBeenCalledTimes(1);
  });

  it('el refresh en curso falla → todas las llamadas en espera se rechazan, ninguna queda colgada', async () => {
    let rejectPending: (err: Error) => void;
    const pending = new Promise<string>((_, reject) => { rejectPending = reject; });
    const doRefresh = vi.fn(() => pending);

    const call1 = refreshOnce(doRefresh);
    const call2 = refreshOnce(doRefresh);
    const call3 = refreshOnce(doRefresh);

    rejectPending!(new Error('refresh token vencido'));

    await expect(call1).rejects.toThrow('refresh token vencido');
    await expect(call2).rejects.toThrow('refresh token vencido');
    await expect(call3).rejects.toThrow('refresh token vencido');
    expect(doRefresh).toHaveBeenCalledTimes(1);
  });

  it('el lock se libera después de resolver — la siguiente ronda dispara un doRefresh nuevo', async () => {
    const doRefresh = vi.fn()
      .mockResolvedValueOnce('token-round-1')
      .mockResolvedValueOnce('token-round-2');

    const first = await refreshOnce(doRefresh);
    const second = await refreshOnce(doRefresh);

    expect(first).toBe('token-round-1');
    expect(second).toBe('token-round-2');
    expect(doRefresh).toHaveBeenCalledTimes(2);
  });

  it('el lock se libera después de un fallo — el siguiente intento dispara un doRefresh nuevo, no reusa el rechazo viejo', async () => {
    const doRefresh = vi.fn()
      .mockRejectedValueOnce(new Error('primer intento falló'))
      .mockResolvedValueOnce('token-tras-reintentar');

    await expect(refreshOnce(doRefresh)).rejects.toThrow('primer intento falló');
    const second = await refreshOnce(doRefresh);

    expect(second).toBe('token-tras-reintentar');
    expect(doRefresh).toHaveBeenCalledTimes(2);
  });
});
