'use client';

/**
 * 멀티 인스턴스 모니터링 (Multi-Instance Monitoring)
 * WhaTap /postgresql/multi-instance-monitoring 스타일
 *
 * Layout:
 *   Header: LIVE indicator + Total/Active/Inactive counts + Instance tags
 *   Row 1: Active Sessions | DML Tuples | Slow Query | Logical I/O | SQL Elapse Map
 *   Row 2: Lock Wait Sessions | Commit Count | Replication Delay | Physical I/O | Wait Event
 *   Bottom: 인스턴스 비교 테이블 (세션 테이블 포함)
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { StatusSummaryBar, type StatusLevel } from '@/components/shared/status-indicator';
import { WidgetCard } from '@/components/shared/widget-card';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MiniTimeChart } from '@/components/charts/mini-time-chart';
import { SqlElapseMap, SqlElapseLegend, type SqlElapsePoint } from '@/components/charts/sql-elapse-map';
import { RefreshCw, Pause, Play, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
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

/* ════════════════════════════════════════════════════════════ */
/*  Types                                                      */
/* ════════════════════════════════════════════════════════════ */

interface ActiveSessionDetail {
  pid: number;
  query: string | null;
  usename: string;
  query_duration_ms: number | null;
}

interface InstanceMetrics {
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
  activeSessionDetails?: ActiveSessionDetail[];
}

interface InstanceData {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  status: StatusLevel;
  metrics: InstanceMetrics | null;
}

/** Aggregated history point (summed across all instances) */
interface AHP {
  time: string;
  activeSessions: number;
  totalSessions: number;
  tps: number;
  lockWaitSessions: number;
  slowQueries: number;
  commits: number;
  replicationDelay: number;
  blksHitRate: number;
  blksReadRate: number;
  dmlRate: number;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];
const GRID = 'hsl(var(--chart-grid))';
const TICK = { fontSize: 9, fill: 'hsl(var(--chart-tick))' };
const TT_STYLE: React.CSSProperties = {
  backgroundColor: 'hsl(var(--chart-tooltip-bg))',
  border: '1px solid hsl(var(--chart-tooltip-border))',
  borderRadius: '6px', fontSize: '11px', color: 'hsl(var(--chart-tooltip-text))',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
};

const fmtNum = (n: number) => {
  if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n/1e3).toFixed(1)}K`;
  return n.toLocaleString();
};

/* ════════════════════════════════════════════════════════════ */
/*  Main Component                                              */
/* ════════════════════════════════════════════════════════════ */

export default function MultiInstancePage() {
  const [isLive, setIsLive] = useState(true);
  const [history, setHistory] = useState<AHP[]>([]);
  const [elapseData, setElapseData] = useState<SqlElapsePoint[]>([]);
  const [currentTime, setCurrentTime] = useState('');

  const { data, isLoading, refetch, isFetching } = useQuery({
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

  // ── Accumulate aggregated history ──
  useEffect(() => {
    const now = Date.now();
    const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setCurrentTime(time);
    if (!connectedInstances.length) return;

    const agg: AHP = {
      time,
      activeSessions: 0,
      totalSessions: 0,
      tps: 0,
      lockWaitSessions: 0,
      slowQueries: 0,
      commits: 0,
      replicationDelay: 0,
      blksHitRate: 0,
      blksReadRate: 0,
      dmlRate: 0,
    };

    for (const inst of connectedInstances) {
      if (!inst.metrics) continue;
      agg.activeSessions += Number(inst.metrics.activeSessions) || 0;
      agg.totalSessions += Number(inst.metrics.totalSessions) || 0;
      agg.tps += Number(inst.metrics.tps) || 0;
      agg.lockWaitSessions += Number(inst.metrics.lockWaitSessions) || 0;
      agg.slowQueries += Number(inst.metrics.slowQueries) || 0;
      agg.commits += Number(inst.metrics.tps) || 0;
      agg.replicationDelay = Math.max(agg.replicationDelay, Number(inst.metrics.replicationDelay) || 0);
    }

    setHistory(prev => [...prev.slice(-59), agg]);

    // SQL Elapse Map 포인트 생성 (실제 활성 세션의 query_duration_ms 사용)
    const newPoints: SqlElapsePoint[] = [];
    for (const inst of connectedInstances) {
      if (!inst.metrics?.activeSessionDetails) continue;
      inst.metrics.activeSessionDetails.forEach((s, i) => {
        if (s.query_duration_ms != null) {
          newPoints.push({
            time,
            timeNum: now + i,
            elapsed: Math.max(s.query_duration_ms, 1) / 1000,
            pid: s.pid,
            query: s.query ?? undefined,
            user: s.usename || inst.name,
          });
        }
      });
    }
    if (newPoints.length > 0) {
      setElapseData(prev => [...prev.slice(-300 + newPoints.length), ...newPoints]);
    }
  }, [data]);

  // ── Aggregated metrics ──
  const aggregated = useMemo(() => {
    const total = {
      activeSessions: 0, totalSessions: 0, tps: 0,
      lockWaitSessions: 0, slowQueries: 0, dbSizeMb: 0,
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

  const lv = history.length > 0 ? history[history.length - 1] : null;

  // ── Bar chart data ──
  const activeSessionsChart = connectedInstances.map((inst, i) => ({
    name: inst.name,
    active: inst.metrics?.activeSessions ?? 0,
    color: COLORS[i % COLORS.length],
  }));

  const tpsChart = connectedInstances.map((inst, i) => ({
    name: inst.name,
    tps: inst.metrics?.tps ?? 0,
    color: COLORS[i % COLORS.length],
  }));

  const dbSizeChart = connectedInstances
    .filter((i) => i.metrics && i.metrics.dbSizeMb > 0)
    .map((inst, i) => ({
      name: inst.name,
      value: inst.metrics?.dbSizeMb ?? 0,
      color: COLORS[i % COLORS.length],
    }));

  // ── Table ──
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
      key: 'activeSessions', label: 'Active', width: 70, align: 'right', sortable: true,
      render: (val) => <span className={cn('font-mono text-sm', Number(val) > 50 ? 'text-red-400' : Number(val) > 10 ? 'text-orange-400' : '')}>{String(val)}</span>,
    },
    {
      key: 'totalSessions', label: 'Total Sessions', width: 100, align: 'right', sortable: true,
      render: (val) => <span className="font-mono text-sm">{String(val)}</span>,
    },
    {
      key: 'tps', label: 'TPS', width: 80, align: 'right', sortable: true,
      render: (val) => <span className="font-mono text-sm">{Number(val).toFixed(1)}</span>,
    },
    {
      key: 'cacheHitRatio', label: 'Cache Hit', width: 85, align: 'right', sortable: true,
      render: (val) => {
        const pct = Number(val);
        return <span className={cn('font-mono text-sm', pct < 90 ? 'text-red-400' : pct < 95 ? 'text-orange-400' : 'text-emerald-400')}>{pct.toFixed(1)}%</span>;
      },
    },
    {
      key: 'lockWaitSessions', label: 'Lock Wait', width: 80, align: 'right', sortable: true,
      render: (val) => <span className={cn('font-mono text-sm', Number(val) > 0 ? 'text-orange-400' : 'text-muted-foreground')}>{String(val)}</span>,
    },
    {
      key: 'slowQueries', label: 'Slow', width: 60, align: 'right', sortable: true,
      render: (val) => <span className={cn('font-mono text-sm', Number(val) > 3 ? 'text-orange-400' : 'text-muted-foreground')}>{String(val)}</span>,
    },
    {
      key: 'dbSizeMb', label: 'Size', width: 80, align: 'right', sortable: true,
      render: (val) => {
        const mb = Number(val);
        return <span className="font-mono text-sm text-muted-foreground">{mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`}</span>;
      },
    },
  ];

  return (
    <div className="space-y-2 p-2">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">멀티 인스턴스 모니터링</h1>
          <Button variant="ghost" size="sm" onClick={() => setIsLive(p => !p)} className="h-7 px-2 gap-1">
            {isLive ? <Pause className="h-3 w-3"/> : <Play className="h-3 w-3"/>}
          </Button>
          {isLive
            ? <Badge variant="outline" className="text-[10px] px-2 py-0.5 text-emerald-400 border-emerald-500/30">LIVE</Badge>
            : <Badge variant="outline" className="text-[10px] px-2 py-0.5 text-muted-foreground">PAUSED</Badge>}
          <span className="text-xs text-muted-foreground font-mono" suppressHydrationWarning>{currentTime}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Total</span><span className="font-bold">{summary.total}</span>
            <span className="text-emerald-500">Active</span><span className="font-bold text-emerald-500">{summary.normal}</span>
            <span className="text-muted-foreground">Inactive</span><span className="font-bold text-muted-foreground">{summary.inactive}</span>
          </div>
          <StatusSummaryBar normal={summary.normal} warning={summary.warning} critical={summary.critical} inactive={summary.inactive} />
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-7 px-2">
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* ── Instance Tags ── */}
      <div className="flex flex-wrap gap-1.5">
        {instances.map((inst, i) => (
          <Badge
            key={inst.id}
            variant="outline"
            className={cn(
              'text-[10px] px-2 py-0.5 font-mono',
              inst.status === 'normal' ? 'border-blue-500/30 text-blue-400' :
              inst.status === 'warning' ? 'border-orange-500/30 text-orange-400' :
              inst.status === 'critical' ? 'border-red-500/30 text-red-400' :
              'border-border text-muted-foreground'
            )}
          >
            {inst.name}
          </Badge>
        ))}
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <SummaryCard label="Total Active" value={aggregated.activeSessions} warn={100} crit={200} />
        <SummaryCard label="Total Sessions" value={aggregated.totalSessions} />
        <SummaryCard label="Total TPS" value={Number(aggregated.tps.toFixed(1))} />
        <SummaryCard label="Lock Wait" value={aggregated.lockWaitSessions} warn={1} crit={10} />
        <SummaryCard label="Slow Queries" value={aggregated.slowQueries} warn={5} crit={20} />
        <SummaryCard label="Total DB Size" value={aggregated.dbSizeMb >= 1024 ? `${(aggregated.dbSizeMb / 1024).toFixed(1)} GB` : `${aggregated.dbSizeMb} MB`} />
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* Row 1: Active Sessions | DML Tuples | Slow Query | Logical I/O | SQL Elapse Map */}
      {/* ════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        <WCard title="Active Sessions" val={lv ? String(lv.activeSessions) : '-'} vc="text-blue-400">
          <MiniTimeChart data={history} series={[{key:'activeSessions',color:'#3b82f6',name:'Active'}]} height={120}/>
        </WCard>
        <WCard title="DML Tuples" val={lv ? `${fmtNum(lv.tps)}/s` : '-'} vc="text-purple-400">
          <MiniTimeChart data={history} series={[{key:'tps',color:'#8b5cf6',name:'TPS'}]} height={120}/>
        </WCard>
        <WCard title="Slow Query" val={lv ? String(lv.slowQueries) : '-'} vc={(lv?.slowQueries??0) > 0 ? 'text-amber-400' : 'text-foreground/50'}>
          <MiniTimeChart data={history} series={[{key:'slowQueries',color:'#f59e0b',name:'Slow'}]} height={120}/>
        </WCard>
        <WCard title="Logical I/O" val={lv ? `${fmtNum(lv.totalSessions)}` : '-'}>
          <MiniTimeChart data={history} series={[{key:'totalSessions',color:'#3b82f6',name:'Sessions'}]} height={120}/>
        </WCard>
        {/* SQL Elapse Map */}
        <div className="bg-card rounded border border-border p-3 overflow-hidden min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-muted-foreground">SQL Elapse Map</span>
            <SqlElapseLegend compact/>
          </div>
          <SqlElapseMap data={elapseData} height={120}/>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* Row 2: Lock Wait | Commit Count | Replication Delay | Physical I/O | Wait Event */}
      {/* ════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        <WCard title="Lock Wait Sessions" val={lv ? String(lv.lockWaitSessions) : '-'} vc={(lv?.lockWaitSessions??0) > 0 ? 'text-red-400' : 'text-foreground/50'}>
          <MiniTimeChart data={history} series={[{key:'lockWaitSessions',color:'#ef4444',name:'Lock Waits'}]} height={120}/>
        </WCard>
        <WCard title="Commit Count" val={lv ? `${fmtNum(lv.commits)}` : '-'} vc="text-emerald-400">
          <MiniTimeChart data={history} series={[{key:'commits',color:'#10b981',name:'Commits'}]} height={120}/>
        </WCard>
        <WCard title="Replication Delay" val={lv ? `${lv.replicationDelay.toFixed(1)}s` : '-'} vc={(lv?.replicationDelay??0)>10?'text-red-400':(lv?.replicationDelay??0)>1?'text-amber-400':'text-emerald-400'}>
          <MiniTimeChart data={history} series={[{key:'replicationDelay',color:'#06b6d4',name:'Delay(s)'}]} height={120} yFormatter={v=>`${v.toFixed(1)}s`}/>
        </WCard>
        {/* Instance Active Sessions Bar Chart */}
        <div className="bg-card rounded border border-border p-3 overflow-hidden min-w-0">
          <span className="text-[11px] font-medium text-muted-foreground">인스턴스별 Active</span>
          <ResponsiveContainer width="100%" height={120} minWidth={0}>
            <BarChart data={activeSessionsChart} margin={{top:5,right:5,bottom:0,left:-10}}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
              <XAxis dataKey="name" tick={TICK} tickLine={false} axisLine={false}/>
              <YAxis tick={TICK} tickLine={false} axisLine={false}/>
              <Tooltip contentStyle={TT_STYLE}/>
              <Bar dataKey="active" radius={[3,3,0,0]} barSize={14}>
                {activeSessionsChart.map((e,i)=><Cell key={i} fill={e.color}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* DB Size Pie */}
        <div className="bg-card rounded border border-border p-3 overflow-hidden min-w-0">
          <span className="text-[11px] font-medium text-muted-foreground">DB Size 분포</span>
          {dbSizeChart.length === 0
            ? <div className="flex items-center justify-center text-[11px] text-muted-foreground" style={{height: 120}}>데이터 없음</div>
            : <ResponsiveContainer width="100%" height={120} minWidth={0}>
                <PieChart>
                  <Pie data={dbSizeChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={45} innerRadius={25}
                    label={({name, value}) => `${name}: ${value>=1024?`${(value/1024).toFixed(1)}G`:`${value}M`}`}
                    labelLine={{stroke:'hsl(var(--chart-tick))',strokeWidth:1}}>
                    {dbSizeChart.map((e,i)=><Cell key={i} fill={e.color}/>)}
                  </Pie>
                  <Tooltip contentStyle={TT_STYLE}/>
                </PieChart>
              </ResponsiveContainer>}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* Instance Comparison Table                                */}
      {/* ════════════════════════════════════════════════════════ */}
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

/* ════════════════════════════════════════════════════════════ */
/*  Widget Card (compact WhaTap style)                          */
/* ════════════════════════════════════════════════════════════ */

function WCard({title, val, vc='text-foreground', children}: {
  title: string; val?: string; vc?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded border border-border p-3 overflow-hidden min-w-0">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] font-medium text-muted-foreground truncate">{title}</span>
        {val && <span className={`text-sm font-bold tabular-nums ${vc}`}>{val}</span>}
      </div>
      {children}
    </div>
  );
}

function SummaryCard({ label, value, warn, crit }: { label: string; value: number | string; warn?: number; crit?: number }) {
  const numVal = typeof value === 'number' ? value : 0;
  const color = crit && numVal >= crit ? 'text-red-400' : warn && numVal >= warn ? 'text-orange-400' : 'text-foreground';
  return (
    <div className="rounded border border-border/50 bg-card p-2">
      <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
      <div className={cn('text-lg font-bold font-mono', color)}>{value}</div>
    </div>
  );
}
