'use client';

/**
 * Wait Event Stacked Bar Chart
 * PostgreSQL pg_stat_activity 기반 Wait Event 분포 시각화
 */

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

export const WAIT_COLORS: Record<string, string> = {
  CPU: '#10b981',
  'Client': '#3b82f6',
  'IO': '#8b5cf6',
  'IPC': '#f59e0b',
  'Lock': '#ef4444',
  'LWLock': '#f97316',
  'BufferPin': '#ec4899',
  'Activity': '#6b7280',
  'Extension': '#06b6d4',
  'Timeout': '#a855f7',
  Other: '#475569',
};

interface WaitEventData {
  wait_event_type: string;
  wait_event: string;
  count: number;
}

interface WaitEventChartProps {
  data: WaitEventData[];
  className?: string;
}

export function WaitEventChart({ data, className }: WaitEventChartProps) {
  const chartData = useMemo(() => {
    // wait_event_type 별로 그룹핑
    const grouped: Record<string, number> = {};
    for (const row of data) {
      const type = row.wait_event_type || 'Other';
      grouped[type] = (grouped[type] || 0) + Number(row.count);
    }

    // 단일 데이터 포인트로 변환 (수평 바 차트)
    return Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({
        name: type,
        count,
        fill: WAIT_COLORS[type] || WAIT_COLORS.Other,
      }));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className={className}>
        <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
          현재 대기 이벤트 없음
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={220} minWidth={0} minHeight={0}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: '#64748b' }}
            width={55}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(value) => [`${value} sessions`, 'Count']}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
            {chartData.map((entry, index) => (
              <rect key={index} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Wait Event Detail Table
 * 상세 wait_event 목록 테이블
 */
interface WaitEventTableProps {
  data: WaitEventData[];
  className?: string;
}

export function WaitEventTable({ data, className }: WaitEventTableProps) {
  if (data.length === 0) {
    return (
      <div className={className}>
        <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
          현재 대기 이벤트 없음
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 font-medium text-slate-500 text-xs">Type</th>
              <th className="text-left py-2 px-3 font-medium text-slate-500 text-xs">Event</th>
              <th className="text-right py-2 px-3 font-medium text-slate-500 text-xs">Count</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 10).map((row, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 px-3">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5"
                    style={{ backgroundColor: WAIT_COLORS[row.wait_event_type] || WAIT_COLORS.Other }}
                  />
                  <span className="text-xs text-slate-600">{row.wait_event_type}</span>
                </td>
                <td className="py-1.5 px-3 text-xs font-mono text-slate-700">{row.wait_event}</td>
                <td className="py-1.5 px-3 text-right text-xs font-semibold text-slate-700">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
