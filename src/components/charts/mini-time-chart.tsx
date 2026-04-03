'use client';

/**
 * Mini Time-Series Chart Component
 * WhaTap 스타일 실시간 시계열 미니 차트 (dark mode + stacked area 지원)
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface SeriesConfig {
  key: string;
  color: string;
  name: string;
}

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface MiniTimeChartProps {
  data: Record<string, any>[];
  series?: SeriesConfig[];
  /** Shorthand: array of data keys (auto-generates series from dataKeys + colors) */
  dataKeys?: string[];
  colors?: string[];
  height?: number;
  width?: number;
  yFormatter?: (v: number) => string;
  stacked?: boolean;
  showAxis?: boolean;
}

export function MiniTimeChart({
  data,
  series: seriesProp,
  dataKeys,
  colors,
  height = 130,
  width,
  yFormatter,
  stacked = false,
  showAxis = true,
}: MiniTimeChartProps) {
  const series: SeriesConfig[] = seriesProp ?? (dataKeys || []).map((key, i) => ({
    key,
    color: colors?.[i] ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    name: key,
  }));
  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-[11px] text-muted-foreground"
        style={{ height }}
      >
        데이터 수집 중...
      </div>
    );
  }

  const defaultYFormatter = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return String(Math.round(v));
  };

  return (
    <ResponsiveContainer width={width ?? '100%'} height={height} minWidth={0} minHeight={0}>
      <AreaChart
        data={data}
        margin={showAxis ? { top: 5, right: 5, left: -10, bottom: 0 } : { top: 0, right: 0, left: 0, bottom: 0 }}
      >
        {showAxis && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--chart-grid))"
            vertical={false}
          />
        )}
        <XAxis
          dataKey="time"
          tick={showAxis ? { fontSize: 9, fill: 'hsl(var(--chart-tick))' } : false}
          tickLine={false}
          axisLine={showAxis ? { stroke: 'hsl(var(--chart-grid))' } : false}
          interval="preserveStartEnd"
          hide={!showAxis}
        />
        <YAxis
          tick={showAxis ? { fontSize: 9, fill: 'hsl(var(--chart-tick))' } : false}
          tickLine={false}
          axisLine={false}
          width={showAxis ? 40 : 0}
          tickFormatter={yFormatter || defaultYFormatter}
          allowDecimals={false}
          hide={!showAxis}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--chart-tooltip-bg))',
            border: '1px solid hsl(var(--chart-tooltip-border))',
            borderRadius: '6px',
            fontSize: '11px',
            color: 'hsl(var(--chart-tooltip-text))',
            padding: '6px 10px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
          labelStyle={{
            color: 'hsl(var(--chart-tooltip-muted))',
            fontSize: '10px',
            marginBottom: '2px',
          }}
          formatter={(value: any, name: any) => {
            const s = series.find((s) => s.key === name);
            const formatted = yFormatter
              ? yFormatter(Number(value))
              : Number(value).toLocaleString();
            return [formatted, s?.name || name];
          }}
        />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.key}
            stroke={s.color}
            fill={s.color}
            fillOpacity={stacked ? 0.6 : 0.15}
            strokeWidth={stacked ? 0.5 : 1.5}
            dot={false}
            isAnimationActive={false}
            {...(stacked ? { stackId: 'stack' } : {})}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
