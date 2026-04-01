'use client';

/**
 * 멀티 인스턴스 모니터링 (Multi-Instance Monitoring)
 * WhaTap /postgresql/multi-instance-monitoring 스타일
 * 복수 인스턴스 메트릭 집계 + 세션 테이블
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { StatusSummaryBar, type StatusLevel } from '@/components/shared/status-indicator';
import { TimeRangeSelector } from '@/components/shared/time-range-selector';
import { WidgetCard } from '@/components/shared/widget-card';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from 'recharts';

interface InstanceData {
  id: string;
  name: string;
  status: StatusLevel;
  metrics: {
    activeSessions: number;
    idleSessions: number;
    totalSessions: number;
    cacheHitRatio: number;
    tps: number;
    lockWaitSessions: number;
    slowQueries: number;
    dbSizeMb: number;
  } | null;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

export default function MultiInstancePage() {
  const [isLive, setIsLive] = useState(true);

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

  const connectedInstances = instances.filter((i) => i.metrics !== null);

  // 집계 메트릭
  const aggregated = useMemo(() => {
    const total = {
      activeSessions: 0,
      totalSessions: 0,
      tps: 0,
      lockWaitSessions: 0,
      slowQueries: 0,
      dbSizeMb: 0,
    };
    for (const inst of connectedInstances) {
      if (!inst.metrics) continue;
      total.activeSessions += Number(inst.metrics.activeSessions) || 0;
      total.totalSessions += Number(inst.metrics.totalSessions) || 0;
      total.tps += Number(inst.metrics.tps) || 0;
      total.lockWaitSessions += Number(inst.metrics.lockWaitSessions) || 0;
      total.slowQueries += Number(inst.metrics.slowQueries) || 0;
      total.dbSizeMb += Number(inst.metrics.dbSizeMb) || 0;
    }
    return total;
  }, [connectedInstances]);

  // 인스턴스별 Active Sessions 바 차트 데이터
  const activeSessionsChart = connectedInstances.map((inst, i) => ({
    name: inst.name,
    active: inst.metrics?.activeSessions ?? 0,
    color: COLORS[i % COLORS.length],
  }));

  // TPS 바 차트 데이터
  const tpsChart = connectedInstances.map((inst, i) => ({
    name: inst.name,
    tps: inst.metrics?.tps ?? 0,
    color: COLORS[i % COLORS.length],
  }));

  // DB Size 파이 차트 데이터
  const dbSizeChart = connectedInstances
    .filter((i) => i.metrics && i.metrics.dbSizeMb > 0)
    .map((inst, i) => ({
      name: inst.name,
      value: inst.metrics?.dbSizeMb ?? 0,
      color: COLORS[i % COLORS.length],
    }));

  // 테이블 데이터
  const tableData = connectedInstances.map((inst) => ({
    id: inst.id,
    name: inst.name,
    status: inst.status,
    activeSessions: inst.metrics?.activeSessions ?? 0,
    totalSessions: inst.metrics?.totalSessions ?? 0,
    tps: inst.metrics?.tps ?? 0,
    cacheHitRatio: inst.metrics?.cacheHitRatio ?? 0,
    lockWaitSessions: inst.metrics?.lockWaitSessions ?? 0,
    slowQueries: inst.metrics?.slowQueries ?? 0,
    dbSizeMb: inst.metrics?.dbSizeMb ?? 0,
  }));

  type TableRow = typeof tableData[number];

  const tableColumns: DataTableColumn<TableRow>[] = [
    {
      key: 'name',
      label: '인스턴스',
      width: 150,
      render: (_val, row) => (
        <div className="flex items-center gap-2">
          <span className={cn(
            'h-2 w-2 rounded-full',
            row.status === 'normal' ? 'bg-blue-500' :
            row.status === 'warning' ? 'bg-orange-500' :
            row.status === 'critical' ? 'bg-red-500' : 'bg-slate-500'
          )} />
          <span className="font-medium text-sm">{row.name}</span>
        </div>
      ),
    },
    {
      key: 'activeSessions',
      label: 'Active',
      width: 70,
      align: 'right',
      sortable: true,
      render: (val) => (
        <span className={cn('font-mono text-sm', Number(val) > 50 ? 'text-red-400' : Number(val) > 10 ? 'text-orange-400' : '')}>
          {String(val)}
        </span>
      ),
    },
    {
      key: 'totalSessions',
      label: 'Total',
      width: 70,
      align: 'right',
      sortable: true,
      render: (val) => <span className="font-mono text-sm">{String(val)}</span>,
    },
    {
      key: 'tps',
      label: 'TPS',
      width: 80,
      align: 'right',
      sortable: true,
      render: (val) => <span className="font-mono text-sm">{Number(val).toFixed(1)}</span>,
    },
    {
      key: 'cacheHitRatio',
      label: 'Cache Hit',
      width: 85,
      align: 'right',
      sortable: true,
      render: (val) => {
        const r = Number(val);
        return (
          <span className={cn('font-mono text-sm', r < 0.9 ? 'text-red-400' : r < 0.95 ? 'text-orange-400' : 'text-emerald-400')}>
            {(r * 100).toFixed(1)}%
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
      render: (val) => (
        <span className={cn('font-mono text-sm', Number(val) > 0 ? 'text-orange-400' : 'text-muted-foreground')}>
          {String(val)}
        </span>
      ),
    },
    {
      key: 'slowQueries',
      label: 'Slow',
      width: 60,
      align: 'right',
      sortable: true,
      render: (val) => (
        <span className={cn('font-mono text-sm', Number(val) > 3 ? 'text-orange-400' : 'text-muted-foreground')}>
          {String(val)}
        </span>
      ),
    },
    {
      key: 'dbSizeMb',
      label: 'Size',
      width: 80,
      align: 'right',
      sortable: true,
      render: (val) => {
        const mb = Number(val);
        return <span className="font-mono text-sm text-muted-foreground">{mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`}</span>;
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">멀티 인스턴스 모니터링</h1>
          <StatusSummaryBar normal={summary.normal} warning={summary.warning} critical={summary.critical} inactive={summary.inactive} />
        </div>
        <div className="flex items-center gap-2">
          <TimeRangeSelector isLive={isLive} onLiveToggle={setIsLive} />
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="Total Active" value={aggregated.activeSessions} warn={100} crit={200} />
        <SummaryCard label="Total Sessions" value={aggregated.totalSessions} />
        <SummaryCard label="Total TPS" value={Number(aggregated.tps.toFixed(1))} />
        <SummaryCard label="Lock Wait" value={aggregated.lockWaitSessions} warn={1} crit={10} />
        <SummaryCard label="Slow Queries" value={aggregated.slowQueries} warn={5} crit={20} />
        <SummaryCard label="Total DB Size" value={aggregated.dbSizeMb >= 1024 ? `${(aggregated.dbSizeMb / 1024).toFixed(1)} GB` : `${aggregated.dbSizeMb} MB`} />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <WidgetCard title="인스턴스별 Active Sessions">
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activeSessionsChart} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 25% 20%)" strokeOpacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(215 20% 50%)' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 50%)' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(217 33% 13%)', border: '1px solid hsl(215 25% 20%)', borderRadius: '6px', fontSize: '12px', color: 'hsl(210 40% 98%)' }} />
                <Bar dataKey="active" radius={[4, 4, 0, 0]}>
                  {activeSessionsChart.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </WidgetCard>

        <WidgetCard title="인스턴스별 TPS">
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tpsChart} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 25% 20%)" strokeOpacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(215 20% 50%)' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 50%)' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(217 33% 13%)', border: '1px solid hsl(215 25% 20%)', borderRadius: '6px', fontSize: '12px', color: 'hsl(210 40% 98%)' }} />
                <Bar dataKey="tps" radius={[4, 4, 0, 0]}>
                  {tpsChart.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </WidgetCard>

        <WidgetCard title="DB 사이즈 분포">
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dbSizeChart}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  innerRadius={40}
                  label={({ name, value }) => `${name}: ${value >= 1024 ? `${(value / 1024).toFixed(1)}G` : `${value}M`}`}
                  labelLine={{ stroke: 'hsl(215 20% 50%)', strokeWidth: 1 }}
                >
                  {dbSizeChart.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'hsl(217 33% 13%)', border: '1px solid hsl(215 25% 20%)', borderRadius: '6px', fontSize: '12px', color: 'hsl(210 40% 98%)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </WidgetCard>
      </div>

      {/* Instance Comparison Table */}
      <WidgetCard title="인스턴스 비교" fullscreenable>
        <DataTable
          data={tableData as any}
          columns={tableColumns as any}
          rowKey="id"
          searchable
          searchPlaceholder="인스턴스 검색..."
          exportable
          exportFilename="multi-instance"
          compact
        />
      </WidgetCard>
    </div>
  );
}

function SummaryCard({ label, value, warn, crit }: { label: string; value: number | string; warn?: number; crit?: number }) {
  const numVal = typeof value === 'number' ? value : 0;
  const color = crit && numVal >= crit ? 'text-red-400' : warn && numVal >= warn ? 'text-orange-400' : 'text-foreground';
  return (
    <div className="rounded-lg border border-border/50 bg-card p-3">
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <div className={cn('text-xl font-bold font-mono', color)}>{value}</div>
    </div>
  );
}
