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

// ── Constantes ───────────────────────────────────────────────────────────────

const QUERY_KEY = ['notifications'];

// Refetch cada 45s para que las notificaciones lleguen solas sin intervención.
const REFETCH_INTERVAL = 45_000;

// ── Query ────────────────────────────────────────────────────────────────────

async function fetchNotifications(): Promise<NotificationsResponse> {
  const { data } = await api.get('/notifications');
  return {
    notifications: data.notifications ?? [],
    unreadCount:   data.unreadCount ?? 0,
  };
}

/**
 * Buzón de notificaciones del ADMIN.
 * Pasar `enabled: false` cuando el usuario no es ADMIN (la API es solo-ADMIN
 * y devolvería 403).
 */
export function useNotificaciones(enabled = true) {
  return useQuery<NotificationsResponse>({
    queryKey:        QUERY_KEY,
    queryFn:         fetchNotifications,
    enabled,
    refetchInterval: enabled ? REFETCH_INTERVAL : false,
    staleTime:       30_000,
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
