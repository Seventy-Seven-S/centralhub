import { cn } from '@/lib/utils';
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
  accent = '#C9972C',
}: KPICardProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-2xl p-5 shadow-sm flex items-start gap-4',
        alert && 'border border-red-200'
      )}
    >
      {/* Ícono */}
      <div
        className="flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0"
        style={{ backgroundColor: alert ? '#FEE2E2' : `${accent}18` }}
      >
        <Icon className="w-6 h-6" style={{ color: alert ? '#DC2626' : accent }} />
      </div>

      {/* Texto */}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-500 font-medium truncate">{title}</p>
        <p
          className="text-2xl font-bold mt-0.5 leading-tight"
          style={{ color: alert ? '#DC2626' : '#0F1F3D' }}
        >
          {value}
        </p>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-1 truncate">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
