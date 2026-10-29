import { useAuthStore } from '@/store/auth.store';

export function useRole() {
  const role = useAuthStore((s) => s.user?.role ?? null);

  return {
    role,
    isAdmin:            role === 'ADMIN',
    isManager:          role === 'MANAGER',
    isAgent:            role === 'AGENT',
    // Dueño de uno o más proyectos: solo consulta, nada de capturar ni editar.
    isSocio:            role === 'SOCIO',
    canAccessDashboard: role === 'ADMIN' || role === 'MANAGER',
    canManageContracts: role === 'ADMIN' || role === 'MANAGER',
    canOnlyViewLots:    role === 'AGENT',
  };
}
