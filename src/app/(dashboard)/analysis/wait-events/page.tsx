'use client';

/**
 * Wait 분석 (Wait Event Analysis)
 * WhaTap /postgresql/analysis-wait-events 스타일
 * Top 5 Wait 이벤트 차트 + Active Session 연동 테이블
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
import { RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';

const WAIT_COLORS: Record<string, string> = {
  CPU: '#10b981', Client: '#3b82f6', IO: '#8b5cf6', IPC: '#f59e0b',
  Lock: '#ef4444', LWLock: '#ec4899', BufferPin: '#06b6d4', Activity: '#64748b',
  Extension: '#f97316', Timeout: '#a855f7', Other: '#6b7280',
};

export default function WaitEventsPage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [isLive, setIsLive] = useState(true);

  const { data: waitData, isLoading: waitLoading, refetch: refetchWait } = useQuery({
    queryKey: ['wait-events', selectedConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring/wait-events?connection_id=${selectedConnectionId}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedConnectionId,
    refetchInterval: isLive ? 5000 : false,
  });

  const { data: sessionData } = useQuery({
    queryKey: ['session-history', selectedConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/analysis/session-history?connection_id=${selectedConnectionId}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedConnectionId,
    refetchInterval: isLive ? 5000 : false,
  });

  const waitEvents = (waitData?.data || []).slice(0, 20);
  const sessions = sessionData?.data?.sessions || [];
  const waitingSessions = sessions.filter((s: any) => s.wait_event_type && s.state === 'active');

  // Top 5 chart data
  const top5 = waitEvents.slice(0, 5).map((e: any) => ({
    name: `${e.wait_event_type}:${e.wait_event}`,
    count: e.count,
    type: e.wait_event_type,
    color: WAIT_COLORS[e.wait_event_type] || '#6b7280',
  }));

  const sessionColumns: DataTableColumn<any>[] = [
    { key: 'pid', label: 'PID', width: 65, render: (v) => <span className="font-mono text-xs">{String(v)}</span> },
    { key: 'usename', label: 'User', width: 80, render: (v) => <span className="text-xs">{String(v)}</span> },
    { key: 'datname', label: 'DB', width: 80, render: (v) => <span className="text-xs">{String(v)}</span> },
    {
      key: 'wait_event_type', label: 'Wait Type', width: 90,
      render: (v) => v ? (
        <Badge variant="outline" className="text-[10px]" style={{ borderColor: (WAIT_COLORS[String(v)] || '#6b7280') + '50', color: WAIT_COLORS[String(v)] || '#6b7280' }}>
          {String(v)}
        </Badge>
      ) : <span className="text-muted-foreground text-xs">-</span>,
    },
    { key: 'wait_event', label: 'Wait Event', width: 120, render: (v) => <span className="font-mono text-[11px]">{String(v || '-')}</span> },
    {
      key: 'query_duration_ms', label: '실행시간', width: 85, align: 'right' as const, sortable: true,
      render: (v) => {
        const ms = Number(v) || 0;
        return <span className={cn('font-mono text-xs', ms >= 5000 ? 'text-red-400' : ms >= 1000 ? 'text-orange-400' : '')}>{(ms / 1000).toFixed(1)}s</span>;
      },
    },
    {
      key: 'query', label: 'SQL', render: (v) => (
        <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[350px]" title={String(v)}>{String(v || '-')}</div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">Wait 분석</h1>
          <Badge variant="outline" className="text-xs">{waitEvents.length}개 이벤트</Badge>
        </div>
        <div className="flex items-center gap-2">
          <TimeRangeSelector isLive={isLive} onLiveToggle={setIsLive} />
          <Button variant="outline" size="sm" onClick={() => refetchWait()} disabled={waitLoading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', waitLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Top 5 Chart */}
      <WidgetCard title="Wait Event Top 5">
        <div className="h-[200px]">
          {top5.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Wait 이벤트가 없습니다</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top5} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" strokeOpacity={0.5} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--chart-tick))' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10, fill: 'hsl(var(--chart-tick))' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--chart-tooltip-bg))', border: '1px solid hsl(var(--chart-tooltip-border))', borderRadius: '6px', fontSize: '12px', color: 'hsl(var(--chart-tooltip-text))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {top5.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </WidgetCard>

      {/* Wait Event Table */}
      <WidgetCard title="Wait 이벤트 목록" fullscreenable>
        <DataTable
          data={waitEvents}
          columns={[
            { key: 'wait_event_type', label: 'Type', width: 100, render: (v: any) => <Badge variant="outline" className="text-[10px]" style={{ borderColor: (WAIT_COLORS[String(v)] || '#6b7280') + '50', color: WAIT_COLORS[String(v)] || '#6b7280' }}>{String(v)}</Badge> },
            { key: 'wait_event', label: 'Event', width: 200, render: (v: any) => <span className="font-mono text-xs">{String(v)}</span> },
            { key: 'count', label: 'Count', width: 80, align: 'right' as const, sortable: true, render: (v: any) => <span className="font-mono text-sm font-bold">{Number(v)}</span> },
          ] as any}
          rowKey="wait_event"
          exportable
          exportFilename="wait-events"
          compact
        />
      </WidgetCard>

      {/* Active Sessions with Waits */}
      <WidgetCard title={`Wait 중인 Active Sessions (${waitingSessions.length}건)`} fullscreenable>
        <DataTable
          data={waitingSessions}
          columns={sessionColumns as any}
          rowKey="pid"
          searchable
          searchPlaceholder="PID, 쿼리 검색..."
          exportable
          exportFilename="wait-sessions"
          customizable
          pageSize={20}
          compact
          emptyMessage="Wait 중인 Active Session이 없습니다"
        />
      </WidgetCard>
    </div>
  );
}
