'use client';

/**
 * Session Activity Overview Chart
 * PostgreSQL 세션 상태 분포 도넛 차트
 */

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const SESSION_COLORS = {
  active: '#10b981',
  idle: '#94a3b8',
  idleInTx: '#f59e0b',
  other: '#6b7280',
};

interface SessionChartProps {
  active: number;
  idle: number;
  idleInTx: number;
  total: number;
  className?: string;
}

export function SessionChart({ active, idle, idleInTx, total, className }: SessionChartProps) {
  const other = Math.max(0, total - active - idle - idleInTx);

  const data = [
    { name: 'Active', value: active, color: SESSION_COLORS.active },
    { name: 'Idle', value: idle, color: SESSION_COLORS.idle },
    { name: 'Idle in Tx', value: idleInTx, color: SESSION_COLORS.idleInTx },
    ...(other > 0 ? [{ name: 'Other', value: other, color: SESSION_COLORS.other }] : []),
  ].filter((d) => d.value > 0);

  if (total === 0) {
    return (
      <div className={className}>
        <div className="flex items-center justify-center h-[180px] text-sm text-muted-foreground">
          세션 없음
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-4">
        <div className="w-[140px] h-[140px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={62}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value) => [`${value}`, '']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2">
          <SessionLegendItem label="Active" value={active} color={SESSION_COLORS.active} />
          <SessionLegendItem label="Idle" value={idle} color={SESSION_COLORS.idle} />
          <SessionLegendItem label="Idle in Tx" value={idleInTx} color={SESSION_COLORS.idleInTx} />
          {other > 0 && <SessionLegendItem label="Other" value={other} color={SESSION_COLORS.other} />}
          <div className="pt-1 border-t border-slate-200">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 font-medium">Total</span>
              <span className="font-bold text-slate-700">{total}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionLegendItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
        <span className="text-xs text-slate-600">{label}</span>
      </div>
      <span className="text-xs font-semibold text-slate-700">{value}</span>
    </div>
  );
}
