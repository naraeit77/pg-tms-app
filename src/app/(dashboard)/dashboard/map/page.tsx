'use client';

/**
 * 인스턴스 맵 (Instance Map)
 * WhaTap /postgresql/instance-map 스타일
 * 아이콘 기반 상태 맵 + 클릭 시 우측 상세 패널
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  StatusSummaryBar,
  StatusIndicator,
  type StatusLevel,
} from '@/components/shared/status-indicator';
import { TimeRangeSelector } from '@/components/shared/time-range-selector';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RefreshCw,
  Database,
  Activity,
  Cpu,
  HardDrive,
  X,
} from 'lucide-react';
import { useDatabaseStore } from '@/lib/stores/database-store';

interface InstanceData {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  pgVersion: string | null;
  status: StatusLevel;
  isDefault: boolean;
  metrics: {
    activeSessions: number;
    totalSessions: number;
    cacheHitRatio: number;
    tps: number;
    lockWaitSessions: number;
    slowQueries: number;
    dbSizeMb: number;
  } | null;
  error?: string;
}

const statusColors: Record<StatusLevel, string> = {
  normal: 'border-blue-500 bg-blue-500/10 hover:bg-blue-500/20',
  warning: 'border-orange-500 bg-orange-500/10 hover:bg-orange-500/20',
  critical: 'border-red-500 bg-red-500/10 hover:bg-red-500/20 animate-pulse',
  inactive: 'border-slate-600 bg-slate-500/10 hover:bg-slate-500/20 opacity-60',
};

const statusIconColor: Record<StatusLevel, string> = {
  normal: 'text-blue-400',
  warning: 'text-orange-400',
  critical: 'text-red-400',
  inactive: 'text-slate-500',
};

export default function InstanceMapPage() {
  const router = useRouter();
  const { selectConnection } = useDatabaseStore();
  const [isLive, setIsLive] = useState(true);
  const [selectedInstance, setSelectedInstance] = useState<InstanceData | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['instance-list'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/instance-list');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    refetchInterval: isLive ? 5000 : false,
  });

  const instances: InstanceData[] = data?.data || [];
  const summary = data?.summary || { total: 0, normal: 0, warning: 0, critical: 0, inactive: 0 };

  const handleInstanceClick = (inst: InstanceData) => {
    setSelectedInstance(inst);
  };

  const handleNavigateToMonitoring = (id: string) => {
    selectConnection(id);
    router.push('/dashboard/instance');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">인스턴스 맵</h1>
          <StatusSummaryBar
            normal={summary.normal}
            warning={summary.warning}
            critical={summary.critical}
            inactive={summary.inactive}
          />
        </div>
        <div className="flex items-center gap-2">
          <TimeRangeSelector isLive={isLive} onLiveToggle={setIsLive} />
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Instance Grid */}
        <div className="flex-1 min-w-0">
          {instances.length === 0 ? (
            <div className="flex items-center justify-center h-[400px] text-muted-foreground">
              {isLoading ? '로딩 중...' : '등록된 인스턴스가 없습니다'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {instances.map((inst) => (
                <button
                  key={inst.id}
                  onClick={() => handleInstanceClick(inst)}
                  className={cn(
                    'relative rounded-lg border-2 p-3 transition-all text-left',
                    statusColors[inst.status],
                    selectedInstance?.id === inst.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Database className={cn('h-5 w-5', statusIconColor[inst.status])} />
                    <span className="text-xs font-medium truncate">{inst.name}</span>
                  </div>
                  {inst.metrics ? (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">Active</span>
                        <span className={cn(
                          'font-mono font-bold',
                          Number(inst.metrics.activeSessions) > 50 ? 'text-red-400' :
                          Number(inst.metrics.activeSessions) > 10 ? 'text-orange-400' : 'text-foreground'
                        )}>
                          {Number(inst.metrics.activeSessions) || 0}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">TPS</span>
                        <span className="font-mono">{(Number(inst.metrics.tps) || 0).toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">Cache</span>
                        <span className={cn(
                          'font-mono',
                          Number(inst.metrics.cacheHitRatio) < 90 ? 'text-red-400' : 'text-emerald-400'
                        )}>
                          {Number(inst.metrics.cacheHitRatio).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-muted-foreground">연결 실패</div>
                  )}
                  {inst.isDefault && (
                    <Badge className="absolute -top-1.5 -right-1.5 text-[8px] px-1 py-0 bg-cyan-600">
                      기본
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail Side Panel */}
        {selectedInstance && (
          <Card className="w-[320px] shrink-0 border-border/50 overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-border/50">
              <div className="flex items-center gap-2 min-w-0">
                <StatusIndicator status={selectedInstance.status} size="sm" />
                <span className="text-sm font-medium truncate">{selectedInstance.name}</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedInstance(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <Tabs defaultValue="overview" className="px-3 py-2">
              <TabsList className="w-full h-8">
                <TabsTrigger value="overview" className="text-xs flex-1">개요</TabsTrigger>
                <TabsTrigger value="metrics" className="text-xs flex-1">메트릭</TabsTrigger>
                <TabsTrigger value="sessions" className="text-xs flex-1">세션</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-3 mt-3">
                <div className="space-y-2 text-xs">
                  <InfoRow label="Host" value={`${selectedInstance.host}:${selectedInstance.port}`} mono />
                  <InfoRow label="Database" value={selectedInstance.database} mono />
                  <InfoRow label="Version" value={selectedInstance.pgVersion || '-'} mono />
                  <InfoRow label="DB Size" value={
                    selectedInstance.metrics
                      ? Number(selectedInstance.metrics.dbSizeMb) >= 1024
                        ? `${(Number(selectedInstance.metrics.dbSizeMb) / 1024).toFixed(1)} GB`
                        : `${Number(selectedInstance.metrics.dbSizeMb) || 0} MB`
                      : '-'
                  } />
                </div>
                <Button
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => handleNavigateToMonitoring(selectedInstance.id)}
                >
                  <Activity className="h-3.5 w-3.5 mr-1.5" />
                  상세 모니터링
                </Button>
              </TabsContent>

              <TabsContent value="metrics" className="space-y-2 mt-3">
                {selectedInstance.metrics ? (
                  <>
                    <MetricRow label="Active Sessions" value={Number(selectedInstance.metrics.activeSessions) || 0} warn={10} crit={50} />
                    <MetricRow label="Total Connections" value={Number(selectedInstance.metrics.totalSessions) || 0} />
                    <MetricRow label="TPS" value={Number((Number(selectedInstance.metrics.tps) || 0).toFixed(1))} />
                    <MetricRow label="Cache Hit Ratio" value={`${Number(selectedInstance.metrics.cacheHitRatio).toFixed(1)}%`} />
                    <MetricRow label="Lock Wait" value={Number(selectedInstance.metrics.lockWaitSessions) || 0} warn={1} crit={5} />
                    <MetricRow label="Slow Queries" value={Number(selectedInstance.metrics.slowQueries) || 0} warn={3} crit={10} />
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground py-4 text-center">
                    메트릭을 가져올 수 없습니다
                  </div>
                )}
              </TabsContent>

              <TabsContent value="sessions" className="mt-3">
                {selectedInstance.metrics ? (
                  <div className="space-y-2">
                    <SessionBar label="Active" count={selectedInstance.metrics.activeSessions} total={selectedInstance.metrics.totalSessions} color="bg-emerald-500" />
                    <SessionBar label="Idle" count={selectedInstance.metrics.totalSessions - selectedInstance.metrics.activeSessions} total={selectedInstance.metrics.totalSessions} color="bg-slate-500" />
                    <SessionBar label="Lock Wait" count={selectedInstance.metrics.lockWaitSessions} total={selectedInstance.metrics.totalSessions} color="bg-red-500" />
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground py-4 text-center">
                    세션 정보를 가져올 수 없습니다
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </Card>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('text-foreground', mono && 'font-mono')}>{value}</span>
    </div>
  );
}

function MetricRow({ label, value, warn, crit }: { label: string; value: number | string; warn?: number; crit?: number }) {
  const numVal = typeof value === 'number' ? value : 0;
  const color = crit && numVal >= crit ? 'text-red-400' : warn && numVal >= warn ? 'text-orange-400' : 'text-foreground';
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-mono font-bold', color)}>{value}</span>
    </div>
  );
}

function SessionBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{count}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
