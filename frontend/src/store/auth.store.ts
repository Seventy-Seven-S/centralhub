import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser {
  id:        string;
  email:     string;
  name:      string;
  role:      'ADMIN' | 'MANAGER' | 'AGENT' | 'CLIENT';
  clientId?: string;
}

interface AuthState {
  token:           string | null;
  user:            AuthUser | null;
  isAuthenticated: boolean;
  login:          (token: string, user: AuthUser) => void;
  logout:         () => void;
  clearSession:   () => void;
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
      user: null,
      isAuthenticated: false,
      login: (token, user) => {
        localStorage.setItem('auth_token', token);
        document.cookie = `auth_token=${token}; path=/; max-age=${60 * 60 * 24 * 7}`;
        set({ token, user, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem('auth_token');
        document.cookie = 'auth_token=; path=/; max-age=0';
        document.cookie = 'user_role=; path=/; max-age=0';
        set({ token: null, user: null, isAuthenticated: false });
      },
      clearSession: () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        document.cookie = 'auth_token=; path=/; max-age=0';
        document.cookie = 'user_role=; path=/; max-age=0';
        set({ token: null, user: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth_user',
      partialize: (state) => ({ token: state.token, user: state.user, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        if (state?.token && isTokenExpired(state.token)) {
          state.clearSession();
        }
      },
    }
  )
);
