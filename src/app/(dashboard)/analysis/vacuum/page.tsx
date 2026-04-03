'use client';

/**
 * Vacuum 분석 (Vacuum Analysis)
 * WhaTap /postgresql/analysis-vacuum 스타일
 * 헬스 요약 카드 3종 + Top5 바 차트 + Autovacuum 설정
 */

import { useQuery } from '@tanstack/react-query';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { TimeRangeSelector } from '@/components/shared/time-range-selector';
import { WidgetCard } from '@/components/shared/widget-card';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Trash2, HardDrive, Clock } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

export default function VacuumPage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [isLive, setIsLive] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['vacuum-health', selectedConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/analysis/vacuum-health?connection_id=${selectedConnectionId}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedConnectionId,
    refetchInterval: isLive ? 10000 : false,
  });

  const summary = data?.data?.summary || {};
  const deadTuples = data?.data?.deadTuples || [];
  const txAge = data?.data?.txAge || [];
  const settings = data?.data?.autovacuumSettings || [];
  const running = data?.data?.runningVacuums || [];

  const deadTuplesChart = deadTuples.slice(0, 5).map((r: any) => ({
    name: `${r.schemaname}.${r.relname}`,
    value: Number(r.n_dead_tup),
  }));

  const deadTupleColumns: DataTableColumn<any>[] = [
    { key: 'schemaname', label: 'Schema', width: 80, render: (v) => <span className="text-xs">{String(v)}</span> },
    { key: 'relname', label: 'Table', width: 150, render: (v) => <span className="font-mono text-xs font-medium">{String(v)}</span> },
    { key: 'n_dead_tup', label: 'Dead Tuples', width: 100, align: 'right' as const, sortable: true, render: (v) => <span className="font-mono text-xs font-bold text-orange-400">{Number(v).toLocaleString()}</span> },
    { key: 'n_live_tup', label: 'Live Tuples', width: 100, align: 'right' as const, sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
    { key: 'dead_ratio', label: 'Dead %', width: 70, align: 'right' as const, sortable: true, render: (v) => <span className={cn('font-mono text-xs', Number(v) > 20 ? 'text-red-400' : Number(v) > 10 ? 'text-orange-400' : '')}>{Number(v).toFixed(1)}%</span> },
    { key: 'last_autovacuum', label: 'Last Autovacuum', width: 160, render: (v) => <span className="text-[11px] text-muted-foreground">{v ? String(v).slice(0, 19) : '없음'}</span> },
  ];

  const settingColumns: DataTableColumn<any>[] = [
    { key: 'name', label: '파라미터', width: 250, render: (v) => <span className="font-mono text-xs">{String(v)}</span> },
    { key: 'setting', label: '값', width: 120, render: (v) => <span className="font-mono text-xs font-bold">{String(v)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">Vacuum 분석</h1>
          {running.length > 0 && (
            <Badge className="bg-emerald-600 text-white text-xs gap-1">
              <Clock className="h-3 w-3" />
              {running.length}개 실행 중
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <TimeRangeSelector isLive={isLive} onLiveToggle={setIsLive} />
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Health Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Trash2 className="h-4 w-4 text-orange-400" />
            <span className="text-sm font-medium">Dead Tuples</span>
          </div>
          <div className="text-2xl font-bold font-mono text-orange-400">
            {(summary.totalDeadTuples || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            최다: {summary.topDeadTupleTable || '-'}
          </div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-medium">Vacuum Workers</span>
          </div>
          <div className="text-2xl font-bold font-mono">
            {summary.runningVacuumWorkers || 0}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">현재 실행 중인 autovacuum</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium">Transaction Age</span>
          </div>
          <div className={cn('text-2xl font-bold font-mono',
            (summary.maxTxAgePct || 0) > 75 ? 'text-red-400' : (summary.maxTxAgePct || 0) > 50 ? 'text-orange-400' : 'text-foreground'
          )}>
            {(summary.maxTxAgePct || 0).toFixed(1)}%
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">freeze_max_age 대비</div>
        </div>
      </div>

      {/* Dead Tuples Top 5 Chart */}
      <WidgetCard title="Dead Tuples Top 5">
        <div className="h-[180px]">
          {deadTuplesChart.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Dead Tuple이 없습니다</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={deadTuplesChart} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" strokeOpacity={0.5} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--chart-tick))' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 10, fill: 'hsl(var(--chart-tick))' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--chart-tooltip-bg))', border: '1px solid hsl(var(--chart-tooltip-border))', borderRadius: '6px', fontSize: '12px', color: 'hsl(var(--chart-tooltip-text))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                <Bar dataKey="value" fill="#f97316" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </WidgetCard>

      {/* Dead Tuples Table */}
      <WidgetCard title={`Dead Tuples 상세 (${deadTuples.length}건)`} fullscreenable>
        <DataTable data={deadTuples} columns={deadTupleColumns as any} rowKey="relname" searchable searchPlaceholder="테이블 검색..." exportable exportFilename="dead-tuples" compact pageSize={20} />
      </WidgetCard>

      {/* Transaction Age */}
      {txAge.length > 0 && (
        <WidgetCard title="Transaction Age (DB별)">
          <DataTable
            data={txAge}
            columns={[
              { key: 'datname', label: 'Database', width: 150, render: (v: any) => <span className="font-mono text-xs">{String(v)}</span> },
              { key: 'age', label: 'Age', width: 120, align: 'right' as const, sortable: true, render: (v: any) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
              { key: 'pct', label: '% of Max', width: 100, align: 'right' as const, sortable: true, render: (v: any) => <span className={cn('font-mono text-xs font-bold', Number(v) > 75 ? 'text-red-400' : Number(v) > 50 ? 'text-orange-400' : '')}>{Number(v).toFixed(1)}%</span> },
            ] as any}
            rowKey="datname"
            compact
          />
        </WidgetCard>
      )}

      {/* Autovacuum Settings */}
      <WidgetCard title="Autovacuum 설정">
        <DataTable data={settings} columns={settingColumns as any} rowKey="name" searchable searchPlaceholder="파라미터 검색..." compact />
      </WidgetCard>
    </div>
  );
}
