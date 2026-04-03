'use client';

/**
 * 슬로우 쿼리 (Slow Query)
 * WhaTap /postgresql/slow-query 스타일
 * 스캐터 플롯 (시간 vs 실행시간) + 쿼리 상세 테이블
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { cn } from '@/lib/utils';
import { TimeRangeSelector } from '@/components/shared/time-range-selector';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { WidgetCard } from '@/components/shared/widget-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RefreshCw, AlertTriangle, Clock, Copy, Check } from 'lucide-react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceArea,
} from 'recharts';
import { format } from 'date-fns';

interface ActiveSlowQuery {
  type: 'active';
  pid: number;
  user: string;
  database: string;
  query: string;
  durationMs: number;
  waitEventType: string | null;
  waitEvent: string | null;
  queryStart: string;
  clientAddr: string | null;
  applicationName: string;
}

interface HistoricalSlowQuery {
  type: 'historical';
  queryId: string;
  query: string;
  calls: number;
  meanExecTimeMs: number;
  maxExecTimeMs: number;
  totalExecTimeMs: number;
}

type SlowQuery = ActiveSlowQuery | HistoricalSlowQuery;

export default function SlowQueryPage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [isLive, setIsLive] = useState(true);
  const [thresholdMs, setThresholdMs] = useState(1000);
  const [selectedArea, setSelectedArea] = useState<{ startX?: number; endX?: number } | null>(null);
  const [refAreaLeft, setRefAreaLeft] = useState<number | undefined>();
  const [refAreaRight, setRefAreaRight] = useState<number | undefined>();
  const [selectedHistorical, setSelectedHistorical] = useState<HistoricalSlowQuery | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['slow-query', selectedConnectionId, thresholdMs],
    queryFn: async () => {
      const res = await fetch(
        `/api/dashboard/slow-query?connection_id=${selectedConnectionId}&threshold_ms=${thresholdMs}`
      );
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: !!selectedConnectionId,
    refetchInterval: isLive ? 10000 : false,
  });

  const activeQueries: ActiveSlowQuery[] = data?.data?.active || [];
  const historicalQueries: HistoricalSlowQuery[] = data?.data?.historical || [];

  // 스캐터 플롯 데이터
  const scatterData = useMemo(() => {
    return activeQueries.map((q) => ({
      x: new Date(q.queryStart).getTime(),
      y: q.durationMs / 1000,
      ...q,
    }));
  }, [activeQueries]);

  // 선택 영역 내 필터링
  const filteredQueries = useMemo(() => {
    if (!selectedArea?.startX || !selectedArea?.endX) return activeQueries;
    const minX = Math.min(selectedArea.startX, selectedArea.endX);
    const maxX = Math.max(selectedArea.startX, selectedArea.endX);
    return activeQueries.filter((q) => {
      const t = new Date(q.queryStart).getTime();
      return t >= minX && t <= maxX;
    });
  }, [activeQueries, selectedArea]);

  const getDurationColor = (ms: number) => {
    if (ms >= 10000) return '#ef4444';
    if (ms >= 5000) return '#f97316';
    if (ms >= 1000) return '#f59e0b';
    return '#3b82f6';
  };

  const activeColumns: DataTableColumn<ActiveSlowQuery>[] = [
    {
      key: 'pid',
      label: 'PID',
      width: 65,
      render: (val) => <span className="font-mono text-xs">{String(val)}</span>,
    },
    {
      key: 'database',
      label: 'DB',
      width: 80,
      render: (val) => <span className="text-xs truncate">{String(val)}</span>,
    },
    {
      key: 'user',
      label: 'User',
      width: 80,
      render: (val) => <span className="text-xs truncate">{String(val)}</span>,
    },
    {
      key: 'durationMs',
      label: '실행시간',
      width: 90,
      align: 'right',
      sortable: true,
      render: (val) => {
        const ms = Number(val);
        const sec = (ms / 1000).toFixed(2);
        return (
          <span
            className={cn(
              'font-mono text-xs font-bold',
              ms >= 10000 ? 'text-red-400' : ms >= 5000 ? 'text-orange-400' : ms >= 1000 ? 'text-yellow-400' : 'text-foreground'
            )}
          >
            {sec}s
          </span>
        );
      },
    },
    {
      key: 'waitEventType',
      label: 'Wait',
      width: 80,
      render: (val) =>
        val ? (
          <Badge variant="outline" className="text-[10px] px-1">
            {String(val)}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">-</span>
        ),
    },
    {
      key: 'applicationName',
      label: 'Application',
      width: 100,
      render: (val) => <span className="text-xs truncate">{String(val)}</span>,
    },
    {
      key: 'query',
      label: 'SQL',
      render: (val) => (
        <div className="font-mono text-[11px] text-muted-foreground truncate max-w-[400px]" title={String(val)}>
          {String(val)}
        </div>
      ),
    },
  ];

  const historicalColumns: DataTableColumn<HistoricalSlowQuery>[] = [
    {
      key: 'queryId',
      label: 'Query ID',
      width: 100,
      render: (val) => <span className="font-mono text-[10px]">{String(val).slice(-8)}</span>,
    },
    {
      key: 'calls',
      label: 'Calls',
      width: 70,
      align: 'right',
      sortable: true,
      render: (val) => <span className="font-mono text-xs">{Number(val).toLocaleString()}</span>,
    },
    {
      key: 'meanExecTimeMs',
      label: '평균 실행시간',
      width: 100,
      align: 'right',
      sortable: true,
      render: (val) => {
        const ms = Number(val);
        return (
          <span className={cn('font-mono text-xs font-bold', ms >= 5000 ? 'text-red-400' : ms >= 1000 ? 'text-orange-400' : 'text-foreground')}>
            {(ms / 1000).toFixed(2)}s
          </span>
        );
      },
    },
    {
      key: 'maxExecTimeMs',
      label: '최대',
      width: 80,
      align: 'right',
      sortable: true,
      render: (val) => <span className="font-mono text-xs">{(Number(val) / 1000).toFixed(2)}s</span>,
    },
    {
      key: 'totalExecTimeMs',
      label: '누적',
      width: 90,
      align: 'right',
      sortable: true,
      render: (val) => <span className="font-mono text-xs">{(Number(val) / 1000).toFixed(1)}s</span>,
    },
    {
      key: 'query',
      label: 'SQL',
      render: (val) => (
        <div className="font-mono text-[11px] text-muted-foreground truncate max-w-[400px]" title={String(val)}>
          {String(val)}
        </div>
      ),
    },
  ];

  const formatTime = (ts: number) => {
    try {
      return format(new Date(ts), 'HH:mm:ss');
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">슬로우 쿼리</h1>
          <Badge variant="outline" className="text-xs gap-1">
            <AlertTriangle className="h-3 w-3" />
            {activeQueries.length}건 실행 중
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">임계값:</span>
            <Input
              type="number"
              value={thresholdMs}
              onChange={(e) => setThresholdMs(Number(e.target.value) || 100)}
              className="h-7 w-20 text-xs font-mono"
              min={100}
              step={100}
            />
            <span className="text-xs text-muted-foreground">ms</span>
          </div>
          <TimeRangeSelector isLive={isLive} onLiveToggle={setIsLive} />
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Scatter Plot */}
      <WidgetCard title="SQL 응답 시간 분포" fullscreenable>
        <div className="h-[250px]">
          {!selectedConnectionId ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              DB를 선택해주세요
            </div>
          ) : scatterData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {isLoading ? '데이터 로딩 중...' : '현재 슬로우 쿼리가 없습니다'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <ScatterChart
                margin={{ top: 10, right: 10, bottom: 0, left: 0 }}
                onMouseDown={(e: any) => e?.activeLabel && setRefAreaLeft(e.activeLabel)}
                onMouseMove={(e: any) => refAreaLeft && e?.activeLabel && setRefAreaRight(e.activeLabel)}
                onMouseUp={() => {
                  if (refAreaLeft && refAreaRight) {
                    setSelectedArea({ startX: refAreaLeft, endX: refAreaRight });
                  }
                  setRefAreaLeft(undefined);
                  setRefAreaRight(undefined);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" strokeOpacity={0.5} />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={formatTime}
                  tick={{ fontSize: 10, fill: 'hsl(var(--chart-tick))' }}
                  axisLine={{ stroke: 'hsl(var(--chart-grid))' }}
                  tickLine={false}
                />
                <YAxis
                  dataKey="y"
                  name="Duration (s)"
                  tick={{ fontSize: 10, fill: 'hsl(var(--chart-tick))' }}
                  axisLine={false}
                  tickLine={false}
                  label={{
                    value: '실행시간 (초)',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fontSize: 10, fill: 'hsl(var(--chart-tick))' },
                  }}
                />
                <Tooltip
                  content={({ payload }) => {
                    if (!payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="rounded-md border border-border bg-popover p-2 text-xs shadow-lg">
                        <div className="font-medium">{d.database} / {d.user}</div>
                        <div className="text-muted-foreground mt-1">
                          PID: {d.pid} | {(d.durationMs / 1000).toFixed(2)}s
                        </div>
                        <div className="font-mono text-[10px] mt-1 max-w-[300px] truncate">
                          {d.query}
                        </div>
                      </div>
                    );
                  }}
                />
                <Scatter data={scatterData} shape="circle">
                  {scatterData.map((entry, i) => (
                    <Cell key={i} fill={getDurationColor(entry.durationMs)} fillOpacity={0.8} r={5} />
                  ))}
                </Scatter>
                {refAreaLeft && refAreaRight && (
                  <ReferenceArea
                    x1={refAreaLeft}
                    x2={refAreaRight}
                    strokeOpacity={0.3}
                    fill="hsl(217 91% 60%)"
                    fillOpacity={0.1}
                  />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>
        {selectedArea && (
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-[10px]">
              선택 영역: {filteredQueries.length}건
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setSelectedArea(null)}
            >
              선택 해제
            </Button>
          </div>
        )}
      </WidgetCard>

      {/* Active Slow Queries */}
      <WidgetCard title={`실행 중인 슬로우 쿼리 (${filteredQueries.length}건)`} fullscreenable>
        <DataTable
          data={filteredQueries as any}
          columns={activeColumns as any}
          rowKey="pid"
          searchable
          searchPlaceholder="쿼리 검색..."
          searchFields={['query', 'user', 'database']}
          exportable
          exportFilename="slow-queries-active"
          pageSize={20}
          compact
          emptyMessage="현재 실행 중인 슬로우 쿼리가 없습니다"
        />
      </WidgetCard>

      {/* Historical Slow Queries */}
      {historicalQueries.length > 0 && (
        <WidgetCard title={`과거 슬로우 쿼리 통계 (${historicalQueries.length}건)`} fullscreenable>
          <DataTable
            data={historicalQueries as any}
            columns={historicalColumns as any}
            rowKey="queryId"
            searchable
            searchPlaceholder="쿼리 검색..."
            exportable
            exportFilename="slow-queries-historical"
            pageSize={20}
            compact
            emptyMessage="기록된 슬로우 쿼리가 없습니다"
            onRowClick={(row: any) => setSelectedHistorical(row as HistoricalSlowQuery)}
          />
        </WidgetCard>
      )}

      {/* Historical SQL Detail Dialog */}
      <Dialog open={!!selectedHistorical} onOpenChange={(open) => { if (!open) setSelectedHistorical(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              SQL 상세 정보
              <Badge variant="outline" className="text-[10px] font-mono">
                Query ID: {selectedHistorical?.queryId}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          {selectedHistorical && (
            <div className="space-y-4">
              {/* SQL Full Text */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">SQL Full Text</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedHistorical.query || '');
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    {copied ? '복사됨' : '복사'}
                  </Button>
                </div>
                <pre className="rounded-md bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto border border-border/50">
                  {selectedHistorical.query || '-'}
                </pre>
              </div>

              {/* Stats Grid */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">실행 통계</label>
                <div className="rounded-md bg-muted/50 p-3 grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Query ID</span>
                    <span className="font-mono">{selectedHistorical.queryId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">호출 횟수</span>
                    <span className="font-mono font-bold">{selectedHistorical.calls.toLocaleString()}회</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">평균 실행시간</span>
                    <span className={cn(
                      'font-mono font-bold',
                      selectedHistorical.meanExecTimeMs >= 5000 ? 'text-red-400' :
                      selectedHistorical.meanExecTimeMs >= 1000 ? 'text-orange-400' : ''
                    )}>
                      {(selectedHistorical.meanExecTimeMs / 1000).toFixed(3)}s
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">최대 실행시간</span>
                    <span className={cn(
                      'font-mono font-bold',
                      selectedHistorical.maxExecTimeMs >= 10000 ? 'text-red-400' :
                      selectedHistorical.maxExecTimeMs >= 5000 ? 'text-orange-400' : ''
                    )}>
                      {(selectedHistorical.maxExecTimeMs / 1000).toFixed(3)}s
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">누적 실행시간</span>
                    <span className="font-mono font-bold">
                      {selectedHistorical.totalExecTimeMs >= 60000
                        ? `${(selectedHistorical.totalExecTimeMs / 60000).toFixed(1)}m`
                        : `${(selectedHistorical.totalExecTimeMs / 1000).toFixed(1)}s`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">호출당 평균 시간 비중</span>
                    <span className="font-mono">
                      {selectedHistorical.calls > 0
                        ? `${((selectedHistorical.totalExecTimeMs / selectedHistorical.calls / selectedHistorical.meanExecTimeMs) * 100).toFixed(0)}%`
                        : '-'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
