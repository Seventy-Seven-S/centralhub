import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  icon:      LucideIcon;
  title:     string;
  value:     string | number;
  subtitle?: string;
  alert?:    boolean;
  accent?:   string;
}

export default function KPICard({
  icon: Icon,
  title,
  value,
  subtitle,
  alert = false,
  accent = 'var(--accent)',
}: KPICardProps) {
  return (
    <div
      className="rounded-2xl p-5 flex items-start gap-4"
      style={{
        backgroundColor: 'var(--surface)',
        border: alert ? '1px solid var(--danger)' : '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Ícono */}
      <div
        className="flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0"
        style={{ backgroundColor: alert ? 'var(--danger-pale)' : 'var(--accent-pale)' }}
      >
        <Icon
          className="w-6 h-6"
          style={{ color: alert ? 'var(--danger)' : accent }}
        />
      </div>

      {/* Texto */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
          {title}
        </p>
        <p
          className="text-2xl font-bold mt-0.5 leading-tight"
          style={{ color: alert ? 'var(--danger)' : 'var(--text-primary)' }}
        >
          {value}
        </p>
        {subtitle && (
          <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-tertiary)' }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
