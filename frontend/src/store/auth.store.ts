import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../lib/api';

interface AuthUser {
  id:        string;
  email:     string;
  name:      string;
  role:      'ADMIN' | 'MANAGER' | 'AGENT' | 'CLIENT';
  clientId?: string;
}

interface AuthState {
  token:           string | null;
  refreshToken:    string | null;
  user:            AuthUser | null;
  isAuthenticated: boolean;
  login:          (token: string, user: AuthUser, refreshToken?: string) => void;
  logout:         () => void;
  clearSession:   () => void;
  setToken:       (token: string, refreshToken: string) => void;
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      login: (token, user, refreshToken) => {
        localStorage.setItem('auth_token', token);
        if (refreshToken) localStorage.setItem('auth_refresh_token', refreshToken);
        document.cookie = `auth_token=${token}; path=/; max-age=${60 * 60 * 24 * 7}`;
        set({ token, refreshToken: refreshToken ?? null, user, isAuthenticated: true });
      },
      // Best-effort: si el POST a /auth/logout falla (red caída, etc.) la
      // sesión local se limpia igual — el usuario no debe quedar atrapado
      // esperando una respuesta del servidor para poder salir.
      logout: () => {
        const refreshToken = localStorage.getItem('auth_refresh_token');
        if (refreshToken) {
          api.post('/auth/logout', { refreshToken }).catch(() => {});
        }
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_refresh_token');
        document.cookie = 'auth_token=; path=/; max-age=0';
        document.cookie = 'user_role=; path=/; max-age=0';
        set({ token: null, refreshToken: null, user: null, isAuthenticated: false });
      },
      clearSession: () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_refresh_token');
        localStorage.removeItem('auth_user');
        document.cookie = 'auth_token=; path=/; max-age=0';
        document.cookie = 'user_role=; path=/; max-age=0';
        set({ token: null, refreshToken: null, user: null, isAuthenticated: false });
      },
      setToken: (token, refreshToken) => {
        localStorage.setItem('auth_token', token);
        localStorage.setItem('auth_refresh_token', refreshToken);
        document.cookie = `auth_token=${token}; path=/; max-age=${60 * 60 * 24 * 7}`;
        set({ token, refreshToken });
      },
    }),
    {
      name: 'auth_user',
      partialize: (state) => ({ token: state.token, refreshToken: state.refreshToken, user: state.user, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        if (state?.token && isTokenExpired(state.token)) {
          state.clearSession();
        }
      },
    }
  )
);
