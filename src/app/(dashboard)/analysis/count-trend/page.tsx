'use client';

/**
 * Count Trend 비교
 * WhaTap /postgresql/analysis-count-trend 스타일
 * 기준일/비교일 메트릭 비교 (현재는 실시간 세션 카운트 트렌드)
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { cn } from '@/lib/utils';
import { WidgetCard } from '@/components/shared/widget-card';
import { MetricChart, type MetricSeries } from '@/components/shared/metric-chart';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';

interface TrendPoint {
  time: string;
  active: number;
  idle: number;
  idleInTx: number;
  lockWait: number;
  total: number;
}

export default function CountTrendPage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [isLive, setIsLive] = useState(true);
  const historyRef = useRef<TrendPoint[]>([]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['session-history', selectedConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/analysis/session-history?connection_id=${selectedConnectionId}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedConnectionId,
    refetchInterval: isLive ? 5000 : false,
  });

  const summary = data?.data?.summary || {};

  // 히스토리 축적 (최대 120 = 10분)
  useEffect(() => {
    if (!data?.data?.summary) return;
    const s = data.data.summary;
    const next = [
      ...historyRef.current,
      {
        time: new Date().toISOString(),
        active: s.active || 0,
        idle: s.idle || 0,
        idleInTx: s.idleInTransaction || 0,
        lockWait: s.lockWait || 0,
        total: s.total || 0,
      },
    ];
    historyRef.current = next.length > 120 ? next.slice(-120) : next;
  }, [data]);

  const chartData = historyRef.current;

  const sessionSeries: MetricSeries[] = [
    { key: 'active', label: 'Active', color: '#10b981' },
    { key: 'lockWait', label: 'Lock Wait', color: '#ef4444' },
    { key: 'idleInTx', label: 'Idle in Tx', color: '#f59e0b' },
  ];

  const totalSeries: MetricSeries[] = [
    { key: 'total', label: 'Total', color: '#3b82f6' },
    { key: 'active', label: 'Active', color: '#10b981' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">Count Trend 비교</h1>
          <Badge variant="outline" className="text-xs">5초 간격 수집</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={isLive ? 'default' : 'outline'}
            size="sm"
            onClick={() => setIsLive(!isLive)}
            className={cn('gap-1.5 min-w-[80px]', isLive && 'bg-emerald-600 hover:bg-emerald-700 text-white')}
          >
            {isLive ? (
              <>
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-white" /></span>
                Live
              </>
            ) : '정지'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Current Values */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <MetricCard label="Active" value={summary.active || 0} color="text-emerald-400" />
        <MetricCard label="Lock Wait" value={summary.lockWait || 0} color={summary.lockWait > 0 ? 'text-red-400' : 'text-foreground'} />
        <MetricCard label="Idle in Tx" value={summary.idleInTransaction || 0} color={summary.idleInTransaction > 0 ? 'text-amber-400' : 'text-foreground'} />
        <MetricCard label="Idle" value={summary.idle || 0} color="text-slate-400" />
        <MetricCard label="Total" value={summary.total || 0} color="text-blue-400" />
      </div>

      {/* Session Trend Chart */}
      <WidgetCard title="세션 상태 트렌드 (Active / Lock Wait / Idle in Tx)" fullscreenable>
        {chartData.length < 2 ? (
          <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
            데이터 수집 중... (최소 2개 포인트 필요)
          </div>
        ) : (
          <MetricChart data={chartData} series={sessionSeries} height={250} showLegend stacked />
        )}
      </WidgetCard>

      {/* Total Connections Trend */}
      <WidgetCard title="전체 연결 트렌드" fullscreenable>
        {chartData.length < 2 ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
            데이터 수집 중...
          </div>
        ) : (
          <MetricChart data={chartData} series={totalSeries} height={200} showLegend />
        )}
      </WidgetCard>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <div className={cn('text-xl font-bold font-mono', color)}>{value}</div>
    </div>
  );
}
