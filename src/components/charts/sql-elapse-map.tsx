'use client';

/**
 * SQL Elapse Map - WhaTap-style scatter/cluster chart
 * Plots individual SQL query executions as dots: X=time, Y=elapsed time
 * Color-coded by duration bands (blue <3s, green 3-10s, orange 10-15s, red ≥15s)
 * Supports click-to-select and drag-to-select for detailed SQL inspection
 */

import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
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
  /** Query ID from pg_stat_statements */
  queryid?: string;
}

interface SqlElapseMapProps {
  data: SqlElapsePoint[];
  height?: number;
  showAxis?: boolean;
  compact?: boolean;
  /** Called when user clicks or drags to select points */
  onSelect?: (points: SqlElapsePoint[]) => void;
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

export function formatElapsed(sec: number): string {
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
  onSelect,
}: SqlElapseMapProps) {
  const sortedData = useMemo(
    () => [...data].sort((a, b) => a.timeNum - b.timeNum),
    [data]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);

  // Get the chart plot area bounds by finding the recharts surface area
  const getChartArea = useCallback(() => {
    if (!containerRef.current) return null;
    const svg = containerRef.current.querySelector('svg');
    if (!svg) return null;

    // Method 1: Use CartesianGrid rect (when showAxis=true)
    const grid = svg.querySelector('.recharts-cartesian-grid');
    if (grid) {
      const rect = grid.querySelector('rect');
      if (rect) {
        return {
          x: Number(rect.getAttribute('x')) || 0,
          y: Number(rect.getAttribute('y')) || 0,
          width: Number(rect.getAttribute('width')) || 0,
          height: Number(rect.getAttribute('height')) || 0,
        };
      }
    }

    // Method 2: Fallback — use the recharts-surface clip-path rect
    const clipRect = svg.querySelector('clipPath rect');
    if (clipRect) {
      return {
        x: Number(clipRect.getAttribute('x')) || 0,
        y: Number(clipRect.getAttribute('y')) || 0,
        width: Number(clipRect.getAttribute('width')) || 0,
        height: Number(clipRect.getAttribute('height')) || 0,
      };
    }

    // Method 3: Last resort — use scatter dots bounding box
    const dots = svg.querySelectorAll('.recharts-scatter-symbol');
    if (dots.length > 0) {
      const svgRect = svg.getBoundingClientRect();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      dots.forEach(dot => {
        const r = dot.getBoundingClientRect();
        const cx = r.left + r.width / 2 - svgRect.left;
        const cy = r.top + r.height / 2 - svgRect.top;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
      });
      if (minX < maxX && minY < maxY) {
        const pad = 10;
        return {
          x: minX - pad,
          y: minY - pad,
          width: (maxX - minX) + pad * 2,
          height: (maxY - minY) + pad * 2,
        };
      }
    }

    return null;
  }, []);

  const getRelativePos = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!onSelect) return;
    // Prevent Recharts from stealing the event
    e.preventDefault();
    const pos = getRelativePos(e);
    if (!pos) return;
    setIsDragging(true);
    setDragStart(pos);
    setDragEnd(pos);
  }, [onSelect, getRelativePos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const pos = getRelativePos(e);
    if (!pos) return;
    setDragEnd(pos);
  }, [isDragging, getRelativePos]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging || !dragStart || !dragEnd || !onSelect) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      return;
    }

    const chartArea = getChartArea();
    if (!chartArea || chartArea.width === 0 || chartArea.height === 0) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      return;
    }

    // Selection rectangle in pixel space
    const selLeft = Math.min(dragStart.x, dragEnd.x);
    const selRight = Math.max(dragStart.x, dragEnd.x);
    const selTop = Math.min(dragStart.y, dragEnd.y);
    const selBottom = Math.max(dragStart.y, dragEnd.y);

    // Data range for coordinate mapping
    const xMin = sortedData.length > 0 ? sortedData[0].timeNum : 0;
    const xMax = sortedData.length > 0 ? sortedData[sortedData.length - 1].timeNum : 1;
    const maxEl = Math.max(...sortedData.map((d) => d.elapsed), 1);
    const yMaxData = Math.ceil(maxEl * 1.2);

    // Click (small drag < 5px) → select nearest single point
    if (selRight - selLeft < 5 && selBottom - selTop < 5) {
      const clickX = (selLeft + selRight) / 2;
      const clickY = (selTop + selBottom) / 2;

      let nearest: SqlElapsePoint | null = null;
      let minDist = Infinity;
      for (const p of sortedData) {
        const px = chartArea.x + ((p.timeNum - xMin) / (xMax - xMin || 1)) * chartArea.width;
        const py = chartArea.y + (1 - p.elapsed / yMaxData) * chartArea.height;
        const dist = Math.sqrt((clickX - px) ** 2 + (clickY - py) ** 2);
        if (dist < minDist) { minDist = dist; nearest = p; }
      }

      if (nearest && minDist < 30) {
        onSelect([nearest]);
      }
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      return;
    }

    // Drag selection → select all points within rectangle
    const dataXLeft = xMin + ((selLeft - chartArea.x) / chartArea.width) * (xMax - xMin);
    const dataXRight = xMin + ((selRight - chartArea.x) / chartArea.width) * (xMax - xMin);
    // Y is inverted (top of chart = high value)
    const dataYTop = yMaxData * (1 - (selTop - chartArea.y) / chartArea.height);
    const dataYBottom = yMaxData * (1 - (selBottom - chartArea.y) / chartArea.height);
    const dataYMin = Math.min(dataYTop, dataYBottom);
    const dataYMax = Math.max(dataYTop, dataYBottom);

    const selected = sortedData.filter(
      (p) => p.timeNum >= dataXLeft && p.timeNum <= dataXRight && p.elapsed >= dataYMin && p.elapsed <= dataYMax
    );

    if (selected.length > 0) {
      onSelect(selected);
    }

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd, onSelect, sortedData, getChartArea]);

  // Cancel drag on global mouse up (e.g. mouse leaves the chart area)
  useEffect(() => {
    if (!isDragging) return;
    const handleGlobalUp = () => {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    };
    window.addEventListener('mouseup', handleGlobalUp);
    return () => window.removeEventListener('mouseup', handleGlobalUp);
  }, [isDragging]);

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

  // Drag selection rectangle
  const selRect = isDragging && dragStart && dragEnd ? {
    x: Math.min(dragStart.x, dragEnd.x),
    y: Math.min(dragStart.y, dragEnd.y),
    width: Math.abs(dragEnd.x - dragStart.x),
    height: Math.abs(dragEnd.y - dragStart.y),
  } : null;

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{ height, cursor: onSelect ? 'crosshair' : undefined }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Transparent overlay to capture mouse events above the chart */}
      {onSelect && (
        <div
          className="absolute inset-0 z-10"
          style={{ cursor: 'crosshair' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />
      )}
      <ResponsiveContainer width="100%" height={height} minWidth={0} minHeight={0}>
        <ScatterChart margin={showAxis ? { top: 5, right: 8, left: -10, bottom: 0 } : { top: 2, right: 2, left: 0, bottom: 0 }}>
          {/* Always render CartesianGrid for getChartArea() coordinate mapping */}
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={showAxis ? 'hsl(var(--chart-grid))' : 'transparent'}
            vertical={false}
          />
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
          {!isDragging && <Tooltip content={<CustomTooltip />} cursor={false} />}
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
      {/* Drag selection overlay */}
      {selRect && selRect.width > 2 && selRect.height > 2 && (
        <div
          className="absolute pointer-events-none z-20 border-2 border-blue-400/70 bg-blue-400/10 rounded-sm"
          style={{
            left: selRect.x,
            top: selRect.y,
            width: selRect.width,
            height: selRect.height,
          }}
        />
      )}
      {/* Drag hint */}
      {onSelect && sortedData.length > 0 && !isDragging && (
        <div className="absolute top-0.5 right-1 text-[9px] text-muted-foreground/50 pointer-events-none select-none z-20">
          클릭 또는 드래그하여 SQL 선택
        </div>
      )}
    </div>
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

/** Grading based on elapsed time (TMS2.0 style) */
export function getElapsedGrade(elapsedSec: number): { grade: string; color: string; bgColor: string; label: string } {
  if (elapsedSec < 0.1) return { grade: 'A', color: 'text-emerald-600', bgColor: 'bg-emerald-100 border-emerald-300', label: '최적화된 SQL' };
  if (elapsedSec < 1) return { grade: 'B', color: 'text-green-600', bgColor: 'bg-green-100 border-green-300', label: '양호한 SQL' };
  if (elapsedSec < 5) return { grade: 'C', color: 'text-amber-600', bgColor: 'bg-amber-100 border-amber-300', label: '보통 수준' };
  if (elapsedSec < 15) return { grade: 'D', color: 'text-orange-600', bgColor: 'bg-orange-100 border-orange-300', label: '주의 필요' };
  return { grade: 'F', color: 'text-red-600', bgColor: 'bg-red-100 border-red-300', label: '즉시 튜닝 필요' };
}
