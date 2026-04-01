'use client';

/**
 * 세션 히스토리 (Session History)
 * WhaTap /postgresql/analysis-session-history 스타일
 * 바 차트 (active=표준, lock wait=빨강) + 세션 테이블
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw } from 'lucide-react';

export default function SessionHistoryPage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [isLive, setIsLive] = useState(true);
  const [tab, setTab] = useState('all');

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
  const sessions = data?.data?.sessions || [];

  const filtered = tab === 'all' ? sessions :
    tab === 'active' ? sessions.filter((s: any) => s.state === 'active') :
    tab === 'lock_wait' ? sessions.filter((s: any) => s.wait_event_type === 'Lock') :
    tab === 'idle_in_tx' ? sessions.filter((s: any) => s.state === 'idle in transaction') :
    sessions.filter((s: any) => s.state === 'idle');

  const sessionColumns: DataTableColumn<any>[] = [
    { key: 'pid', label: 'PID', width: 65, render: (v) => <span className="font-mono text-xs">{String(v)}</span> },
    { key: 'usename', label: 'User', width: 80 },
    { key: 'datname', label: 'DB', width: 80 },
    { key: 'application_name', label: 'Application', width: 110 },
    { key: 'client_addr', label: 'Client', width: 100, render: (v) => <span className="font-mono text-[11px]">{String(v || '-')}</span> },
    {
      key: 'state', label: 'State', width: 100,
      render: (v) => (
        <Badge variant="outline" className={cn('text-[10px]',
          v === 'active' ? 'border-emerald-500/30 text-emerald-400' :
          v === 'idle in transaction' ? 'border-amber-500/30 text-amber-400' :
          v === 'idle' ? 'border-slate-500/30 text-slate-400' :
          'border-blue-500/30 text-blue-400'
        )}>
          {String(v)}
        </Badge>
      ),
    },
    { key: 'wait_event_type', label: 'Wait Type', width: 90, render: (v) => <span className="text-xs">{String(v || '-')}</span> },
    { key: 'wait_event', label: 'Wait Event', width: 110, render: (v) => <span className="font-mono text-[11px]">{String(v || '-')}</span> },
    {
      key: 'query_duration_ms', label: '실행시간', width: 85, align: 'right' as const, sortable: true,
      render: (v) => {
        const ms = Number(v) || 0;
        if (ms === 0) return <span className="text-muted-foreground text-xs">-</span>;
        return <span className={cn('font-mono text-xs font-bold', ms >= 10000 ? 'text-red-400' : ms >= 3000 ? 'text-orange-400' : '')}>{(ms / 1000).toFixed(1)}s</span>;
      },
    },
    {
      key: 'query', label: 'SQL',
      render: (v) => <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[300px]" title={String(v)}>{String(v || '-')}</div>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">세션 히스토리</h1>
          <div className="flex gap-2 text-xs">
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">Active: {summary.active || 0}</Badge>
            <Badge variant="outline" className="border-red-500/30 text-red-400">Lock Wait: {summary.lockWait || 0}</Badge>
            <Badge variant="outline" className="border-amber-500/30 text-amber-400">Idle in Tx: {summary.idleInTransaction || 0}</Badge>
            <Badge variant="outline" className="border-slate-500/30 text-slate-400">Total: {summary.total || 0}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TimeRangeSelector isLive={isLive} onLiveToggle={setIsLive} />
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="h-8 rounded-md overflow-hidden flex bg-muted/30 border border-border/50">
        {summary.total > 0 && (
          <>
            <div className="bg-emerald-500/60 transition-all" style={{ width: `${(summary.active / summary.total) * 100}%` }} title={`Active: ${summary.active}`} />
            <div className="bg-red-500/60 transition-all" style={{ width: `${(summary.lockWait / summary.total) * 100}%` }} title={`Lock Wait: ${summary.lockWait}`} />
            <div className="bg-amber-500/60 transition-all" style={{ width: `${(summary.idleInTransaction / summary.total) * 100}%` }} title={`Idle in Tx: ${summary.idleInTransaction}`} />
            <div className="bg-slate-500/40 transition-all flex-1" title={`Idle: ${summary.idle}`} />
          </>
        )}
      </div>

      {/* Session Table */}
      <WidgetCard title="세션 목록" fullscreenable noPadding>
        <div className="p-3">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-8 mb-3">
              <TabsTrigger value="all" className="text-xs">전체 ({summary.total || 0})</TabsTrigger>
              <TabsTrigger value="active" className="text-xs">Active ({summary.active || 0})</TabsTrigger>
              <TabsTrigger value="lock_wait" className="text-xs">Lock Wait ({summary.lockWait || 0})</TabsTrigger>
              <TabsTrigger value="idle_in_tx" className="text-xs">Idle in Tx ({summary.idleInTransaction || 0})</TabsTrigger>
              <TabsTrigger value="idle" className="text-xs">Idle ({summary.idle || 0})</TabsTrigger>
            </TabsList>
          </Tabs>
          <DataTable
            data={filtered}
            columns={sessionColumns as any}
            rowKey="pid"
            searchable
            searchPlaceholder="PID, 쿼리, 사용자 검색..."
            searchFields={['pid', 'usename', 'datname', 'query', 'application_name']}
            exportable
            exportFilename="sessions"
            customizable
            pageSize={30}
            compact
            maxHeight="500px"
          />
        </div>
      </WidgetCard>
    </div>
  );
}
