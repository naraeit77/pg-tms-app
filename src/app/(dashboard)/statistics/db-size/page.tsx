'use client';

/**
 * DB 사이즈 (Database Size)
 * WhaTap 데이터베이스 사이즈 스타일
 * DB/테이블/인덱스 사이즈 대시보드
 */

import { useQuery } from '@tanstack/react-query';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { cn } from '@/lib/utils';
import { WidgetCard } from '@/components/shared/widget-card';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Database, HardDrive, Layers } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie,
} from 'recharts';
import { useState } from 'react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

function fmtBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default function DbSizePage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [tab, setTab] = useState('tables');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['db-size', selectedConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/statistics/db-size?connection_id=${selectedConnectionId}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedConnectionId,
  });

  const summary = data?.data?.summary || {};
  const databases = data?.data?.databases || [];
  const tables = data?.data?.tables || [];
  const indexes = data?.data?.indexes || [];

  // DB 사이즈 파이 차트
  const dbPieData = databases.map((d: any, i: number) => ({
    name: d.datname,
    value: Number(d.size_bytes),
    color: COLORS[i % COLORS.length],
  }));

  // Top 10 테이블 바 차트
  const tableBarData = tables.slice(0, 10).map((t: any, i: number) => ({
    name: `${t.schemaname}.${t.relname}`,
    total: Number(t.total_size),
    table: Number(t.table_size),
    index: Number(t.indexes_size),
    color: COLORS[i % COLORS.length],
  }));

  const tableColumns: DataTableColumn<any>[] = [
    { key: 'schemaname', label: 'Schema', width: 80 },
    { key: 'relname', label: 'Table', width: 180, render: (v) => <span className="font-mono text-xs font-medium">{String(v)}</span> },
    { key: 'total_size', label: 'Total', width: 90, align: 'right' as const, sortable: true, render: (v) => <span className="font-mono text-xs font-bold">{fmtBytes(Number(v))}</span> },
    { key: 'table_size', label: 'Table', width: 90, align: 'right' as const, sortable: true, render: (v) => <span className="font-mono text-xs">{fmtBytes(Number(v))}</span> },
    { key: 'indexes_size', label: 'Indexes', width: 90, align: 'right' as const, sortable: true, render: (v) => <span className="font-mono text-xs text-purple-400">{fmtBytes(Number(v))}</span> },
    { key: 'row_estimate', label: 'Rows (est.)', width: 100, align: 'right' as const, sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
  ];

  const indexColumns: DataTableColumn<any>[] = [
    { key: 'schemaname', label: 'Schema', width: 80 },
    { key: 'tablename', label: 'Table', width: 150 },
    { key: 'indexname', label: 'Index', width: 200, render: (v) => <span className="font-mono text-xs font-medium">{String(v)}</span> },
    { key: 'index_size', label: 'Size', width: 100, align: 'right' as const, sortable: true, render: (v) => <span className="font-mono text-xs font-bold">{fmtBytes(Number(v))}</span> },
    {
      key: 'idx_scan', label: 'Scans', width: 90, align: 'right' as const, sortable: true,
      render: (v) => <span className={cn('font-mono text-xs', Number(v) === 0 ? 'text-red-400 font-bold' : '')}>{Number(v).toLocaleString()}</span>,
    },
  ];

  const dbColumns: DataTableColumn<any>[] = [
    { key: 'datname', label: 'Database', width: 200, render: (v) => <span className="font-mono text-sm font-medium">{String(v)}</span> },
    { key: 'size_pretty', label: 'Size', width: 120, align: 'right' as const, render: (v) => <span className="font-mono text-sm font-bold">{String(v)}</span> },
    { key: 'size_bytes', label: 'Bytes', width: 130, align: 'right' as const, sortable: true, render: (v) => <span className="font-mono text-xs text-muted-foreground">{Number(v).toLocaleString()}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-bold">DB 사이즈</h1>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-2"><Database className="h-4 w-4 text-blue-400" /><span className="text-sm font-medium">전체 DB 크기</span></div>
          <div className="text-2xl font-bold font-mono text-blue-400">{fmtBytes(summary.totalDbSize || 0)}</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-2"><HardDrive className="h-4 w-4 text-emerald-400" /><span className="text-sm font-medium">테이블 크기</span></div>
          <div className="text-2xl font-bold font-mono text-emerald-400">{fmtBytes(summary.totalTableSize || 0)}</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-2"><Layers className="h-4 w-4 text-purple-400" /><span className="text-sm font-medium">인덱스 크기</span></div>
          <div className="text-2xl font-bold font-mono text-purple-400">{fmtBytes(summary.totalIndexSize || 0)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* DB Size Pie */}
        <WidgetCard title="데이터베이스별 크기">
          <div className="h-[220px]">
            {dbPieData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">데이터 없음</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie data={dbPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}
                    label={({ name, value }) => `${name}: ${fmtBytes(value)}`}
                    labelLine={{ stroke: 'hsl(var(--chart-tick))', strokeWidth: 1 }}
                  >
                    {dbPieData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--chart-tooltip-bg))', border: '1px solid hsl(var(--chart-tooltip-border))', borderRadius: '6px', fontSize: '12px', color: 'hsl(var(--chart-tooltip-text))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} formatter={(v: number) => fmtBytes(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </WidgetCard>

        {/* Top 10 Tables Bar */}
        <WidgetCard title="Top 10 테이블 크기">
          <div className="h-[220px]">
            {tableBarData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">데이터 없음</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={tableBarData} layout="vertical" margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" strokeOpacity={0.5} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: 'hsl(var(--chart-tick))' }} tickLine={false} axisLine={false} tickFormatter={(v) => fmtBytes(v)} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 9, fill: 'hsl(var(--chart-tick))' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--chart-tooltip-bg))', border: '1px solid hsl(var(--chart-tooltip-border))', borderRadius: '6px', fontSize: '11px', color: 'hsl(var(--chart-tooltip-text))', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} formatter={(v: number) => fmtBytes(v)} />
                  <Bar dataKey="table" stackId="size" fill="#10b981" name="Table" />
                  <Bar dataKey="index" stackId="size" fill="#8b5cf6" name="Index" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </WidgetCard>
      </div>

      {/* Tabs + Tables */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-8">
          <TabsTrigger value="databases" className="text-xs">Databases ({databases.length})</TabsTrigger>
          <TabsTrigger value="tables" className="text-xs">Tables ({tables.length})</TabsTrigger>
          <TabsTrigger value="indexes" className="text-xs">Indexes ({indexes.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <WidgetCard title={tab === 'databases' ? '데이터베이스 목록' : tab === 'tables' ? '테이블 목록' : '인덱스 목록'} fullscreenable>
        <DataTable
          data={tab === 'databases' ? databases : tab === 'tables' ? tables : indexes}
          columns={(tab === 'databases' ? dbColumns : tab === 'tables' ? tableColumns : indexColumns) as any}
          rowKey={tab === 'databases' ? 'datname' : tab === 'tables' ? 'relname' : 'indexname'}
          searchable
          searchPlaceholder="검색..."
          exportable
          exportFilename={`db-size-${tab}`}
          customizable
          pageSize={30}
          compact
        />
      </WidgetCard>
    </div>
  );
}
