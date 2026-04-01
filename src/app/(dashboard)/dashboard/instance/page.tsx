'use client';

/**
 * Dashboard Page - WhaTap Multi-Instance Monitoring Style
 * https://docs.whatap.io/postgresql/multi-instance-monitoring
 *
 * Layout:
 *   Row 1 (System):  Cache Hit | TPS | Connections | DB Info+Uptime | Temp/Checkpoints
 *   Row 2 (Perf):    Active Sessions | DML Tuples | Slow Query | Logical I/O | SQL Elapse Map
 *   Row 3 (Resource): Lock Wait | Commits | Replication Delay | Physical I/O | Wait Class
 *   Row 4 (Extended): Long Active | Long Waiting | Deadlocks | Vacuum Sessions | Idle in Tx
 *   Bottom:          [액티브 세션] [락 트리] [Top SQL]
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Database, AlertTriangle, HardDrive, Server, Shield, Cpu,
  RefreshCw, ArrowUpRight, Pause, Play, Maximize2, Clock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { MiniTimeChart } from '@/components/charts/mini-time-chart';
import { WAIT_COLORS } from '@/components/charts/wait-event-chart';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';

/* ════════════════════════════════════════════════════════════ */
/*  Types                                                      */
/* ════════════════════════════════════════════════════════════ */

interface DashboardMetrics {
  global: {
    tps: number;
    active_backends: number;
    idle_backends: number;
    total_connections: number;
    cache_hit_ratio: number;
    tx_committed: number;
    tx_rolled_back: number;
    deadlocks: number;
    temp_bytes: number;
    db_size: number;
    checkpoints_req: number;
    checkpoints_timed: number;
    buffers_checkpoint: number;
    buffers_backend: number;
    wal_bytes: number;
    tup_returned?: number;
    tup_fetched?: number;
    tup_inserted?: number;
    tup_updated?: number;
    tup_deleted?: number;
    blks_hit?: number;
    blks_read?: number;
  };
  sessions: {
    active: number;
    idle: number;
    idleInTx: number;
    total: number;
    activeSessions: Array<{
      pid: number;
      usename: string;
      query: string;
      query_duration_ms: number | null;
      wait_event_type: string | null;
      wait_event: string | null;
      state?: string;
      client_addr?: string;
      application_name?: string;
    }>;
  };
  waitEvents: Array<{ wait_event_type: string; wait_event: string; count: number }>;
  topSql: Array<{
    queryid: number; query: string; calls: number;
    total_exec_time: number; mean_exec_time: number;
    shared_blks_hit: number; shared_blks_read: number; rows: number;
  }>;
  blockedSessions: Array<{
    pid: number; usename: string; waitEvent: string;
    waitDurationMs: number | null; blockingPid: number | null; query: string;
  }>;
  timestamp: string;
  slow_query_count?: number;
  replication_delay_sec?: number;
  vacuum_sessions?: number;
  uptime_sec?: number;
  long_active_sessions?: { under3s: number; s3to10: number; s10to15: number; over15s: number };
  long_waiting_sessions?: { under5s: number; s5to10: number; s10to60: number; over60s: number };
  pgssStatus?: 'enabled' | 'no_data' | 'not_installed';
}

interface HP {
  time: string;
  activeSessions: number; idleSessions: number; idleInTx: number;
  totalConnections: number; cacheHitRatio: number;
  slowQueries: number; lockWaits: number; deadlocks: number;
  tps: number; commits: number; rollbacks: number;
  dml: number; blksHit: number; blksRead: number;
  checkpoints: number; tempMB: number;
  replicationDelay: number; vacuumSessions: number;
  longActive_under3s: number; longActive_3to10: number;
  longActive_10to15: number; longActive_over15s: number;
  longWaiting_under5s: number; longWaiting_5to10: number;
  longWaiting_10to60: number; longWaiting_over60s: number;
}

interface RC { timestamp: number; txC: number; txR: number; dml: number; bH: number; bR: number }

/* ════════════════════════════════════════════════════════════ */
/*  Utilities                                                   */
/* ════════════════════════════════════════════════════════════ */

const fmtBytes = (b: number) => {
  if (b === 0) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${s[i]}`;
};
const fmtNum = (n: number) => {
  if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n/1e3).toFixed(1)}K`;
  return n.toLocaleString();
};
const fmtMs = (ms: number) => {
  if (ms < 1) return `${(ms*1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms/1000).toFixed(2)}s`;
};
const fmtUptime = (sec: number) => {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
};

/** WhaTap style: query text color by duration */
const durationColor = (ms: number | null) => {
  if (ms == null) return 'text-foreground/70';
  if (ms > 15000) return 'text-red-500';
  if (ms > 5000) return 'text-red-400';
  if (ms > 3000) return 'text-orange-400';
  if (ms > 1000) return 'text-amber-500';
  return 'text-foreground/70';
};

// Recharts dark theme constants
const GRID = 'hsl(215 25% 20%)';
const TICK = { fontSize: 9, fill: 'hsl(215 20% 50%)' };
const TT_STYLE = {
  backgroundColor: 'hsl(217 33% 15%)',
  border: '1px solid hsl(215 25% 25%)',
  borderRadius: '6px', fontSize: '11px', color: 'hsl(210 40% 98%)',
};

/* ════════════════════════════════════════════════════════════ */
/*  Main Component                                              */
/* ════════════════════════════════════════════════════════════ */

export default function DashboardPage() {
  const { selectedConnection, selectedConnectionId } = useSelectedDatabase();
  const [history, setHistory] = useState<HP[]>([]);
  const prevRef = useRef<RC | null>(null);
  const [activeTab, setActiveTab] = useState<'sessions' | 'locktree' | 'topsql'>('sessions');
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => { setHistory([]); prevRef.current = null; }, [selectedConnectionId]);

  const { data: metrics, isLoading, isError, error, refetch, isFetching } =
    useQuery<DashboardMetrics>({
      queryKey: ['pg-dashboard-metrics', selectedConnectionId],
      queryFn: async () => {
        const r = await fetch(`/api/dashboard/metrics?connection_id=${selectedConnectionId}`);
        if (!r.ok) { const b = await r.json().catch(() => ({})); const e = new Error(b.error||'fail'); (e as any).code = b.code; throw e; }
        const json = await r.json();
        console.log('[Instance] topSql:', json.data?.topSql?.length, 'pgssStatus:', json.data?.pgssStatus);
        return json.data;
      },
      enabled: !!selectedConnectionId && !isPaused,
      refetchInterval: (q) => {
        if (isPaused) return false;
        if (q.state.error && (q.state.error as any).code === 'CONNECTION_ERROR') return false;
        return 5000;
      },
      retry: (c, e) => (e as any).code === 'CONNECTION_ERROR' ? false : c < 2,
    });

  // ── Accumulate history ──
  useEffect(() => {
    if (!metrics) return;
    const now = Date.now();
    const time = new Date(metrics.timestamp).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const g = metrics.global;
    const p = prevRef.current;
    const dt = p ? Math.max(1, (now - p.timestamp) / 1000) : 0;
    const dml = (g.tup_inserted||0)+(g.tup_updated||0)+(g.tup_deleted||0);
    const rate = (cur: number, prev: number) => p ? Math.max(0, Math.round((cur - prev) / dt)) : 0;

    const pt: HP = {
      time,
      activeSessions: metrics.sessions.active,
      idleSessions: metrics.sessions.idle,
      idleInTx: metrics.sessions.idleInTx,
      totalConnections: g.total_connections,
      cacheHitRatio: g.cache_hit_ratio,
      slowQueries: metrics.slow_query_count || 0,
      lockWaits: metrics.blockedSessions.length,
      deadlocks: g.deadlocks,
      checkpoints: g.checkpoints_timed + g.checkpoints_req,
      tempMB: Math.round(g.temp_bytes / (1024*1024)),
      replicationDelay: metrics.replication_delay_sec || 0,
      vacuumSessions: metrics.vacuum_sessions || 0,
      longActive_under3s: metrics.long_active_sessions?.under3s || 0,
      longActive_3to10: metrics.long_active_sessions?.s3to10 || 0,
      longActive_10to15: metrics.long_active_sessions?.s10to15 || 0,
      longActive_over15s: metrics.long_active_sessions?.over15s || 0,
      longWaiting_under5s: metrics.long_waiting_sessions?.under5s || 0,
      longWaiting_5to10: metrics.long_waiting_sessions?.s5to10 || 0,
      longWaiting_10to60: metrics.long_waiting_sessions?.s10to60 || 0,
      longWaiting_over60s: metrics.long_waiting_sessions?.over60s || 0,
      tps: rate(g.tx_committed+g.tx_rolled_back, (p?.txC||0)+(p?.txR||0)),
      commits: rate(g.tx_committed, p?.txC||0),
      rollbacks: rate(g.tx_rolled_back, p?.txR||0),
      dml: rate(dml, p?.dml||0),
      blksHit: rate(g.blks_hit||0, p?.bH||0),
      blksRead: rate(g.blks_read||0, p?.bR||0),
    };
    prevRef.current = { timestamp: now, txC: g.tx_committed, txR: g.tx_rolled_back, dml, bH: g.blks_hit||0, bR: g.blks_read||0 };
    if (p) setHistory(h => [...h.slice(-59), pt]);
  }, [metrics?.timestamp]);

  const waitClassData = useMemo(() => {
    if (!metrics?.waitEvents) return [];
    const m: Record<string, number> = {};
    metrics.waitEvents.forEach(e => { m[e.wait_event_type||'Other'] = (m[e.wait_event_type||'Other']||0)+Number(e.count); });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([n,c])=>({name:n,count:c,fill:WAIT_COLORS[n]||'#475569'}));
  }, [metrics?.waitEvents]);

  const topSqlChart = useMemo(() => {
    if (!metrics?.topSql) return [];
    return metrics.topSql.slice(0,5).map((s,i) => ({ name:`SQL-${i+1}`, elapsed: Math.round(s.mean_exec_time*100)/100 }));
  }, [metrics?.topSql]);

  const g = metrics?.global;
  const s = metrics?.sessions;
  const lv = history.length > 0 ? history[history.length - 1] : null;

  if (!selectedConnection) return (
    <div className="flex flex-col items-center justify-center py-20">
      <Database className="h-16 w-16 text-muted-foreground/30 mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-2">데이터베이스를 연결해주세요</h3>
      <p className="text-muted-foreground text-sm text-center max-w-md">상단 헤더의 DB선택에서 PostgreSQL 데이터베이스를 선택하거나, DB 연결 관리에서 새 연결을 추가하세요.</p>
    </div>
  );

  if (isError) return (
    <div className="flex flex-col items-center justify-center py-20">
      <AlertTriangle className="h-16 w-16 text-red-400 mb-4" />
      <h3 className="text-lg font-semibold mb-2">메트릭 조회 실패</h3>
      <p className="text-muted-foreground text-sm mb-4">{(error as any)?.code==='CONNECTION_ERROR'?'대상 데이터베이스에 연결할 수 없습니다.':error?.message}</p>
      <Button variant="outline" size="sm" onClick={()=>refetch()}><RefreshCw className="h-4 w-4 mr-1.5"/>다시 시도</Button>
    </div>
  );

  return (
    <div className="space-y-2">
      {/* ── Live Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={()=>setIsPaused(!isPaused)} className="flex items-center justify-center w-7 h-7 rounded bg-muted hover:bg-muted/80 transition-colors" title={isPaused?'재개':'일시정지'}>
              {isPaused?<Play className="h-3.5 w-3.5 text-foreground/70"/>:<Pause className="h-3.5 w-3.5 text-foreground/70"/>}
            </button>
            {!isPaused ? <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white text-[10px] px-2 py-0.5 font-bold animate-pulse">LIVE</Badge>
              : <Badge variant="outline" className="text-[10px] px-2 py-0.5 text-muted-foreground">PAUSED</Badge>}
          </div>
          {metrics?.timestamp && <span className="text-xs text-muted-foreground font-mono">{new Date(metrics.timestamp).toLocaleTimeString('ko-KR')}</span>}
          <div className="h-4 w-px bg-border hidden sm:block"/>
          <span className="text-xs text-muted-foreground font-medium hidden sm:inline">{selectedConnection.name}</span>
          <span className="text-[10px] text-muted-foreground/70 hidden md:inline">{selectedConnection.host}:{selectedConnection.port}/{selectedConnection.database}</span>
        </div>
        <div className="flex items-center gap-3">
          {s && <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Total</span><span className="font-bold text-foreground">{s.total}</span>
            <span className="text-emerald-500">Active</span><span className="font-bold text-emerald-500">{s.active}</span>
            <span className="text-muted-foreground">Inactive</span><span className="font-bold text-muted-foreground">{s.total-s.active}</span>
          </div>}
          <Button variant="ghost" size="sm" onClick={()=>refetch()} disabled={isFetching} className="h-7 px-2">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching?'animate-spin':''}`}/>
          </Button>
        </div>
      </div>

      {/* ── Alert ── */}
      {metrics?.blockedSessions && metrics.blockedSessions.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/>
          <span className="text-xs text-red-400 font-medium">{metrics.blockedSessions.length}개 블로킹 세션 감지</span>
          <Link href="/monitoring/locks" className="ml-auto text-xs text-red-400 hover:text-red-300 flex items-center gap-0.5">상세 <ArrowUpRight className="h-3 w-3"/></Link>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* Row 1: System Overview                                   */}
      {/* ════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        <WCard title="Cache Hit Ratio" val={isLoading?'-':`${g?.cache_hit_ratio??0}%`} vc={g&&g.cache_hit_ratio>=99?'text-emerald-400':g&&g.cache_hit_ratio>=95?'text-amber-400':'text-red-400'}>
          <MiniTimeChart data={history} series={[{key:'cacheHitRatio',color:'#6366f1',name:'Hit%'}]} height={100} yFormatter={v=>`${v}%`}/>
        </WCard>
        <WCard title="TPS" val={lv?fmtNum(lv.tps):'-'} vc="text-emerald-400">
          <MiniTimeChart data={history} series={[{key:'tps',color:'#10b981',name:'TPS'}]} height={100}/>
        </WCard>
        <WCard title="Connections" val={isLoading?'-':String(g?.total_connections??0)} link="/monitoring/sessions">
          <MiniTimeChart data={history} series={[{key:'totalConnections',color:'#64748b',name:'Total'},{key:'idleInTx',color:'#f59e0b',name:'Idle in Tx'}]} height={100}/>
        </WCard>
        {/* DB Info + Uptime - text card */}
        <div className="bg-card rounded border border-border p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-muted-foreground">Database Info</span>
            {metrics?.uptime_sec != null && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3"/>{fmtUptime(metrics.uptime_sec)}</span>}
          </div>
          <div className="space-y-1.5 flex-1">
            <IR icon={<HardDrive className="h-3 w-3"/>} label="Size" value={isLoading?'-':fmtBytes(g?.db_size??0)} bold/>
            <IR icon={<Server className="h-3 w-3"/>} label="Host" value={`${selectedConnection.host}:${selectedConnection.port}`} mono/>
            <IR icon={<Shield className="h-3 w-3"/>} label="Version" value={selectedConnection.pgVersion||'-'}/>
            <IR icon={<Cpu className="h-3 w-3"/>} label="Deadlocks" value={isLoading?'-':String(g?.deadlocks??0)} bold/>
          </div>
          <div className="flex gap-1 pt-1.5 mt-1 border-t border-border/50">
            {selectedConnection.pgStatStatementsEnabled
              ? <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-emerald-500/30 text-emerald-400">pg_stat_statements ✓</Badge>
              : <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-amber-500/30 text-amber-400">pg_stat_statements ✗</Badge>}
          </div>
        </div>
        {/* Temp + Checkpoints combined */}
        <div className="bg-card rounded border border-border p-3">
          <span className="text-[11px] font-medium text-muted-foreground">Temp / Checkpoints</span>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div><div className="text-[10px] text-muted-foreground/70">Temp Usage</div><div className="text-sm font-bold text-foreground">{isLoading?'-':fmtBytes(g?.temp_bytes??0)}</div></div>
            <div><div className="text-[10px] text-muted-foreground/70">Checkpoints</div><div className="text-sm font-bold text-foreground">{isLoading?'-':String((g?.checkpoints_timed??0)+(g?.checkpoints_req??0))}</div></div>
            <div><div className="text-[10px] text-muted-foreground/70">Timed</div><div className="text-xs font-semibold text-foreground/70">{g?.checkpoints_timed??0}</div></div>
            <div><div className="text-[10px] text-muted-foreground/70">Requested</div><div className="text-xs font-semibold text-foreground/70">{g?.checkpoints_req??0}</div></div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* Row 2: DB Performance (WhaTap default)                   */}
      {/* ════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        <WCard title="Active Sessions" val={isLoading?'-':String(s?.active??0)} vc="text-blue-400" link="/monitoring/sessions">
          <MiniTimeChart data={history} series={[{key:'activeSessions',color:'#3b82f6',name:'Active'}]} height={100}/>
        </WCard>
        <WCard title="DML Tuples" val={lv?`${fmtNum(lv.dml)}/s`:'-'} vc="text-purple-400">
          <MiniTimeChart data={history} series={[{key:'dml',color:'#8b5cf6',name:'DML/s'}]} height={100}/>
        </WCard>
        <WCard title="Slow Query" val={isLoading?'-':String(metrics?.slow_query_count??0)} vc={(metrics?.slow_query_count??0)>0?'text-amber-400':'text-foreground/50'}>
          <MiniTimeChart data={history} series={[{key:'slowQueries',color:'#f59e0b',name:'Slow'}]} height={100}/>
        </WCard>
        <WCard title="Logical I/O" val={lv?`${fmtNum(lv.blksHit)}/s`:'-'} vc="text-blue-400" sub={lv&&lv.blksRead>0?`Read: ${fmtNum(lv.blksRead)}/s`:undefined} sc="text-red-400">
          <MiniTimeChart data={history} series={[{key:'blksHit',color:'#3b82f6',name:'Hit/s'},{key:'blksRead',color:'#ef4444',name:'Read/s'}]} height={100}/>
        </WCard>
        {/* SQL Elapse Map */}
        <div className="bg-card rounded border border-border p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-muted-foreground">SQL Elapse Map</span>
            <Link href="/monitoring/top-sql" className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5">상세<ArrowUpRight className="h-2.5 w-2.5"/></Link>
          </div>
          {topSqlChart.length===0
            ? <div className="flex items-center justify-center h-[100px] text-[11px] text-muted-foreground">SQL 데이터 없음</div>
            : <ResponsiveContainer width="100%" height={100}><BarChart data={topSqlChart} margin={{top:0,right:5,left:-10,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
                <XAxis dataKey="name" tick={TICK} tickLine={false} axisLine={false}/>
                <YAxis tick={TICK} tickLine={false} axisLine={false} width={40}/>
                <Tooltip contentStyle={TT_STYLE} formatter={(v:any)=>[fmtMs(Number(v)),'Avg']}/>
                <Bar dataKey="elapsed" radius={[3,3,0,0]} barSize={16}>
                  {topSqlChart.map((_,i)=><Cell key={i} fill={['#3b82f6','#6366f1','#8b5cf6','#a855f7','#c084fc'][i]}/>)}
                </Bar>
              </BarChart></ResponsiveContainer>}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* Row 3: DB Resources (WhaTap default)                     */}
      {/* ════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        <WCard title="Lock Wait Sessions" val={isLoading?'-':String(metrics?.blockedSessions.length??0)} vc={(metrics?.blockedSessions.length??0)>0?'text-red-400':'text-foreground/50'} link="/monitoring/locks">
          <MiniTimeChart data={history} series={[{key:'lockWaits',color:'#ef4444',name:'Lock Waits'}]} height={100}/>
        </WCard>
        <WCard title="Commits" val={lv?`${fmtNum(lv.commits)}/s`:'-'} vc="text-emerald-400" sub={lv&&lv.rollbacks>0?`Rollback: ${lv.rollbacks}/s`:undefined} sc="text-red-400">
          <MiniTimeChart data={history} series={[{key:'commits',color:'#10b981',name:'Commits/s'},{key:'rollbacks',color:'#ef4444',name:'Rollbacks/s'}]} height={100}/>
        </WCard>
        <WCard title="Replication Delay(Sec)" val={isLoading?'-':`${(metrics?.replication_delay_sec??0).toFixed(1)}s`} vc={(metrics?.replication_delay_sec??0)>10?'text-red-400':(metrics?.replication_delay_sec??0)>1?'text-amber-400':'text-emerald-400'}>
          <MiniTimeChart data={history} series={[{key:'replicationDelay',color:'#06b6d4',name:'Delay(s)'}]} height={100} yFormatter={v=>`${v.toFixed(1)}s`}/>
        </WCard>
        <WCard title="Physical I/O" val={lv?`${fmtNum(lv.blksRead)}/s`:'-'} vc="text-orange-400">
          <MiniTimeChart data={history} series={[{key:'blksRead',color:'#f97316',name:'Blks Read/s'}]} height={100}/>
        </WCard>
        {/* Wait Class - horizontal bar */}
        <div className="bg-card rounded border border-border p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-muted-foreground">Wait Class</span>
            <Link href="/monitoring/wait-events" className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5">상세<ArrowUpRight className="h-2.5 w-2.5"/></Link>
          </div>
          {waitClassData.length===0
            ? <div className="flex items-center justify-center h-[100px] text-[11px] text-muted-foreground">대기 이벤트 없음</div>
            : <ResponsiveContainer width="100%" height={100}><BarChart data={waitClassData} layout="vertical" margin={{top:0,right:5,left:0,bottom:0}}>
                <XAxis type="number" tick={TICK} tickLine={false} axisLine={false}/>
                <YAxis type="category" dataKey="name" tick={TICK} tickLine={false} axisLine={false} width={50}/>
                <Tooltip contentStyle={TT_STYLE} formatter={(v:any)=>[`${v}`,'']}/>
                <Bar dataKey="count" radius={[0,3,3,0]} barSize={10}>
                  {waitClassData.map((e,i)=><Cell key={i} fill={e.fill}/>)}
                </Bar>
              </BarChart></ResponsiveContainer>}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* Row 4: Extended Monitoring                                */}
      {/* ════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        <WCard title="Long Active Session Count" val={isLoading?'-':String((metrics?.long_active_sessions?.s3to10??0)+(metrics?.long_active_sessions?.s10to15??0)+(metrics?.long_active_sessions?.over15s??0))}
          vc={(metrics?.long_active_sessions?.over15s??0)>0?'text-red-400':(metrics?.long_active_sessions?.s10to15??0)>0?'text-orange-400':'text-foreground/50'}>
          <MiniTimeChart data={history} series={[
            {key:'longActive_under3s',color:'#3b82f6',name:'<3s'},
            {key:'longActive_3to10',color:'#10b981',name:'3-10s'},
            {key:'longActive_10to15',color:'#f97316',name:'10-15s'},
            {key:'longActive_over15s',color:'#ef4444',name:'>15s'},
          ]} height={100} stacked/>
        </WCard>
        <WCard title="Long Waiting Session Count" val={isLoading?'-':String((metrics?.long_waiting_sessions?.s5to10??0)+(metrics?.long_waiting_sessions?.s10to60??0)+(metrics?.long_waiting_sessions?.over60s??0))}
          vc={(metrics?.long_waiting_sessions?.over60s??0)>0?'text-red-400':'text-foreground/50'}>
          <MiniTimeChart data={history} series={[
            {key:'longWaiting_under5s',color:'#3b82f6',name:'<5s'},
            {key:'longWaiting_5to10',color:'#10b981',name:'5-10s'},
            {key:'longWaiting_10to60',color:'#f97316',name:'10-60s'},
            {key:'longWaiting_over60s',color:'#ef4444',name:'>60s'},
          ]} height={100} stacked/>
        </WCard>
        <WCard title="Deadlocks" val={isLoading?'-':String(g?.deadlocks??0)} vc={(g?.deadlocks??0)>0?'text-red-400':'text-emerald-400'}>
          <MiniTimeChart data={history} series={[{key:'deadlocks',color:'#e11d48',name:'Deadlocks'}]} height={100}/>
        </WCard>
        <WCard title="Vacuum Sessions" val={isLoading?'-':String(metrics?.vacuum_sessions??0)} vc={(metrics?.vacuum_sessions??0)>3?'text-amber-400':'text-foreground/50'} link="/monitoring/vacuum">
          <MiniTimeChart data={history} series={[{key:'vacuumSessions',color:'#14b8a6',name:'Vacuum'}]} height={100}/>
        </WCard>
        <WCard title="Idle in Transaction" val={isLoading?'-':String(s?.idleInTx??0)} vc={(s?.idleInTx??0)>0?'text-amber-400':'text-foreground/50'}>
          <MiniTimeChart data={history} series={[{key:'idleInTx',color:'#eab308',name:'Idle in Tx'}]} height={100}/>
        </WCard>
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* Bottom: Tabbed Table                                     */}
      {/* ════════════════════════════════════════════════════════ */}
      <div className="bg-card rounded border border-border">
        <div className="flex border-b border-border">
          <TBtn active={activeTab==='sessions'} onClick={()=>setActiveTab('sessions')}>
            액티브 세션{s&&s.active>0&&<CBadge n={s.active}/>}
          </TBtn>
          <TBtn active={activeTab==='locktree'} onClick={()=>setActiveTab('locktree')}>
            락 트리{metrics?.blockedSessions&&metrics.blockedSessions.length>0&&<CBadge n={metrics.blockedSessions.length} c="bg-red-500"/>}
          </TBtn>
          <TBtn active={activeTab==='topsql'} onClick={()=>setActiveTab('topsql')}>Top SQL</TBtn>
        </div>
        <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
          {activeTab==='sessions' && <SessionTable sessions={s?.activeSessions??[]} loading={isLoading}/>}
          {activeTab==='locktree' && <LockTreeTable sessions={metrics?.blockedSessions??[]} loading={isLoading}/>}
          {activeTab==='topsql' && <TopSqlTable data={metrics?.topSql??[]} loading={isLoading} pgssStatus={metrics?.pgssStatus}/>}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  Widget Card                                                 */
/* ════════════════════════════════════════════════════════════ */

function WCard({title,val,vc='text-foreground',sub,sc='text-muted-foreground',link,children}:{
  title:string;val?:string;vc?:string;sub?:string;sc?:string;link?:string;children:React.ReactNode;
}) {
  return (
    <div className="bg-card rounded border border-border p-3 group">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] font-medium text-muted-foreground truncate">{title}</span>
        <div className="flex items-center gap-1.5">
          {val && <span className={`text-sm font-bold tabular-nums ${vc}`}>{val}</span>}
          {link && <Link href={link} className="text-muted-foreground/30 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100"><Maximize2 className="h-3 w-3"/></Link>}
        </div>
      </div>
      {sub && <div className="flex justify-end -mt-0.5 mb-0.5"><span className={`text-[10px] ${sc}`}>{sub}</span></div>}
      {children}
    </div>
  );
}

function IR({icon,label,value,bold,mono}:{icon:React.ReactNode;label:string;value:string;bold?:boolean;mono?:boolean}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">{icon}{label}</span>
      <span className={cn('text-xs text-foreground truncate max-w-[110px]',bold&&'font-bold',mono&&'font-mono text-[10px]')}>{value}</span>
    </div>
  );
}

function TBtn({active,onClick,children}:{active:boolean;onClick:()=>void;children:React.ReactNode}) {
  return <button onClick={onClick} className={cn('px-4 py-2.5 text-xs font-medium transition-colors flex items-center gap-1.5',active?'text-blue-400 border-b-2 border-blue-400':'text-muted-foreground hover:text-foreground')}>{children}</button>;
}

function CBadge({n,c='bg-blue-500'}:{n:number;c?:string}) {
  return <span className={`${c} text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none`}>{n}</span>;
}

/* ════════════════════════════════════════════════════════════ */
/*  Active Sessions Table (WhaTap style color coding)           */
/* ════════════════════════════════════════════════════════════ */

function SessionTable({sessions,loading}:{sessions:DashboardMetrics['sessions']['activeSessions'];loading:boolean}) {
  if (loading) return <TSkel/>;
  if (!sessions.length) return <div className="text-center py-8 text-xs text-muted-foreground">실행 중인 쿼리 없음</div>;
  return (
    <table className="w-full text-xs">
      <thead><tr className="bg-muted/30 border-b border-border sticky top-0">
        {['PID','User','Application','Client','Runtime','State','Wait Event','Query'].map(h=>
          <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}
      </tr></thead>
      <tbody>
        {sessions.map(sess => {
          const dc = durationColor(sess.query_duration_ms);
          return (
            <tr key={sess.pid} className="border-b border-border/30 hover:bg-muted/20">
              <td className="px-3 py-1.5 font-mono text-blue-400">{sess.pid}</td>
              <td className="px-3 py-1.5">{sess.usename}</td>
              <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[100px]">{sess.application_name||'-'}</td>
              <td className="px-3 py-1.5 font-mono text-muted-foreground">{sess.client_addr||'-'}</td>
              <td className="px-3 py-1.5">
                {sess.query_duration_ms!=null && <span className={`font-semibold ${dc}`}>{(sess.query_duration_ms/1000).toFixed(1)}s</span>}
              </td>
              <td className="px-3 py-1.5">
                <span className={cn('inline-block px-1.5 py-0.5 rounded text-[10px] font-medium',
                  sess.state==='active'?'bg-emerald-500/20 text-emerald-400':'bg-muted text-muted-foreground'
                )}>{sess.state||'active'}</span>
              </td>
              <td className="px-3 py-1.5">{sess.wait_event?<span className="text-muted-foreground">{sess.wait_event_type}:{sess.wait_event}</span>:<span className="text-emerald-400">CPU</span>}</td>
              <td className={`px-3 py-1.5 font-mono truncate max-w-[400px] ${dc}`} title={sess.query}>{sess.query?.replace(/\s+/g,' ').substring(0,120)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  Lock Tree Table (WhaTap style)                              */
/* ════════════════════════════════════════════════════════════ */

function LockTreeTable({sessions,loading}:{sessions:DashboardMetrics['blockedSessions'];loading:boolean}) {
  if (loading) return <TSkel/>;
  if (!sessions.length) return <div className="text-center py-8 text-xs text-muted-foreground">락 트리 없음</div>;
  return (
    <table className="w-full text-xs">
      <thead><tr className="bg-muted/30 border-b border-border sticky top-0">
        {['Blocked PID','User','Blocker PID','Lock Type','Duration','Query'].map(h=>
          <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}
      </tr></thead>
      <tbody>
        {sessions.map((s,i) => (
          <tr key={i} className="border-b border-border/30 hover:bg-red-500/5">
            <td className="px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-red-400 font-mono font-semibold">{s.pid}</span>
                <span className="text-[10px] text-muted-foreground/50">←</span>
                <span className="text-amber-400 font-mono text-[10px]">blocked by {s.blockingPid}</span>
              </div>
            </td>
            <td className="px-3 py-1.5">{s.usename}</td>
            <td className="px-3 py-1.5 font-mono text-amber-400 font-semibold">{s.blockingPid}</td>
            <td className="px-3 py-1.5"><span className="bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded text-[10px] font-medium">{s.waitEvent}</span></td>
            <td className="px-3 py-1.5">{s.waitDurationMs!=null&&<span className="text-red-400 font-semibold">{(s.waitDurationMs/1000).toFixed(1)}s</span>}</td>
            <td className="px-3 py-1.5 font-mono text-muted-foreground truncate max-w-[400px]">{s.query}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  Top SQL Table                                               */
/* ════════════════════════════════════════════════════════════ */

function TopSqlTable({data,loading,pgssStatus}:{data:DashboardMetrics['topSql'];loading:boolean;pgssStatus?:DashboardMetrics['pgssStatus']}) {
  if (loading) return <TSkel/>;
  if (!data.length) {
    const messages: Record<string, { title: string; steps: string[] }> = {
      not_installed: {
        title: 'pg_stat_statements 확장이 설치되어 있지 않습니다',
        steps: [
          '1. postgresql.conf에 추가: shared_preload_libraries = \'pg_stat_statements\'',
          '2. PostgreSQL 서비스 재시작 (restart, reload 아님)',
          '3. SQL 실행: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;',
        ],
      },
      no_data: {
        title: 'pg_stat_statements에 수집된 데이터가 없습니다',
        steps: [
          '• shared_preload_libraries에 pg_stat_statements가 포함되어 있는지 확인',
          '• PostgreSQL을 완전히 재시작(restart)했는지 확인 (reload로는 부족)',
          '• 재시작 후 쿼리를 실행해야 데이터가 수집됩니다',
          '• SELECT * FROM pg_stat_statements LIMIT 1; 로 확인',
        ],
      },
    };
    const status = pgssStatus || 'not_installed';
    const msg = messages[status] || messages.not_installed;
    return (
      <div className="text-center py-8 space-y-2">
        <p className="text-xs text-muted-foreground font-medium">{msg.title}</p>
        <div className="inline-block text-left bg-muted/30 rounded px-3 py-2 font-mono text-[11px] text-muted-foreground/70 space-y-0.5">
          {msg.steps.map((s, i) => <p key={i}>{s}</p>)}
        </div>
      </div>
    );
  }
  return (
    <table className="w-full text-xs">
      <thead><tr className="bg-muted/30 border-b border-border sticky top-0">
        {['#','Query','Calls','Total Time','Avg Time','Rows','Hit Ratio'].map(h=>
          <th key={h} className={cn('px-3 py-2 font-medium text-muted-foreground whitespace-nowrap',h==='#'?'text-center w-8':'text-left',['Calls','Total Time','Avg Time','Rows','Hit Ratio'].includes(h)&&'text-right')}>{h}</th>)}
      </tr></thead>
      <tbody>
        {data.map((sql,i) => {
          const tot = sql.shared_blks_hit+sql.shared_blks_read;
          const hr = tot>0?((sql.shared_blks_hit/tot)*100).toFixed(1):'-';
          return (
            <tr key={sql.queryid} className="border-b border-border/30 hover:bg-muted/20">
              <td className="text-center px-3 py-1.5 font-semibold text-muted-foreground">{i+1}</td>
              <td className="px-3 py-1.5"><Link href={`/analysis/sql/${sql.queryid}`} className="font-mono text-blue-400 hover:text-blue-300 truncate block max-w-[400px] no-underline">{sql.query?.replace(/\s+/g,' ').substring(0,100)}</Link></td>
              <td className="text-right px-3 py-1.5 font-mono">{fmtNum(sql.calls)}</td>
              <td className="text-right px-3 py-1.5 font-mono">{fmtMs(sql.total_exec_time)}</td>
              <td className="text-right px-3 py-1.5"><span className={sql.mean_exec_time>1000?'text-red-400 font-semibold':sql.mean_exec_time>100?'text-amber-400 font-semibold':'text-foreground/70'}>{fmtMs(sql.mean_exec_time)}</span></td>
              <td className="text-right px-3 py-1.5 font-mono">{fmtNum(sql.rows)}</td>
              <td className="text-right px-3 py-1.5"><span className={Number(hr)>=99?'text-emerald-400':Number(hr)>=90?'text-amber-400':'text-red-400'}>{hr==='-'?'-':`${hr}%`}</span></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TSkel() {
  return <div className="p-4 space-y-2">{[...Array(3)].map((_,i)=><div key={i} className="h-7 bg-muted/50 rounded animate-pulse"/>)}</div>;
}
