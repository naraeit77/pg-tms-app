'use client';

/**
 * 락 트리 (Lock Tree)
 * WhaTap /postgresql/analysis-lock-and-deadlock 스타일
 * Lock Wait 차트 → 계층적 Holder/Waiter 트리 테이블
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
import { RefreshCw, Lock, ArrowRight } from 'lucide-react';

interface LockTreeRow {
  blocked_pid: number;
  blocked_user: string;
  blocked_query: string;
  blocked_duration_ms: number;
  blocked_lock_mode: string;
  blocked_relation: string | null;
  blocking_pid: number;
  blocking_user: string;
  blocking_query: string;
  blocking_duration_ms: number;
  blocking_state: string;
}

export default function LockTreePage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [isLive, setIsLive] = useState(true);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['lock-tree', selectedConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/analysis/lock-tree?connection_id=${selectedConnectionId}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: !!selectedConnectionId,
    refetchInterval: isLive ? 5000 : false,
  });

  const tree: LockTreeRow[] = data?.data?.tree || [];
  const lockWaitCount: number = data?.data?.lockWaitCount || 0;

  // Holder → Waiter 그룹핑
  const holderGroups = new Map<number, LockTreeRow[]>();
  for (const row of tree) {
    const existing = holderGroups.get(row.blocking_pid) || [];
    existing.push(row);
    holderGroups.set(row.blocking_pid, existing);
  }

  const columns: DataTableColumn<LockTreeRow>[] = [
    {
      key: 'blocking_pid',
      label: 'Holder PID',
      width: 85,
      render: (val) => <span className="font-mono text-xs font-bold text-orange-400">{String(val)}</span>,
    },
    {
      key: 'blocking_user',
      label: 'Holder User',
      width: 90,
      render: (val) => <span className="text-xs">{String(val)}</span>,
    },
    {
      key: 'blocking_state',
      label: 'State',
      width: 80,
      render: (val) => (
        <Badge variant="outline" className={cn('text-[10px]',
          val === 'active' ? 'border-emerald-500/30 text-emerald-400' :
          val === 'idle in transaction' ? 'border-amber-500/30 text-amber-400' :
          'border-slate-500/30 text-slate-400'
        )}>
          {String(val)}
        </Badge>
      ),
    },
    {
      key: '_arrow',
      label: '',
      width: 30,
      sortable: false,
      render: () => <ArrowRight className="h-3 w-3 text-red-400" />,
    },
    {
      key: 'blocked_pid',
      label: 'Waiter PID',
      width: 85,
      render: (val) => <span className="font-mono text-xs font-bold text-red-400">{String(val)}</span>,
    },
    {
      key: 'blocked_user',
      label: 'Waiter User',
      width: 90,
      render: (val) => <span className="text-xs">{String(val)}</span>,
    },
    {
      key: 'blocked_lock_mode',
      label: 'Lock Mode',
      width: 120,
      render: (val) => <span className="font-mono text-[11px]">{String(val)}</span>,
    },
    {
      key: 'blocked_relation',
      label: 'Relation',
      width: 120,
      render: (val) => val ? <span className="font-mono text-[11px]">{String(val)}</span> : <span className="text-muted-foreground text-xs">-</span>,
    },
    {
      key: 'blocked_duration_ms',
      label: '대기 시간',
      width: 90,
      align: 'right',
      sortable: true,
      render: (val) => {
        const ms = Number(val) || 0;
        return (
          <span className={cn('font-mono text-xs font-bold',
            ms >= 10000 ? 'text-red-400' : ms >= 3000 ? 'text-orange-400' : 'text-foreground'
          )}>
            {(ms / 1000).toFixed(1)}s
          </span>
        );
      },
    },
    {
      key: 'blocking_query',
      label: 'Holder Query',
      render: (val) => (
        <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[250px]" title={String(val)}>
          {String(val)}
        </div>
      ),
    },
    {
      key: 'blocked_query',
      label: 'Waiter Query',
      render: (val) => (
        <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[250px]" title={String(val)}>
          {String(val)}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">락 트리</h1>
          <Badge variant="outline" className={cn('text-xs gap-1',
            lockWaitCount > 0 ? 'border-red-500/30 text-red-400' : 'border-slate-500/30 text-slate-400'
          )}>
            <Lock className="h-3 w-3" />
            Lock Wait: {lockWaitCount}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <TimeRangeSelector isLive={isLive} onLiveToggle={setIsLive} />
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Lock Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border/50 bg-card p-3">
          <div className="text-[11px] text-muted-foreground mb-1">Lock Wait 세션</div>
          <div className={cn('text-2xl font-bold font-mono', lockWaitCount > 0 ? 'text-red-400' : 'text-foreground')}>
            {lockWaitCount}
          </div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card p-3">
          <div className="text-[11px] text-muted-foreground mb-1">Blocking 세션</div>
          <div className="text-2xl font-bold font-mono text-orange-400">{holderGroups.size}</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card p-3">
          <div className="text-[11px] text-muted-foreground mb-1">Blocked 세션</div>
          <div className="text-2xl font-bold font-mono">{tree.length}</div>
        </div>
      </div>

      {/* Lock Tree Table */}
      <WidgetCard title={`Lock Tree (${tree.length}건)`} fullscreenable>
        <DataTable
          data={tree as any}
          columns={columns as any}
          rowKey="blocked_pid"
          searchable
          searchPlaceholder="PID, 쿼리 검색..."
          searchFields={['blocking_query', 'blocked_query', 'blocking_pid', 'blocked_pid']}
          exportable
          exportFilename="lock-tree"
          customizable
          compact
          emptyMessage={lockWaitCount === 0 ? '현재 Lock Wait이 없습니다' : '데이터를 불러오는 중...'}
          maxHeight="500px"
        />
      </WidgetCard>
    </div>
  );
}
