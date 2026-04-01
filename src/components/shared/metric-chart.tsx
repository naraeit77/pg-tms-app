'use client';

import { cn } from '@/lib/utils';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { format } from 'date-fns';

export interface MetricSeries {
  key: string;
  label: string;
  color: string;
  strokeDasharray?: string;
}

interface MetricChartProps {
  data: Record<string, unknown>[];
  series: MetricSeries[];
  timeKey?: string;
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  stacked?: boolean;
  yAxisFormatter?: (value: number) => string;
  className?: string;
}

const defaultYFormatter = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
};

export function MetricChart({
  data,
  series,
  timeKey = 'time',
  height = 200,
  showGrid = true,
  showLegend = false,
  stacked = false,
  yAxisFormatter = defaultYFormatter,
  className,
}: MetricChartProps) {
  const formatTime = (value: string | number) => {
    try {
      return format(new Date(value), 'HH:mm:ss');
    } catch {
      return String(value);
    }
  };

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(215 25% 20%)"
              strokeOpacity={0.5}
            />
          )}
          <XAxis
            dataKey={timeKey}
            tickFormatter={formatTime}
            tick={{ fontSize: 10, fill: 'hsl(215 20% 50%)' }}
            axisLine={{ stroke: 'hsl(215 25% 20%)' }}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={yAxisFormatter}
            tick={{ fontSize: 10, fill: 'hsl(215 20% 50%)' }}
            axisLine={false}
            tickLine={false}
            width={45}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(217 33% 13%)',
              border: '1px solid hsl(215 25% 20%)',
              borderRadius: '6px',
              fontSize: '12px',
              color: 'hsl(210 40% 98%)',
            }}
            labelFormatter={formatTime}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{ fontSize: '11px', color: 'hsl(215 20% 55%)' }}
            />
          )}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.1}
              strokeWidth={1.5}
              strokeDasharray={s.strokeDasharray}
              stackId={stacked ? 'stack' : undefined}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
