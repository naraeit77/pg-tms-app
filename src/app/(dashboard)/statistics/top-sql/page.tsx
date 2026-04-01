'use client';

/**
 * Top SQL (Statistics)
 * WhaTap /postgresql/top-sql 스타일
 * 시계열 트렌드 차트 + 탭(ALL/DB/USER) + 상세 테이블
 */

import { useQuery } from '@tanstack/react-query';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { WidgetCard } from '@/components/shared/widget-card';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#14b8a6'];

const orderOptions = [
  { value: 'total_exec_time', label: 'Total Exec Time' },
  { value: 'calls', label: 'Calls' },
  { value: 'mean_exec_time', label: 'Avg Exec Time' },
  { value: 'max_exec_time', label: 'Max Exec Time' },
  { value: 'shared_blks_read', label: 'Shared Blks Read' },
  { value: 'rows', label: 'Rows' },
];

export default function TopSqlPage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [orderBy, setOrderBy] = useState('total_exec_time');
  const [groupBy, setGroupBy] = useState('all');
  const [limit, setLimit] = useState(20);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['top-sql-trend', selectedConnectionId, orderBy, groupBy, limit],
    queryFn: async () => {
      const res = await fetch(
        `/api/statistics/top-sql-trend?connection_id=${selectedConnectionId}&order_by=${orderBy}&group_by=${groupBy}&limit=${limit}`
      );
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedConnectionId,
  });

  const rows = data?.data || [];

  // Top 10 차트 데이터 (ALL 모드)
  const chartData = groupBy === 'all'
    ? rows.slice(0, 10).map((r: any, i: number) => ({
        name: `Q${i + 1}`,
        value: orderBy === 'calls' ? Number(r.calls) :
               orderBy === 'mean_exec_time' ? Number(r.mean_exec_time) :
               orderBy === 'rows' ? Number(r.rows) :
               Number(r.total_exec_time),
        color: COLORS[i % COLORS.length],
        query: r.query?.substring(0, 60),
      }))
    : rows.slice(0, 10).map((r: any, i: number) => ({
        name: r.group_name,
        value: Number(r.total_exec_time),
        color: COLORS[i % COLORS.length],
      }));

  const allColumns: DataTableColumn<any>[] = [
    {
      key: 'queryid', label: '#', width: 70,
      render: (v) => <span className="font-mono text-[10px]">{String(v).slice(-8)}</span>,
    },
    {
      key: 'query', label: 'SQL',
      render: (v) => <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[350px]" title={String(v)}>{String(v)}</div>,
    },
    {
      key: 'calls', label: 'Calls', width: 80, align: 'right' as const, sortable: true,
      render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'total_exec_time', label: 'Total Time', width: 100, align: 'right' as const, sortable: true,
      render: (v) => <span className="font-mono text-xs">{fmtMs(Number(v))}</span>,
    },
    {
      key: 'mean_exec_time', label: 'Avg Time', width: 90, align: 'right' as const, sortable: true,
      render: (v) => {
        const ms = Number(v);
        return <span className={cn('font-mono text-xs font-bold',
          ms >= 1000 ? 'text-red-400' : ms >= 100 ? 'text-orange-400' : ms >= 10 ? 'text-blue-400' : 'text-emerald-400'
        )}>{fmtMs(ms)}</span>;
      },
    },
    {
      key: 'max_exec_time', label: 'Max Time', width: 90, align: 'right' as const, sortable: true,
      render: (v) => <span className="font-mono text-xs">{fmtMs(Number(v))}</span>,
    },
    {
      key: 'rows', label: 'Rows', width: 80, align: 'right' as const, sortable: true,
      render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'shared_blks_hit', label: 'Blk Hit', width: 80, align: 'right' as const, sortable: true,
      render: (v) => <span className="font-mono text-xs text-muted-foreground">{fmtNum(Number(v))}</span>,
    },
    {
      key: 'shared_blks_read', label: 'Blk Read', width: 80, align: 'right' as const, sortable: true,
      render: (v) => <span className={cn('font-mono text-xs', Number(v) > 1000 ? 'text-orange-400' : 'text-muted-foreground')}>{fmtNum(Number(v))}</span>,
    },
  ];

  const groupColumns: DataTableColumn<any>[] = [
    { key: 'group_name', label: groupBy === 'db' ? 'Database' : 'User', width: 150, render: (v) => <span className="font-medium text-sm">{String(v)}</span> },
    { key: 'query_count', label: 'Queries', width: 80, align: 'right' as const, sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
    { key: 'total_calls', label: 'Total Calls', width: 100, align: 'right' as const, sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
    { key: 'total_exec_time', label: 'Total Time', width: 110, align: 'right' as const, sortable: true, render: (v) => <span className="font-mono text-xs">{fmtMs(Number(v))}</span> },
    { key: 'avg_exec_time', label: 'Avg Time', width: 90, align: 'right' as const, sortable: true, render: (v) => <span className="font-mono text-xs">{fmtMs(Number(v))}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-lg font-bold">Top SQL</h1>
        <div className="flex items-center gap-2">
          <Select value={orderBy} onValueChange={setOrderBy}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {orderOptions.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
            <SelectTrigger className="h-8 w-[80px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">Top {n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Group Tabs */}
      <Tabs value={groupBy} onValueChange={setGroupBy}>
        <TabsList className="h-8">
          <TabsTrigger value="all" className="text-xs">ALL</TabsTrigger>
          <TabsTrigger value="db" className="text-xs">DB</TabsTrigger>
          <TabsTrigger value="user" className="text-xs">USER</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Top 10 Chart */}
      <WidgetCard title={`Top 10 — ${orderOptions.find((o) => o.value === orderBy)?.label}`}>
        <div className="h-[220px]">
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">데이터가 없습니다</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 25% 20%)" strokeOpacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(215 20% 50%)' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 50%)' }} tickLine={false} axisLine={false} tickFormatter={(v) => fmtNum(v)} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(217 33% 13%)', border: '1px solid hsl(215 25% 20%)', borderRadius: '6px', fontSize: '12px', color: 'hsl(210 40% 98%)' }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.query || payload?.[0]?.payload?.name || ''}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </WidgetCard>

      {/* Data Table */}
      <WidgetCard title={`SQL 목록 (${rows.length}건)`} fullscreenable>
        <DataTable
          data={rows}
          columns={(groupBy === 'all' ? allColumns : groupColumns) as any}
          rowKey={groupBy === 'all' ? 'queryid' : 'group_name'}
          searchable
          searchPlaceholder="SQL 검색..."
          exportable
          exportFilename="top-sql"
          customizable
          pageSize={30}
          compact
          emptyMessage={isLoading ? '데이터 로딩 중...' : 'pg_stat_statements 데이터가 없습니다'}
        />
      </WidgetCard>
    </div>
  );
}

function fmtMs(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(1)}ms`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
