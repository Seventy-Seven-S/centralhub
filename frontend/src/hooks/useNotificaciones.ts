import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ── Tipos ──────────────────────────────────────────────────────────────────

export type NotificationType = 'RESERVATION' | 'CONTRACT' | 'PAYMENT';

export interface Notification {
  id:               string;
  type:             NotificationType;
  message:          string;
  read:             boolean;
  createdAt:        string;
  relatedEntity:    string | null;
  relatedEntityId:  string | null;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount:   number;
}

// El buzón vive en dos contextos con endpoints distintos:
//   staff  → /notifications         (ADMIN "copia de todo", MANAGER apartados;
//                                    el backend resuelve la audiencia por rol)
//   portal → /portal/notificaciones (cliente autenticado: solo las suyas)
export type NotificationScope = 'staff' | 'portal';

const BASE_PATH: Record<NotificationScope, string> = {
  staff:  '/notifications',
  portal: '/portal/notificaciones',
};

const queryKeyFor = (scope: NotificationScope) => ['notifications', scope];

// Refetch cada 45s para que las notificaciones lleguen solas sin intervención.
const REFETCH_INTERVAL = 45_000;

// ── Query ────────────────────────────────────────────────────────────────────

async function fetchNotifications(scope: NotificationScope): Promise<NotificationsResponse> {
  const { data } = await api.get(BASE_PATH[scope]);
  return {
    notifications: data.notifications ?? [],
    unreadCount:   data.unreadCount ?? 0,
  };
}

/**
 * Buzón de notificaciones.
 * Pasar `enabled: false` cuando el rol no tiene buzón en ese contexto
 * (la API devolvería 403).
 */
export function useNotificaciones(enabled = true, scope: NotificationScope = 'staff') {
  return useQuery<NotificationsResponse>({
    queryKey:        queryKeyFor(scope),
    queryFn:         () => fetchNotifications(scope),
    enabled,
    refetchInterval: enabled ? REFETCH_INTERVAL : false,
    staleTime:       30_000,
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useMarkNotificationRead(scope: NotificationScope = 'staff') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`${BASE_PATH[scope]}/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeyFor(scope) });
    },
  });
}

export function useMarkAllNotificationsRead(scope: NotificationScope = 'staff') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`${BASE_PATH[scope]}/read-all`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeyFor(scope) });
    },
  });
}
