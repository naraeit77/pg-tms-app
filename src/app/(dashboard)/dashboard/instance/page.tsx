'use client';

/**
 * Instance Monitoring Dashboard - WhaTap Style
 * https://docs.whatap.io/postgresql/instance-monitoring
 *
 * Layout (4 rows of 4-5 metric cards + SQL Elapse Map + tabbed bottom):
 *   Row 1: Active Sessions | Connection 사용 | Transaction 수 | DML별 실행 row수
 *   Row 2: Lock 대기 수 | Index Hit Ratio | Temp 사용 | Logical I/O
 *   Row 3: Physical I/O | Buffer Hit Rate(%) | Vacuum 수행 수 | Checkpoint
 *   Row 4: Long Active Sessions | Idle in Transaction | Deadlocks | Wait Event | SQL Elapse Map
 *   Bottom: [액티브 세션] [락 트리] [Top SQL]
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Database, HardDrive, Server, Shield, Cpu,
  RefreshCw, ArrowUpRight, Pause, Play, Maximize2, Clock,
  Info, Copy, Check,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { MiniTimeChart } from '@/components/charts/mini-time-chart';
import { SqlElapseMap, SqlElapseLegend, getElapsedGrade, formatElapsed, type SqlElapsePoint } from '@/components/charts/sql-elapse-map';
import { SqlDetailDialog } from '@/components/shared/sql-detail-dialog';
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
      query_id?: string | null;
    }>;
  };
  waitEvents: Array<{ wait_event_type: string; wait_event: string; count: number }>;
  topSql: Array<{
    queryid: string; query: string; calls: number;
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
  long_active_sessions?: { under3s: number; s3to10: number; s10to15: number; over15s: number };
  long_waiting_sessions?: { under5s: number; s5to10: number; s10to60: number; over60s: number };
  uptime_sec?: number;
  pgssStatus?: 'enabled' | 'no_data' | 'not_installed';
}

/** History point for time-series charts */
interface HP {
  time: string;
  activeSessions: number; idleSessions: number; idleInTx: number;
  totalConnections: number; cacheHitRatio: number;
  slowQueries: number; lockWaits: number; deadlocks: number;
  tps: number; commits: number; rollbacks: number;
  dml: number; blksHit: number; blksRead: number;
  checkpoints: number; tempBytesPerSec: number;
  replicationDelay: number; vacuumSessions: number;
  longActive_under3s: number; longActive_3to10: number;
  longActive_10to15: number; longActive_over15s: number;
  longWaiting_under5s: number; longWaiting_5to10: number;
  longWaiting_10to60: number; longWaiting_over60s: number;
  /** Buffer hit rate = blksHit / (blksHit + blksRead) * 100 */
  bufferHitRate: number;
}

/** Raw cumulative counters for delta calculation */
interface RC {
  timestamp: number;
  txC: number; txR: number; dml: number;
  bH: number; bR: number; tB: number;
  ckpt: number;
}

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
const GRID = 'hsl(var(--chart-grid))';
const TICK = { fontSize: 9, fill: 'hsl(var(--chart-tick))' };
const TT_STYLE: React.CSSProperties = {
  backgroundColor: 'hsl(var(--chart-tooltip-bg))',
  border: '1px solid hsl(var(--chart-tooltip-border))',
  borderRadius: '6px', fontSize: '11px', color: 'hsl(var(--chart-tooltip-text))',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
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
  // SQL Elapse Map data accumulator (max 300 points ≈ 5 minutes)
  const [elapseData, setElapseData] = useState<SqlElapsePoint[]>([]);
  const [selectedElapsePoints, setSelectedElapsePoints] = useState<SqlElapsePoint[]>([]);

  useEffect(() => { setHistory([]); prevRef.current = null; setElapseData([]); }, [selectedConnectionId]);

  const { data: metrics, isLoading, isError, error, refetch, isFetching } =
    useQuery<DashboardMetrics>({
      queryKey: ['pg-dashboard-metrics', selectedConnectionId],
      queryFn: async () => {
        const r = await fetch(`/api/dashboard/metrics?connection_id=${selectedConnectionId}`);
        if (!r.ok) { const b = await r.json().catch(() => ({})); const e = new Error(b.error||'fail'); (e as any).code = b.code; throw e; }
        const json = await r.json();
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
    const bH = rate(g.blks_hit||0, p?.bH||0);
    const bR = rate(g.blks_read||0, p?.bR||0);

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
      checkpoints: rate((g.checkpoints_timed + g.checkpoints_req), p?.ckpt || 0),
      tempBytesPerSec: rate(g.temp_bytes, p?.tB||0),
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
      blksHit: bH,
      blksRead: bR,
      bufferHitRate: (bH + bR) > 0 ? (bH / (bH + bR)) * 100 : 100,
    };
    prevRef.current = {
      timestamp: now, txC: g.tx_committed, txR: g.tx_rolled_back,
      dml, bH: g.blks_hit||0, bR: g.blks_read||0, tB: g.temp_bytes,
      ckpt: g.checkpoints_timed + g.checkpoints_req,
    };
    if (p) setHistory(h => [...h.slice(-59), pt]);

    // ── Accumulate SQL Elapse Map points ──
    const newPoints: SqlElapsePoint[] = [];

    // 1) 현재 활성 세션의 실행 시간 (실시간 데이터)
    if (metrics.sessions.activeSessions.length > 0) {
      metrics.sessions.activeSessions.forEach((s, i) => {
        if (s.query_duration_ms != null) {
          newPoints.push({
            time,
            timeNum: now + i, // 각 포인트 X좌표 미세 분리
            elapsed: Math.max(s.query_duration_ms, 1) / 1000,
            pid: s.pid,
            query: s.query,
            user: s.usename,
            queryid: s.query_id ?? undefined,
          });
        }
      });
    }

    // 2) Top SQL의 평균 실행시간 (활성 세션이 없어도 scatter 포인트 생성)
    if (newPoints.length === 0 && metrics.topSql && metrics.topSql.length > 0) {
      metrics.topSql.slice(0, 5).forEach((sql, i) => {
        if (sql.mean_exec_time > 0) {
          newPoints.push({
            time,
            timeNum: now + i,
            elapsed: sql.mean_exec_time / 1000,
            query: sql.query?.substring(0, 100),
            queryid: sql.queryid,
          });
        }
      });
    }

    if (newPoints.length > 0) {
      setElapseData(prev => [...prev.slice(-300 + newPoints.length), ...newPoints]);
    }
  }, [metrics?.timestamp]);

  // Derived data
  const s = metrics?.sessions;
  const g = metrics?.global;
  const lv = history.length > 0 ? history[history.length - 1] : null;

  const waitClassData = useMemo(() => {
    if (!metrics?.waitEvents) return [];
    const grouped = new Map<string, number>();
    metrics.waitEvents.forEach(e => {
      grouped.set(e.wait_event_type, (grouped.get(e.wait_event_type) || 0) + e.count);
    });
    return Array.from(grouped.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({
        name: name.length > 8 ? name.substring(0, 7) + '…' : name,
        count,
        fill: (WAIT_COLORS as Record<string, string>)[name] || '#6b7280',
      }));
  }, [metrics?.waitEvents]);

  if (!selectedConnection) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <Database className="h-12 w-12 text-muted-foreground/30"/>
        <p className="text-sm text-muted-foreground">모니터링할 데이터베이스를 선택하세요</p>
      </div>
    );
  }

  if (isError) {
    const code = (error as any)?.code;
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <div className="text-red-400 text-sm font-medium">{code === 'CONNECTION_ERROR' ? '데이터베이스 연결 실패' : '데이터 조회 중 오류 발생'}</div>
        <p className="text-xs text-muted-foreground max-w-md text-center">{(error as Error).message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>재시도</Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2">
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={()=>setIsPaused(p=>!p)} className="h-7 px-2 gap-1">
            {isPaused ? <Play className="h-3 w-3"/> : <Pause className="h-3 w-3"/>}
          </Button>
          {isPaused
            ? <Badge variant="outline" className="text-[10px] px-2 py-0.5 text-muted-foreground">PAUSED</Badge>
            : <Badge variant="outline" className="text-[10px] px-2 py-0.5 text-emerald-400 border-emerald-500/30">LIVE</Badge>}
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
      {/* Row 1: 액티브 세션 수 | Connection 사용 | Transaction 수 | DML별 실행 row수 */}
      {/* ════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        <WCard title="액티브 세션 수" val={isLoading?'-':String(s?.active??0)} vc="text-blue-400" link="/monitoring/sessions">
          <MiniTimeChart data={history} series={[
            {key:'activeSessions',color:'#3b82f6',name:'Active'},
            {key:'idleSessions',color:'#64748b',name:'Idle'},
            {key:'idleInTx',color:'#f59e0b',name:'Idle in Tx'},
          ]} height={100}/>
        </WCard>
        <WCard title="Connection 사용" val={isLoading?'-':String(g?.total_connections??0)} link="/monitoring/sessions">
          <MiniTimeChart data={history} series={[
            {key:'totalConnections',color:'#3b82f6',name:'Total'},
            {key:'activeSessions',color:'#10b981',name:'Active'},
            {key:'idleInTx',color:'#f59e0b',name:'Idle in Tx'},
          ]} height={100}/>
        </WCard>
        <WCard title="Transaction 수" val={lv?`${fmtNum(lv.tps)}/s`:'-'} vc="text-emerald-400">
          <MiniTimeChart data={history} series={[
            {key:'commits',color:'#10b981',name:'Commits/s'},
            {key:'rollbacks',color:'#ef4444',name:'Rollbacks/s'},
          ]} height={100}/>
        </WCard>
        <WCard title="DML별 실행 row수" val={lv?`${fmtNum(lv.dml)}/s`:'-'} vc="text-purple-400">
          <MiniTimeChart data={history} series={[{key:'dml',color:'#8b5cf6',name:'DML/s'}]} height={100}/>
        </WCard>
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* Row 2: Lock 대기 수 | Index hit ratio | temp 사용 | Logical I/O */}
      {/* ════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        <WCard title="Lock 대기 수" val={isLoading?'-':String(metrics?.blockedSessions.length??0)} vc={(metrics?.blockedSessions.length??0)>0?'text-red-400':'text-foreground/50'} link="/monitoring/locks">
          <MiniTimeChart data={history} series={[{key:'lockWaits',color:'#ef4444',name:'Lock Waits'}]} height={100}/>
        </WCard>
        <WCard title="Index hit ratio" val={isLoading?'-':`${g?.cache_hit_ratio??0}%`} vc={g&&g.cache_hit_ratio>=99?'text-emerald-400':g&&g.cache_hit_ratio>=95?'text-amber-400':'text-red-400'}>
          <MiniTimeChart data={history} series={[{key:'cacheHitRatio',color:'#6366f1',name:'Hit%'}]} height={100} yFormatter={v=>`${v}%`}/>
        </WCard>
        <WCard title="temp 사용" val={isLoading?'-':history.length>0?fmtBytes(history[history.length-1]?.tempBytesPerSec??0)+'/s':'0 B/s'}>
          <MiniTimeChart data={history} series={[{key:'tempBytesPerSec',color:'#f97316',name:'Temp/s'}]} height={100} yFormatter={v=>fmtBytes(v)}/>
        </WCard>
        <WCard title="Logical I/O" val={lv?`${fmtNum(lv.blksHit)}/s`:'-'} vc="text-blue-400" sub={lv&&lv.blksRead>0?`Read: ${fmtNum(lv.blksRead)}/s`:undefined} sc="text-red-400">
          <MiniTimeChart data={history} series={[{key:'blksHit',color:'#3b82f6',name:'Hit/s'},{key:'blksRead',color:'#ef4444',name:'Read/s'}]} height={100}/>
        </WCard>
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* Row 3: Physical I/O | Buffer Hit Rate(%) | vacuum 수행 수 | Checkpoint */}
      {/* ════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        <WCard title="Physical I/O" val={lv?`${fmtNum(lv.blksRead)}/s`:'-'} vc="text-orange-400">
          <MiniTimeChart data={history} series={[{key:'blksRead',color:'#f97316',name:'Blks Read/s'}]} height={100}/>
        </WCard>
        <WCard title="Buffer Hit Rate(%)" val={lv?`${lv.bufferHitRate.toFixed(1)}%`:'-'} vc={lv&&lv.bufferHitRate>=99?'text-emerald-400':lv&&lv.bufferHitRate>=95?'text-amber-400':'text-red-400'}>
          <MiniTimeChart data={history} series={[{key:'bufferHitRate',color:'#10b981',name:'Hit%'}]} height={100} yFormatter={v=>`${v.toFixed(0)}%`}/>
        </WCard>
        <WCard title="vacuum 수행 수" val={isLoading?'-':String(metrics?.vacuum_sessions??0)} vc={(metrics?.vacuum_sessions??0)>3?'text-amber-400':'text-foreground/50'} link="/monitoring/vacuum">
          <MiniTimeChart data={history} series={[{key:'vacuumSessions',color:'#14b8a6',name:'Vacuum'}]} height={100}/>
        </WCard>
        <WCard title="Checkpoint" val={lv?String(lv.checkpoints):'-'}>
          <MiniTimeChart data={history} series={[{key:'checkpoints',color:'#8b5cf6',name:'Checkpoints'}]} height={100}/>
        </WCard>
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* Row 4: Long Active | Replication Delay | Deadlocks | Wait Event */}
      {/* ════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        <WCard title="Long Active Session Count" val={isLoading?'-':String((metrics?.long_active_sessions?.s3to10??0)+(metrics?.long_active_sessions?.s10to15??0)+(metrics?.long_active_sessions?.over15s??0))}
          vc={(metrics?.long_active_sessions?.over15s??0)>0?'text-red-400':(metrics?.long_active_sessions?.s10to15??0)>0?'text-orange-400':'text-foreground/50'}>
          <MiniTimeChart data={history} series={[
            {key:'longActive_under3s',color:'#3b82f6',name:'<3s'},
            {key:'longActive_3to10',color:'#10b981',name:'3-10s'},
            {key:'longActive_10to15',color:'#f97316',name:'10-15s'},
            {key:'longActive_over15s',color:'#ef4444',name:'>15s'},
          ]} height={100} stacked/>
        </WCard>
        <WCard title="Replication Delay(Sec)" val={isLoading?'-':`${(metrics?.replication_delay_sec??0).toFixed(1)}s`} vc={(metrics?.replication_delay_sec??0)>10?'text-red-400':(metrics?.replication_delay_sec??0)>1?'text-amber-400':'text-emerald-400'}>
          <MiniTimeChart data={history} series={[{key:'replicationDelay',color:'#06b6d4',name:'Delay(s)'}]} height={100} yFormatter={v=>`${v.toFixed(1)}s`}/>
        </WCard>
        <WCard title="Deadlocks" val={isLoading?'-':String(g?.deadlocks??0)} vc={(g?.deadlocks??0)>0?'text-red-400':'text-emerald-400'}>
          <MiniTimeChart data={history} series={[{key:'deadlocks',color:'#e11d48',name:'Deadlocks'}]} height={100}/>
        </WCard>
        {/* Wait Event - horizontal bar */}
        <div className="bg-card rounded border border-border p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-muted-foreground">Wait Event</span>
            <Link href="/monitoring/wait-events" className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5">상세<ArrowUpRight className="h-2.5 w-2.5"/></Link>
          </div>
          {waitClassData.length===0
            ? <div className="flex items-center justify-center h-[100px] text-[11px] text-muted-foreground">대기 이벤트 없음</div>
            : <ResponsiveContainer width="100%" height={100} minWidth={0} minHeight={0}><BarChart data={waitClassData} layout="vertical" margin={{top:0,right:5,left:0,bottom:0}}>
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
      {/* SQL Elapse Map - 전용 섹션 (확대)                         */}
      {/* ════════════════════════════════════════════════════════ */}
      <div className="bg-card rounded border border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">SQL Elapse Map</span>
            <SqlElapseLegend />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{elapseData.length} SQLs</span>
            <Link href="/monitoring/top-sql" className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5">상세<ArrowUpRight className="h-2.5 w-2.5"/></Link>
          </div>
        </div>
        <SqlElapseMap data={elapseData} height={280} onSelect={setSelectedElapsePoints}/>
      </div>

      {/* SQL Detail Popup Dialog */}
      <SqlDetailDialog
        points={selectedElapsePoints}
        open={selectedElapsePoints.length > 0}
        onClose={() => setSelectedElapsePoints([])}
      />

      {/* ════════════════════════════════════════════════════════ */}
      {/* DB Info Bar                                              */}
      {/* ════════════════════════════════════════════════════════ */}
      <div className="bg-card rounded border border-border px-4 py-2 flex items-center justify-between flex-wrap gap-x-6 gap-y-1">
        <div className="flex items-center gap-4 text-xs">
          <IR icon={<HardDrive className="h-3 w-3"/>} label="Size" value={isLoading?'-':fmtBytes(g?.db_size??0)} bold/>
          <IR icon={<Server className="h-3 w-3"/>} label="Host" value={`${selectedConnection.host}:${selectedConnection.port}`} mono/>
          <IR icon={<Shield className="h-3 w-3"/>} label="Version" value={selectedConnection.pgVersion||'-'}/>
          <IR icon={<Cpu className="h-3 w-3"/>} label="Deadlocks" value={isLoading?'-':String(g?.deadlocks??0)} bold/>
        </div>
        <div className="flex items-center gap-3">
          {metrics?.uptime_sec != null && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3"/>Uptime: {fmtUptime(metrics.uptime_sec)}</span>}
          {selectedConnection.pgStatStatementsEnabled
            ? <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-emerald-500/30 text-emerald-400">pg_stat_statements ✓</Badge>
            : <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-amber-500/30 text-amber-400">pg_stat_statements ✗</Badge>}
        </div>
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
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground flex items-center gap-1">{icon}{label}</span>
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
  const [sqlDetail, setSqlDetail] = useState<DashboardMetrics['sessions']['activeSessions'][number]|null>(null);
  const [copied, setCopied] = useState(false);

  if (loading) return <TSkel/>;
  if (!sessions.length) return <div className="text-center py-8 text-xs text-muted-foreground">실행 중인 쿼리 없음</div>;
  return (
    <>
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
                <td
                  className={`px-3 py-1.5 font-mono truncate max-w-[400px] cursor-pointer hover:text-blue-400 transition-colors ${dc}`}
                  title="클릭하여 SQL 상세 보기"
                  onClick={() => { setSqlDetail(sess); setCopied(false); }}
                >{sess.query?.replace(/\s+/g,' ').substring(0,120)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

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
                  <span className="text-muted-foreground">Application</span>
                  <span className="font-mono">{sqlDetail?.application_name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Client</span>
                  <span className="font-mono">{sqlDetail?.client_addr || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">State</span>
                  <span className={cn('font-medium',
                    sqlDetail?.state === 'active' ? 'text-emerald-400' : 'text-muted-foreground'
                  )}>{sqlDetail?.state || 'active'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">실행시간</span>
                  <span className={cn('font-mono font-bold',
                    (sqlDetail?.query_duration_ms || 0) >= 10000 ? 'text-red-400' :
                    (sqlDetail?.query_duration_ms || 0) >= 3000 ? 'text-orange-400' : ''
                  )}>
                    {sqlDetail?.query_duration_ms != null ? `${(sqlDetail.query_duration_ms / 1000).toFixed(2)}s` : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Wait Event</span>
                  <span className="font-mono">{sqlDetail?.wait_event ? `${sqlDetail.wait_event_type} / ${sqlDetail.wait_event}` : 'CPU'}</span>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
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
  const [sqlDetail, setSqlDetail] = useState<DashboardMetrics['topSql'][number]|null>(null);
  const [copied, setCopied] = useState(false);

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
    <>
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
                <td className="px-3 py-1.5">
                  <span
                    className="font-mono text-blue-400 hover:text-blue-300 truncate block max-w-[400px] cursor-pointer transition-colors"
                    title="클릭하여 SQL 상세 보기"
                    onClick={() => { setSqlDetail(sql); setCopied(false); }}
                  >{sql.query?.replace(/\s+/g,' ').substring(0,100)}</span>
                </td>
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

      {/* Top SQL Detail Dialog */}
      <Dialog open={!!sqlDetail} onOpenChange={(open) => !open && setSqlDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>SQL 상세 정보</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Query ID */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Query ID</label>
              <div className="rounded-md bg-muted/50 px-3 py-2 font-mono text-sm flex items-center justify-between">
                <span>{sqlDetail?.queryid}</span>
                <Link href={`/analysis/sql/${sqlDetail?.queryid}`} className="text-xs text-blue-400 hover:text-blue-300 no-underline">
                  상세 분석 페이지 →
                </Link>
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

            {/* Stats Grid */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">실행 통계</label>
              <div className="rounded-md bg-muted/50 p-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Calls</span>
                  <span className="font-mono font-bold">{sqlDetail ? fmtNum(sqlDetail.calls) : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Time</span>
                  <span className="font-mono">{sqlDetail ? fmtMs(sqlDetail.total_exec_time) : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Time</span>
                  <span className={cn('font-mono font-bold',
                    (sqlDetail?.mean_exec_time||0) > 1000 ? 'text-red-400' :
                    (sqlDetail?.mean_exec_time||0) > 100 ? 'text-amber-400' : ''
                  )}>{sqlDetail ? fmtMs(sqlDetail.mean_exec_time) : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rows</span>
                  <span className="font-mono">{sqlDetail ? fmtNum(sqlDetail.rows) : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shared Blks Hit</span>
                  <span className="font-mono">{sqlDetail ? fmtNum(sqlDetail.shared_blks_hit) : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shared Blks Read</span>
                  <span className="font-mono">{sqlDetail ? fmtNum(sqlDetail.shared_blks_read) : '-'}</span>
                </div>
                <div className="flex justify-between col-span-2">
                  <span className="text-muted-foreground">Hit Ratio</span>
                  {(() => {
                    const tot = (sqlDetail?.shared_blks_hit||0)+(sqlDetail?.shared_blks_read||0);
                    const hr = tot>0?((sqlDetail!.shared_blks_hit/tot)*100).toFixed(1):'-';
                    return <span className={cn('font-mono font-bold',
                      Number(hr)>=99?'text-emerald-400':Number(hr)>=90?'text-amber-400':'text-red-400'
                    )}>{hr==='−'?'-':`${hr}%`}</span>;
                  })()}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TSkel() {
  return <div className="p-4 space-y-2">{[...Array(3)].map((_,i)=><div key={i} className="h-7 bg-muted/50 rounded animate-pulse"/>)}</div>;
}
