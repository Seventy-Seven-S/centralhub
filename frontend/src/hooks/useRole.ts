import { useAuthStore } from '@/store/auth.store';

export function useRole() {
  const role = useAuthStore((s) => s.user?.role ?? null);

  return {
    role,
    isAdmin:            role === 'ADMIN',
    isManager:          role === 'MANAGER',
    isAgent:            role === 'AGENT',
    canAccessDashboard: role === 'ADMIN',
    canManageContracts: role === 'ADMIN' || role === 'MANAGER',
    canOnlyViewLots:    role === 'AGENT',
  };
}
