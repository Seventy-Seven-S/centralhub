'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, createContext, useContext } from 'react';
import { alCambiarCifras, CONSULTAS_DE_CIFRAS } from '@/lib/cifrasAlDia';

// ── Theme ──────────────────────────────────────────────────────────────────
type Theme = 'light' | 'dark';

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light',
  toggle: () => {},
});

export const useTheme = () => useContext(ThemeCtx);

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const stored = (localStorage.getItem('ch-theme') as Theme) ?? 'light';
    // localStorage solo existe en el navegador: leerlo en el render inicial
    // haría que el HTML del servidor y el del cliente no coincidan
    // (error de hidratación). Por eso se lee aquí, después de montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(stored);
    document.documentElement.classList.toggle('light', stored === 'light');
  }, []);

  function toggle() {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('ch-theme', next);
      document.documentElement.classList.toggle('light', next === 'light');
      return next;
    });
  }

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

// ── Providers ──────────────────────────────────────────────────────────────
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
  }));

  // Tarjetas de proyecto y tablero al día después de cualquier guardado.
  useEffect(() => alCambiarCifras(() => {
    CONSULTAS_DE_CIFRAS.forEach(queryKey => queryClient.invalidateQueries({ queryKey: [...queryKey] }));
  }), [queryClient]);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
