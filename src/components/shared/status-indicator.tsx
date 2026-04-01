'use client';

import { cn } from '@/lib/utils';

export type StatusLevel = 'normal' | 'warning' | 'critical' | 'inactive';

interface StatusIndicatorProps {
  status: StatusLevel;
  label?: string;
  count?: number;
  size?: 'sm' | 'md' | 'lg';
  showPulse?: boolean;
  className?: string;
}

const statusConfig: Record<StatusLevel, { color: string; bg: string; ring: string; label: string }> = {
  normal: {
    color: 'bg-blue-500',
    bg: 'bg-blue-500/10',
    ring: 'ring-blue-500/30',
    label: '정상',
  },
  warning: {
    color: 'bg-orange-500',
    bg: 'bg-orange-500/10',
    ring: 'ring-orange-500/30',
    label: '경고',
  },
  critical: {
    color: 'bg-red-500',
    bg: 'bg-red-500/10',
    ring: 'ring-red-500/30',
    label: '위험',
  },
  inactive: {
    color: 'bg-slate-500',
    bg: 'bg-slate-500/10',
    ring: 'ring-slate-500/30',
    label: '비활성',
  },
};

const sizeConfig = {
  sm: { dot: 'h-2 w-2', text: 'text-xs', badge: 'px-1.5 py-0.5' },
  md: { dot: 'h-2.5 w-2.5', text: 'text-sm', badge: 'px-2 py-1' },
  lg: { dot: 'h-3 w-3', text: 'text-base', badge: 'px-2.5 py-1' },
};

export function StatusIndicator({
  status,
  label,
  count,
  size = 'md',
  showPulse = false,
  className,
}: StatusIndicatorProps) {
  const config = statusConfig[status];
  const sizes = sizeConfig[size];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md ring-1',
        config.bg,
        config.ring,
        sizes.badge,
        className
      )}
    >
      <span className="relative flex">
        <span className={cn('rounded-full', config.color, sizes.dot)} />
        {showPulse && (
          <span
            className={cn(
              'absolute inset-0 rounded-full opacity-75 animate-ping',
              config.color
            )}
          />
        )}
      </span>
      <span className={cn('font-medium text-foreground', sizes.text)}>
        {label ?? config.label}
      </span>
      {count !== undefined && (
        <span className={cn('font-mono font-bold text-foreground', sizes.text)}>
          {count}
        </span>
      )}
    </div>
  );
}

export function StatusSummaryBar({
  normal = 0,
  warning = 0,
  critical = 0,
  inactive = 0,
  className,
}: {
  normal?: number;
  warning?: number;
  critical?: number;
  inactive?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <StatusIndicator status="normal" count={normal} size="sm" />
      <StatusIndicator status="warning" count={warning} size="sm" />
      <StatusIndicator status="critical" count={critical} size="sm" />
      {inactive > 0 && (
        <StatusIndicator status="inactive" count={inactive} size="sm" />
      )}
    </div>
  );
}

export function getStatusLevel(
  value: number,
  warningThreshold: number,
  criticalThreshold: number
): StatusLevel {
  if (value >= criticalThreshold) return 'critical';
  if (value >= warningThreshold) return 'warning';
  return 'normal';
}
