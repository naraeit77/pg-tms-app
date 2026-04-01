'use client';

/**
 * 인스턴스 목록 (Instance List)
 * WhaTap /postgresql/instance-list 스타일
 * 연결된 모든 DB 인스턴스의 상태와 핵심 메트릭을 테이블로 표시
 */

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  StatusSummaryBar,
  type StatusLevel,
} from '@/components/shared/status-indicator';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { TimeRangeSelector } from '@/components/shared/time-range-selector';
import { RefreshCw, Database, ExternalLink } from 'lucide-react';
import { useDatabaseStore } from '@/lib/stores/database-store';
import { MiniTimeChart } from '@/components/charts/mini-time-chart';
import { useState, useRef, useEffect } from 'react';

interface InstanceMetrics {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  pgVersion: string | null;
  healthStatus: string;
  isDefault: boolean;
  status: StatusLevel;
  metrics: {
    activeSessions: number;
    idleSessions: number;
    totalSessions: number;
    cacheHitRatio: number;
    tps: number;
    totalConnections: number;
    lockWaitSessions: number;
    slowQueries: number;
    replicationDelay: number;
    dbSizeMb: number;
    uptime: string;
  } | null;
  error?: string;
}

interface InstanceListResponse {
  success: boolean;
  data: InstanceMetrics[];
  summary: {
    total: number;
    normal: number;
    warning: number;
    critical: number;
    inactive: number;
  };
}

// 인라인 미니 차트용 히스토리 저장
type MetricHistory = Map<string, { time: string; active: number; tps: number }[]>;

const statusBadge: Record<StatusLevel, { label: string; className: string }> = {
  normal: { label: '정상', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  warning: { label: '경고', className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  critical: { label: '위험', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
  inactive: { label: '비활성', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};

export default function InstanceListPage() {
  const router = useRouter();
  const { selectConnection } = useDatabaseStore();
  const [isLive, setIsLive] = useState(true);
  const historyRef = useRef<MetricHistory>(new Map());

  const { data, isLoading, refetch } = useQuery<InstanceListResponse>({
    queryKey: ['instance-list'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/instance-list');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    refetchInterval: isLive ? 5000 : false,
  });

  // 히스토리 데이터 축적 (최근 60개 = 5분)
  useEffect(() => {
    if (!data?.data) return;
    const now = new Date().toISOString();
    for (const inst of data.data) {
      if (!inst.metrics) continue;
      const history = historyRef.current.get(inst.id) || [];
      history.push({
        time: now,
        active: inst.metrics.activeSessions,
        tps: inst.metrics.tps,
      });
      if (history.length > 60) history.shift();
      historyRef.current.set(inst.id, history);
    }
  }, [data]);

  const instances = data?.data || [];
  const summary = data?.summary || { total: 0, normal: 0, warning: 0, critical: 0, inactive: 0 };

  const handleRowClick = (row: InstanceMetrics) => {
    selectConnection(row.id);
    router.push('/dashboard/instance');
  };

  const columns: DataTableColumn<InstanceMetrics>[] = [
    {
      key: 'status',
      label: '상태',
      width: 70,
      align: 'center',
      sortable: true,
      render: (_val, row) => {
        const cfg = statusBadge[row.status];
        return (
          <Badge variant="outline" className={cn('text-[10px] font-bold', cfg.className)}>
            {cfg.label}
          </Badge>
        );
      },
    },
    {
      key: 'name',
      label: '인스턴스',
      width: 180,
      render: (_val, row) => (
        <div className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate flex items-center gap-1">
              {row.name}
              {row.isDefault && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 text-cyan-400 border-cyan-500/30">
                  기본
                </Badge>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono truncate">
              {row.host}:{row.port}/{row.database}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'pgVersion',
      label: '버전',
      width: 80,
      render: (val) => (
        <span className="font-mono text-xs">{val ? String(val) : '-'}</span>
      ),
    },
    {
      key: 'activeSessions',
      label: 'Active Sessions',
      width: 140,
      align: 'center',
      sortable: true,
      render: (_val, row) => {
        const active = Number(row.metrics?.activeSessions) || 0;
        const history = historyRef.current.get(row.id) || [];
        return (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'font-mono font-bold text-sm min-w-[24px] text-right',
                active > 50 ? 'text-red-400' : active > 10 ? 'text-orange-400' : 'text-foreground'
              )}
            >
              {active}
            </span>
            {history.length > 2 && (
              <MiniTimeChart
                data={history}
                dataKeys={['active']}
                colors={['#3b82f6']}
                width={80}
                height={24}
                showAxis={false}
              />
            )}
          </div>
        );
      },
    },
    {
      key: 'tps',
      label: 'TPS',
      width: 120,
      align: 'center',
      sortable: true,
      render: (_val, row) => {
        const tps = Number(row.metrics?.tps) || 0;
        const history = historyRef.current.get(row.id) || [];
        return (
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm min-w-[32px] text-right">
              {tps.toFixed(1)}
            </span>
            {history.length > 2 && (
              <MiniTimeChart
                data={history}
                dataKeys={['tps']}
                colors={['#10b981']}
                width={80}
                height={24}
                showAxis={false}
              />
            )}
          </div>
        );
      },
    },
    {
      key: 'cacheHitRatio',
      label: 'Cache Hit',
      width: 90,
      align: 'right',
      sortable: true,
      render: (_val, row) => {
        const ratio = Number(row.metrics?.cacheHitRatio) || 0;
        const pct = (ratio * 100).toFixed(1);
        return (
          <span
            className={cn(
              'font-mono text-sm',
              ratio < 0.9 ? 'text-red-400' : ratio < 0.95 ? 'text-orange-400' : 'text-emerald-400'
            )}
          >
            {pct}%
          </span>
        );
      },
    },
    {
      key: 'lockWaitSessions',
      label: 'Lock Wait',
      width: 80,
      align: 'right',
      sortable: true,
      render: (_val, row) => {
        const count = Number(row.metrics?.lockWaitSessions) || 0;
        return (
          <span
            className={cn(
              'font-mono text-sm',
              count > 5 ? 'text-red-400' : count > 0 ? 'text-orange-400' : 'text-muted-foreground'
            )}
          >
            {count}
          </span>
        );
      },
    },
    {
      key: 'slowQueries',
      label: 'Slow Query',
      width: 85,
      align: 'right',
      sortable: true,
      render: (_val, row) => {
        const count = Number(row.metrics?.slowQueries) || 0;
        return (
          <span
            className={cn(
              'font-mono text-sm',
              count > 10 ? 'text-red-400' : count > 3 ? 'text-orange-400' : 'text-muted-foreground'
            )}
          >
            {count}
          </span>
        );
      },
    },
    {
      key: 'totalConnections',
      label: 'Connections',
      width: 90,
      align: 'right',
      sortable: true,
      render: (_val, row) => (
        <span className="font-mono text-sm">
          {row.metrics?.totalConnections ?? '-'}
        </span>
      ),
    },
    {
      key: 'dbSizeMb',
      label: 'DB Size',
      width: 90,
      align: 'right',
      sortable: true,
      render: (_val, row) => {
        const mb = Number(row.metrics?.dbSizeMb) || 0;
        return (
          <span className="font-mono text-sm text-muted-foreground">
            {mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`}
          </span>
        );
      },
    },
    {
      key: 'action',
      label: '',
      width: 40,
      sortable: false,
      render: () => (
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">인스턴스 목록</h1>
          <StatusSummaryBar
            normal={summary.normal}
            warning={summary.warning}
            critical={summary.critical}
            inactive={summary.inactive}
          />
        </div>
        <div className="flex items-center gap-2">
          <TimeRangeSelector isLive={isLive} onLiveToggle={setIsLive} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            새로고침
          </Button>
        </div>
      </div>

      {/* Instance Table */}
      <DataTable
        data={instances as any}
        columns={columns as any}
        rowKey="id"
        searchable
        searchPlaceholder="인스턴스 검색..."
        searchFields={['name', 'host', 'database']}
        exportable
        exportFilename="instance-list"
        customizable
        onRowClick={handleRowClick as any}
        emptyMessage={isLoading ? '인스턴스 정보를 불러오는 중...' : '등록된 인스턴스가 없습니다. DB 연결을 추가해주세요.'}
        compact
      />
    </div>
  );
}
