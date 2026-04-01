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

interface MiniTimeChartProps {
  data: Record<string, any>[];
  series: SeriesConfig[];
  height?: number;
  yFormatter?: (v: number) => string;
  stacked?: boolean;
}

export function MiniTimeChart({
  data,
  series,
  height = 130,
  yFormatter,
  stacked = false,
}: MiniTimeChartProps) {
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
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={data}
        margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(215 25% 20%)"
          vertical={false}
        />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 9, fill: 'hsl(215 20% 50%)' }}
          tickLine={false}
          axisLine={{ stroke: 'hsl(215 25% 20%)' }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 9, fill: 'hsl(215 20% 50%)' }}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={yFormatter || defaultYFormatter}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(217 33% 15%)',
            border: '1px solid hsl(215 25% 25%)',
            borderRadius: '6px',
            fontSize: '11px',
            color: 'hsl(210 40% 98%)',
            padding: '6px 10px',
          }}
          labelStyle={{
            color: 'hsl(215 20% 55%)',
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
