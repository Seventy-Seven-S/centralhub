import axios from 'axios';
import { refreshOnce } from './tokenRefreshLock';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Inyecta token en cada request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function forceLogout() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_refresh_token');
  localStorage.removeItem('auth_user');
  document.cookie = 'auth_token=; path=/; max-age=0';
  document.cookie = 'user_role=; path=/; max-age=0';
  const currentPath = window.location.pathname;
  if (currentPath.startsWith('/portal') || currentPath.startsWith('/mis-')) {
    window.location.href = '/portal';
  } else {
    window.location.href = '/login';
  }
}

async function doRefresh(): Promise<string> {
  const storedRefreshToken = localStorage.getItem('auth_refresh_token');
  if (!storedRefreshToken) throw new Error('No refresh token available');

  // Instancia sin interceptores: si esta llamada diera 401, no debe
  // reentrar en este mismo flujo de refresh.
  const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`, {
    refreshToken: storedRefreshToken,
  });

  const { accessToken, refreshToken: newRefreshToken } = response.data.data;
  localStorage.setItem('auth_token', accessToken);
  localStorage.setItem('auth_refresh_token', newRefreshToken);
  document.cookie = `auth_token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}`;
  return accessToken;
}

// Renueva la sesión de forma transparente antes de cerrarla. Si N requests
// reciben 401 a la vez, refreshOnce asegura un solo POST a /auth/refresh —
// todas comparten el resultado y reintentan con el token nuevo. Solo si el
// refresh también falla (vencido de verdad, o inválido) se cierra sesión.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/refresh') || originalRequest?.url?.includes('/auth/login');

    if (
      error.response?.status === 401 &&
      typeof window !== 'undefined' &&
      !isAuthEndpoint &&
      !originalRequest?._retriedAfterRefresh
    ) {
      originalRequest._retriedAfterRefresh = true;
      try {
        const newAccessToken = await refreshOnce(doRefresh);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch {
        forceLogout();
        return Promise.reject(error);
      }
    }

    if (error.response?.status === 401 && typeof window !== 'undefined') {
      forceLogout();
    }
    return Promise.reject(error);
  }
);

export default api;
