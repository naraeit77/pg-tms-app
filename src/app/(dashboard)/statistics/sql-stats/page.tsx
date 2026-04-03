'use client';

/**
 * SQL 통계 (SQL Statistics)
 * WhaTap PG SQL 통계 스타일
 * pg_stat_statements 집계 대시보드
 */

import { useQuery } from '@tanstack/react-query';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { cn } from '@/lib/utils';
import { WidgetCard } from '@/components/shared/widget-card';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { RefreshCw, Database, Clock, Layers, Zap } from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function fmtMs(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(1)}ms`;
}

export default function SqlStatsPage() {
  const { selectedConnectionId } = useSelectedDatabase();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sql-stats', selectedConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/statistics/sql-stats?connection_id=${selectedConnectionId}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedConnectionId,
  });

  const summary = data?.data?.summary || {};
  const topByTime = data?.data?.topByTime || [];
  const topByCalls = data?.data?.topByCalls || [];
  const topByRows = data?.data?.topByRows || [];

  // 파이 차트: Top 5 by exec time
  const pieData = topByTime.slice(0, 5).map((r: any, i: number) => ({
    name: `Q${i + 1}: ${(r.query || '').substring(0, 40)}...`,
    value: Number(r.total_exec_time),
    color: COLORS[i],
  }));

  const sqlColumns: DataTableColumn<any>[] = [
    { key: 'queryid', label: 'ID', width: 70, render: (v) => <span className="font-mono text-[10px]">{String(v).slice(-8)}</span> },
    { key: 'query', label: 'SQL', render: (v) => <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[300px]" title={String(v)}>{String(v)}</div> },
    { key: 'calls', label: 'Calls', width: 80, align: 'right' as const, sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
    { key: 'total_exec_time', label: 'Total', width: 90, align: 'right' as const, sortable: true, render: (v) => <span className="font-mono text-xs">{fmtMs(Number(v))}</span> },
    {
      key: 'mean_exec_time', label: 'Avg', width: 80, align: 'right' as const, sortable: true,
      render: (v) => {
        const ms = Number(v);
        return <span className={cn('font-mono text-xs font-bold', ms >= 1000 ? 'text-red-400' : ms >= 100 ? 'text-orange-400' : 'text-emerald-400')}>{fmtMs(ms)}</span>;
      },
    },
    { key: 'rows', label: 'Rows', width: 80, align: 'right' as const, sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-bold">SQL 통계</h1>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={Database} label="등록 쿼리 수" value={summary.total_queries?.toLocaleString() || '0'} color="text-blue-400" />
        <SummaryCard icon={Zap} label="총 실행 횟수" value={summary.total_calls?.toLocaleString() || '0'} color="text-emerald-400" />
        <SummaryCard icon={Clock} label="총 실행 시간" value={summary.total_exec_time_sec ? `${Number(summary.total_exec_time_sec).toFixed(1)}s` : '0s'} color="text-orange-400" />
        <SummaryCard icon={Layers} label="Cache Hit Ratio" value={`${(summary.cache_hit_ratio || 0).toFixed(1)}%`} color={(summary.cache_hit_ratio || 0) < 95 ? 'text-orange-400' : 'text-emerald-400'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Execution Time Distribution */}
        <WidgetCard title="실행 시간 분포 (Top 5)">
          <div className="h-[220px]">
            {pieData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">데이터 없음</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}
                    label={({ name, percent }) => `${name.substring(0, 15)}… ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: 'hsl(var(--chart-tick))', strokeWidth: 1 }}
                  >
                    {pieData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--chart-tooltip-bg))', border: '1px solid hsl(var(--chart-tooltip-border))', borderRadius: '6px', fontSize: '11px', color: 'hsl(var(--chart-tooltip-text))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </WidgetCard>

        {/* Avg Exec Time Distribution */}
        <WidgetCard title="평균 실행 시간 정보">
          <div className="space-y-3 py-2">
            <InfoRow label="평균 실행 시간" value={fmtMs(summary.avg_exec_time_ms || 0)} />
            <InfoRow label="총 반환 행 수" value={(summary.total_rows || 0).toLocaleString()} />
            <InfoRow label="Shared Blocks Hit" value={(summary.total_shared_blks_hit || 0).toLocaleString()} />
            <InfoRow label="Shared Blocks Read" value={(summary.total_shared_blks_read || 0).toLocaleString()} />
            <InfoRow label="Buffer Hit Ratio" value={`${(summary.cache_hit_ratio || 0).toFixed(2)}%`} highlight={(summary.cache_hit_ratio || 0) < 95} />
          </div>
        </WidgetCard>
      </div>

      {/* Top by Time */}
      <WidgetCard title="Top SQL — 총 실행 시간 순" fullscreenable>
        <DataTable data={topByTime} columns={sqlColumns as any} rowKey="queryid" searchable exportable exportFilename="sql-by-time" compact pageSize={10} />
      </WidgetCard>

      {/* Top by Calls */}
      <WidgetCard title="Top SQL — 호출 횟수 순" fullscreenable>
        <DataTable data={topByCalls} columns={sqlColumns as any} rowKey="queryid" searchable exportable exportFilename="sql-by-calls" compact pageSize={10} />
      </WidgetCard>

      {/* Top by Rows */}
      <WidgetCard title="Top SQL — 반환 행 수 순" fullscreenable>
        <DataTable data={topByRows} columns={sqlColumns as any} rowKey="queryid" searchable exportable exportFilename="sql-by-rows" compact pageSize={10} />
      </WidgetCard>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('h-4 w-4', color)} />
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <div className={cn('text-xl font-bold font-mono', color)}>{value}</div>
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-mono font-medium', highlight ? 'text-orange-400' : '')}>{value}</span>
    </div>
  );
}
