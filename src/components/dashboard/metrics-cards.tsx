'use client';

/**
 * Dashboard Metrics Cards Components
 * TMS 2.0 구현 가이드 기반 대시보드 메트릭 카드 컴포넌트
 */

import { cn } from '@/lib/utils';

// Color constants
export const COLORS = {
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  orange: '#f97316',
  pink: '#ec4899',
  gray: '#6b7280',
};

// Stat Card Component
interface StatCardProps {
  label: string;
  value: number | string;
  unit?: string;
  color?: string;
  subtitle?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  unit,
  color = COLORS.cyan,
  subtitle,
  className,
}: StatCardProps) {
  return (
    <div className={cn('bg-gray-800 rounded-lg p-4 border border-gray-700', className)}>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold" style={{ color }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {unit && <span className="text-sm text-gray-500">{unit}</span>}
      </div>
      {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
    </div>
  );
}

// Gauge Component
interface GaugeProps {
  label: string;
  value: number;
  max?: number;
  thresholds?: [number, number];
  className?: string;
}

export function Gauge({
  label,
  value,
  max = 100,
  thresholds = [70, 85],
  className,
}: GaugeProps) {
  const pct = (value / max) * 100;
  const color =
    pct >= thresholds[1]
      ? COLORS.red
      : pct >= thresholds[0]
        ? COLORS.yellow
        : COLORS.green;

  return (
    <div className={cn('bg-gray-800 rounded-lg p-4 border border-gray-700', className)}>
      <div className="text-xs text-gray-400 mb-3">{label}</div>
      <div className="relative h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="absolute h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-lg font-bold" style={{ color }}>
          {value.toFixed(1)}%
        </span>
        <span className="text-xs text-gray-500">{max}%</span>
      </div>
    </div>
  );
}

// Tablespace Bar Component
interface TablespaceBarProps {
  name: string;
  pct: number;
  used: number;
  max: number;
}

export function TablespaceBar({ name, pct, used, max }: TablespaceBarProps) {
  const color = pct >= 90 ? COLORS.red : pct >= 75 ? COLORS.yellow : COLORS.green;

  return (
    <div className="py-2">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-white">{name}</span>
        <span className="text-gray-400">
          {used.toFixed(1)} / {max.toFixed(1)} GB
        </span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="text-right text-xs mt-0.5" style={{ color }}>
        {pct}%
      </div>
    </div>
  );
}

// Alert Banner Component
interface BlockedSession {
  sid: number;
  username: string;
  waitEvent: string;
  waitSec: number;
  blocker: number;
}

interface AlertBannerProps {
  sessions: BlockedSession[];
  className?: string;
}

export function AlertBanner({ sessions, className }: AlertBannerProps) {
  if (sessions.length === 0) return null;

  return (
    <div
      className={cn(
        'bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-4',
        className
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
        <span className="text-red-400 font-semibold">
          {sessions.length} Blocked Session(s) Detected
        </span>
      </div>
      <div className="space-y-2">
        {sessions.map((s, i) => (
          <div key={i} className="bg-muted/50 rounded p-3 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>
                <span className="text-gray-500">SID:</span>{' '}
                <span className="text-red-400 font-mono">{s.sid}</span>
              </span>
              <span>
                <span className="text-gray-500">User:</span>{' '}
                <span className="text-white">{s.username}</span>
              </span>
              <span>
                <span className="text-gray-500">Wait:</span>{' '}
                <span className="text-yellow-400">{s.waitSec}s</span>
              </span>
              <span>
                <span className="text-gray-500">Blocker:</span>{' '}
                <span className="text-orange-400">{s.blocker}</span>
              </span>
            </div>
            <div className="text-gray-400 text-xs mt-1">{s.waitEvent}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Panel Component
interface PanelProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

export function Panel({ title, subtitle, children, className, actions }: PanelProps) {
  return (
    <div className={cn('bg-gray-800 rounded-lg border border-gray-700', className)}>
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
