'use client';

/**
 * 세션 히스토리 (Session History)
 * WhaTap /postgresql/analysis-session-history 스타일
 * 바 차트 (active=표준, lock wait=빨강) + 세션 테이블
 */

import { useQuery } from '@tanstack/react-query';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { cn } from '@/lib/utils';
import { useState, useCallback } from 'react';
import { TimeRangeSelector } from '@/components/shared/time-range-selector';
import { WidgetCard } from '@/components/shared/widget-card';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RefreshCw, Skull, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function SessionHistoryPage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [isLive, setIsLive] = useState(true);
  const [tab, setTab] = useState('all');
  const [killTarget, setKillTarget] = useState<{ pid: number; usename: string; query: string } | null>(null);
  const [isKilling, setIsKilling] = useState(false);
  const [sqlDetail, setSqlDetail] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

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

  const handleKillSession = useCallback(async () => {
    if (!killTarget || !selectedConnectionId) return;
    setIsKilling(true);
    try {
      const res = await fetch('/api/monitoring/sessions/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: selectedConnectionId, pid: killTarget.pid }),
      });
      const result = await res.json();
      if (res.ok && result.data?.terminated) {
        toast.success(`세션 (PID: ${killTarget.pid}) 이 종료되었습니다.`);
        refetch();
      } else {
        toast.error(`세션 종료 실패: ${result.error || '알 수 없는 오류'}`);
      }
    } catch {
      toast.error('세션 종료 요청 중 오류가 발생했습니다.');
    } finally {
      setIsKilling(false);
      setKillTarget(null);
    }
  }, [killTarget, selectedConnectionId, refetch]);

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
      render: (v: any, row: any) => (
        <div
          className="font-mono text-[10px] text-muted-foreground truncate max-w-[300px] cursor-pointer hover:text-blue-400 transition-colors"
          onClick={(e) => { e.stopPropagation(); setSqlDetail(row); setCopied(false); }}
          title="클릭하여 SQL 상세 보기"
        >
          {String(v || '-')}
        </div>
      ),
    },
    {
      key: '_kill', label: 'Kill', width: 55, align: 'center' as const,
      render: (_v: any, row: any) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
          onClick={(e) => {
            e.stopPropagation();
            setKillTarget({ pid: row.pid, usename: row.usename, query: row.query });
          }}
          title={`PID ${row.pid} 세션 종료`}
        >
          <Skull className="h-3.5 w-3.5" />
        </Button>
      ),
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
      {/* SQL Detail Dialog */}
      <Dialog open={!!sqlDetail} onOpenChange={(open) => !open && setSqlDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              SQL 상세 정보
              <Badge variant="outline" className="text-[10px] font-mono">PID: {sqlDetail?.pid}</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Query ID */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Query ID</label>
              <div className="rounded-md bg-muted/50 px-3 py-2 font-mono text-sm">
                {sqlDetail?.query_id || <span className="text-muted-foreground italic">N/A (pg_stat_statements 미설정 또는 유틸리티 쿼리)</span>}
              </div>
            </div>

            {/* SQL Full Text */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">SQL Full Text</label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(sqlDetail?.query || '');
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copied ? '복사됨' : '복사'}
                </Button>
              </div>
              <pre className="rounded-md bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto border border-border/50">
                {sqlDetail?.query || '-'}
              </pre>
            </div>

            {/* Session Info Grid */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">세션 정보</label>
              <div className="rounded-md bg-muted/50 p-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">User</span>
                  <span className="font-mono">{sqlDetail?.usename || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Database</span>
                  <span className="font-mono">{sqlDetail?.datname || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Application</span>
                  <span className="font-mono">{sqlDetail?.application_name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Client</span>
                  <span className="font-mono">{sqlDetail?.client_addr || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">State</span>
                  <Badge variant="outline" className={cn('text-[10px]',
                    sqlDetail?.state === 'active' ? 'border-emerald-500/30 text-emerald-400' :
                    sqlDetail?.state === 'idle in transaction' ? 'border-amber-500/30 text-amber-400' :
                    'border-slate-500/30 text-slate-400'
                  )}>{sqlDetail?.state || '-'}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">실행시간</span>
                  <span className={cn('font-mono font-bold',
                    (sqlDetail?.query_duration_ms || 0) >= 10000 ? 'text-red-400' :
                    (sqlDetail?.query_duration_ms || 0) >= 3000 ? 'text-orange-400' : ''
                  )}>
                    {sqlDetail?.query_duration_ms ? `${(sqlDetail.query_duration_ms / 1000).toFixed(2)}s` : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Wait Event</span>
                  <span className="font-mono">{sqlDetail?.wait_event_type ? `${sqlDetail.wait_event_type} / ${sqlDetail.wait_event}` : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Query Start</span>
                  <span className="font-mono">{sqlDetail?.query_start ? new Date(sqlDetail.query_start).toLocaleString('ko-KR') : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Xact Start</span>
                  <span className="font-mono">{sqlDetail?.xact_start ? new Date(sqlDetail.xact_start).toLocaleString('ko-KR') : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Backend Start</span>
                  <span className="font-mono">{sqlDetail?.backend_start ? new Date(sqlDetail.backend_start).toLocaleString('ko-KR') : '-'}</span>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Kill Confirmation Dialog */}
      <AlertDialog open={!!killTarget} onOpenChange={(open) => !open && setKillTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>세션을 종료하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>다음 세션에 대해 <code className="text-red-400 font-semibold">pg_terminate_backend()</code>를 실행합니다.</p>
                <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
                  <div><span className="text-muted-foreground">PID:</span> <span className="font-mono font-bold">{killTarget?.pid}</span></div>
                  <div><span className="text-muted-foreground">User:</span> {killTarget?.usename}</div>
                  <div><span className="text-muted-foreground">SQL:</span> <span className="font-mono truncate block max-w-full">{killTarget?.query?.slice(0, 200) || '-'}</span></div>
                </div>
                <p className="text-amber-400 text-xs">이 작업은 되돌릴 수 없습니다. 해당 세션의 진행 중인 트랜잭션이 롤백됩니다.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isKilling}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleKillSession}
              disabled={isKilling}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isKilling ? '종료 중...' : '세션 종료'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
