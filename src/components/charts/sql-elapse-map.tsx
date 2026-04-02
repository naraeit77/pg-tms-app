'use client';

/**
 * SQL Elapse Map - WhaTap-style scatter/cluster chart
 * Plots individual SQL query executions as dots: X=time, Y=elapsed time
 * Color-coded by duration bands (blue <3s, green 3-10s, orange 10-15s, red ≥15s)
 */

import { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  ZAxis,
} from 'recharts';

export interface SqlElapsePoint {
  /** ISO timestamp or formatted time string */
  time: string;
  /** Numeric timestamp for X positioning */
  timeNum: number;
  /** Query elapsed time in seconds */
  elapsed: number;
  /** PID of the session */
  pid?: number;
  /** Truncated query text */
  query?: string;
  /** Username */
  user?: string;
}

interface SqlElapseMapProps {
  data: SqlElapsePoint[];
  height?: number;
  showAxis?: boolean;
  compact?: boolean;
}

const DURATION_BANDS = [
  { max: 3, color: '#3b82f6', label: '<3s' },
  { max: 10, color: '#10b981', label: '3-10s' },
  { max: 15, color: '#f97316', label: '10-15s' },
  { max: Infinity, color: '#ef4444', label: '≥15s' },
] as const;

function getDurationColor(elapsed: number): string {
  for (const band of DURATION_BANDS) {
    if (elapsed < band.max) return band.color;
  }
  return '#ef4444';
}

function formatElapsed(sec: number): string {
  if (sec < 0.001) return `${(sec * 1_000_000).toFixed(0)}µs`;
  if (sec < 1) return `${(sec * 1000).toFixed(0)}ms`;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  return `${(sec / 60).toFixed(1)}m`;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload as SqlElapsePoint;
  return (
    <div
      className="rounded-md border text-xs shadow-lg"
      style={{
        backgroundColor: 'hsl(var(--chart-tooltip-bg))',
        borderColor: 'hsl(var(--chart-tooltip-border))',
        padding: '8px 12px',
        color: 'hsl(var(--chart-tooltip-text))',
        maxWidth: 320,
      }}
    >
      <div className="font-medium" style={{ color: getDurationColor(d.elapsed) }}>
        {formatElapsed(d.elapsed)}
      </div>
      <div className="text-[10px] mt-1" style={{ color: 'hsl(var(--chart-tooltip-muted))' }}>
        {d.time}
      </div>
      {d.pid && (
        <div className="text-[10px]" style={{ color: 'hsl(var(--chart-tooltip-muted))' }}>
          PID: {d.pid}{d.user ? ` (${d.user})` : ''}
        </div>
      )}
      {d.query && (
        <div
          className="font-mono text-[10px] mt-1 truncate"
          style={{ color: 'hsl(var(--chart-tooltip-muted))' }}
        >
          {d.query.substring(0, 100)}
        </div>
      )}
    </div>
  );
};

export function SqlElapseMap({
  data,
  height = 130,
  showAxis = true,
  compact = false,
}: SqlElapseMapProps) {
  const sortedData = useMemo(
    () => [...data].sort((a, b) => a.timeNum - b.timeNum),
    [data]
  );

  if (sortedData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[11px] text-muted-foreground"
        style={{ height }}
      >
        SQL 데이터 수집 중...
      </div>
    );
  }

  // Calculate Y-axis max with some padding
  const maxElapsed = Math.max(...sortedData.map((d) => d.elapsed), 1);
  const yMax = Math.ceil(maxElapsed * 1.2);

  // Time ticks - extract unique time labels
  const timeLabels = [...new Set(sortedData.map((d) => d.time))];
  const tickCount = compact ? 3 : Math.min(timeLabels.length, 6);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={showAxis ? { top: 5, right: 8, left: -10, bottom: 0 } : { top: 2, right: 2, left: 0, bottom: 0 }}>
        {showAxis && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--chart-grid))"
            vertical={false}
          />
        )}
        <XAxis
          dataKey="timeNum"
          type="number"
          domain={['dataMin', 'dataMax']}
          tick={showAxis ? { fontSize: 9, fill: 'hsl(var(--chart-tick))' } : false}
          tickLine={false}
          axisLine={showAxis ? { stroke: 'hsl(var(--chart-grid))' } : false}
          tickFormatter={(val) => {
            const pt = sortedData.find((d) => d.timeNum === val);
            return pt?.time?.split(' ').pop()?.substring(0, 5) || '';
          }}
          tickCount={tickCount}
          hide={!showAxis}
        />
        <YAxis
          dataKey="elapsed"
          type="number"
          domain={[0, yMax]}
          tick={showAxis ? { fontSize: 9, fill: 'hsl(var(--chart-tick))' } : false}
          tickLine={false}
          axisLine={false}
          width={showAxis ? 40 : 0}
          tickFormatter={formatElapsed}
          hide={!showAxis}
        />
        <ZAxis range={compact ? [15, 15] : [20, 60]} />
        <Tooltip content={<CustomTooltip />} cursor={false} />
        <Scatter data={sortedData} isAnimationActive={false}>
          {sortedData.map((point, i) => (
            <Cell
              key={i}
              fill={getDurationColor(point.elapsed)}
              fillOpacity={0.75}
              stroke={getDurationColor(point.elapsed)}
              strokeWidth={0.5}
            />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** Legend for the duration color bands */
export function SqlElapseLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
      {DURATION_BANDS.map((band) => (
        <div key={band.label} className="flex items-center gap-1">
          <div
            className="rounded-full"
            style={{
              width: compact ? 6 : 8,
              height: compact ? 6 : 8,
              backgroundColor: band.color,
            }}
          />
          <span className={`text-muted-foreground ${compact ? 'text-[8px]' : 'text-[10px]'}`}>
            {band.label}
          </span>
        </div>
      ))}
    </div>
  );
}
