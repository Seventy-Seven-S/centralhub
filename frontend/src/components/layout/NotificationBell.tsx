'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, Calendar, FileText, DollarSign, CheckCheck } from 'lucide-react';
import { useRole } from '@/hooks/useRole';
import {
  useNotificaciones,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type Notification,
  type NotificationType,
} from '@/hooks/useNotificaciones';
import { formatRelativeTime } from '@/lib/utils';

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  RESERVATION: Calendar,
  CONTRACT:    FileText,
  PAYMENT:     DollarSign,
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { isAdmin } = useRole();
  const { data, isLoading } = useNotificaciones(isAdmin);
  const markRead    = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const notifications = data?.notifications ?? [];
  const unreadCount   = data?.unreadCount ?? 0;

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleItemClick(n: Notification) {
    if (!n.read) markRead.mutate(n.id);
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Botón campana */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          color: open ? 'var(--accent)' : 'var(--text-secondary)',
          borderColor: open ? 'var(--accent)' : 'var(--border)',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)';
          (e.currentTarget as HTMLElement).style.color = 'var(--accent)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.borderColor = open ? 'var(--accent)' : 'var(--border)';
          (e.currentTarget as HTMLElement).style.color = open ? 'var(--accent)' : 'var(--text-secondary)';
        }}
        aria-label="Notificaciones"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold leading-none"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel dropdown */}
      {open && (
        <div
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl overflow-hidden z-50"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.15))',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Notificaciones
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="flex items-center gap-1 text-xs font-medium transition-colors disabled:opacity-50"
                style={{ color: 'var(--accent)' }}
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Marcar todas
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                Cargando…
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                No tienes notificaciones
              </div>
            ) : (
              notifications.map(n => {
                const Icon = TYPE_ICON[n.type] ?? Bell;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      backgroundColor: n.read ? 'transparent' : 'var(--accent-pale)',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        n.read ? 'transparent' : 'var(--accent-pale)';
                    }}
                  >
                    <span
                      className="mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--accent)' }}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span
                        className="block text-sm leading-snug"
                        style={{
                          color: 'var(--text-primary)',
                          fontWeight: n.read ? 400 : 600,
                        }}
                      >
                        {n.message}
                      </span>
                      <span className="block text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {formatRelativeTime(n.createdAt)}
                      </span>
                    </span>
                    {!n.read && (
                      <span
                        className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: 'var(--accent)' }}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
