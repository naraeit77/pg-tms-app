'use client';

/**
 * Top 오브젝트 (Top Objects)
 * WhaTap /postgresql/analysis-top-object 스타일
 * 6탭 분석 (Bloating/Scan/DML/Analyze Time/Age/Dead Tuple) + Table/Index 서브탭
 */

import { useQuery } from '@tanstack/react-query';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { WidgetCard } from '@/components/shared/widget-card';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw } from 'lucide-react';

const tabs = [
  { key: 'bloating', label: 'Bloating' },
  { key: 'scan', label: 'Scan' },
  { key: 'dml', label: 'DML' },
  { key: 'analyze_time', label: 'Analyze Time' },
  { key: 'age', label: 'Age' },
  { key: 'dead_tuple', label: 'Dead Tuple' },
];

const columnDefs: Record<string, DataTableColumn<any>[]> = {
  bloating: [
    { key: 'schemaname', label: 'Schema', width: 80 },
    { key: 'relname', label: 'Table', width: 160, render: (v) => <span className="font-mono text-xs font-medium">{String(v)}</span> },
    { key: 'table_size', label: 'Size', width: 90, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs">{fmtBytes(Number(v))}</span> },
    { key: 'n_dead_tup', label: 'Dead Tuples', width: 100, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs text-orange-400">{Number(v).toLocaleString()}</span> },
    { key: 'bloat_pct', label: 'Bloat %', width: 80, align: 'right', sortable: true, render: (v) => <span className={cn('font-mono text-xs', Number(v) > 20 ? 'text-red-400' : Number(v) > 10 ? 'text-orange-400' : '')}>{Number(v).toFixed(1)}%</span> },
  ],
  scan: [
    { key: 'schemaname', label: 'Schema', width: 80 },
    { key: 'relname', label: 'Table', width: 160, render: (v) => <span className="font-mono text-xs font-medium">{String(v)}</span> },
    { key: 'seq_scan', label: 'Seq Scan', width: 100, align: 'right', sortable: true, render: (v) => <span className={cn('font-mono text-xs', Number(v) > 10000 ? 'text-orange-400' : '')}>{Number(v).toLocaleString()}</span> },
    { key: 'seq_tup_read', label: 'Seq Rows', width: 100, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
    { key: 'idx_scan', label: 'Idx Scan', width: 100, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
    { key: 'idx_tup_fetch', label: 'Idx Rows', width: 100, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
  ],
  dml: [
    { key: 'schemaname', label: 'Schema', width: 80 },
    { key: 'relname', label: 'Table', width: 160, render: (v) => <span className="font-mono text-xs font-medium">{String(v)}</span> },
    { key: 'inserts', label: 'Inserts', width: 90, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
    { key: 'updates', label: 'Updates', width: 90, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
    { key: 'deletes', label: 'Deletes', width: 90, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
    { key: 'hot_updates', label: 'HOT Updates', width: 90, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs text-emerald-400">{Number(v).toLocaleString()}</span> },
  ],
  analyze_time: [
    { key: 'schemaname', label: 'Schema', width: 80 },
    { key: 'relname', label: 'Table', width: 160, render: (v) => <span className="font-mono text-xs font-medium">{String(v)}</span> },
    { key: 'last_autovacuum', label: 'Last Autovacuum', width: 160, render: (v) => <span className="text-[11px]">{v ? String(v).slice(0, 19) : '-'}</span> },
    { key: 'last_autoanalyze', label: 'Last Autoanalyze', width: 160, render: (v) => <span className="text-[11px]">{v ? String(v).slice(0, 19) : '-'}</span> },
    { key: 'vacuum_count', label: 'Vacuum', width: 70, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs">{String(v)}</span> },
    { key: 'analyze_count', label: 'Analyze', width: 70, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs">{String(v)}</span> },
  ],
  age: [
    { key: 'schemaname', label: 'Schema', width: 80 },
    { key: 'relname', label: 'Table', width: 200, render: (v) => <span className="font-mono text-xs font-medium">{String(v)}</span> },
    { key: 'xid_age', label: 'XID Age', width: 120, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
    { key: 'table_size', label: 'Size', width: 100, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs">{fmtBytes(Number(v))}</span> },
  ],
  dead_tuple: [
    { key: 'schemaname', label: 'Schema', width: 80 },
    { key: 'relname', label: 'Table', width: 160, render: (v) => <span className="font-mono text-xs font-medium">{String(v)}</span> },
    { key: 'n_dead_tup', label: 'Dead Tuples', width: 120, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs font-bold text-orange-400">{Number(v).toLocaleString()}</span> },
    { key: 'n_live_tup', label: 'Live Tuples', width: 120, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
    { key: 'last_autovacuum', label: 'Last Autovacuum', width: 160, render: (v) => <span className="text-[11px]">{v ? String(v).slice(0, 19) : '-'}</span> },
  ],
};

const indexColumns: DataTableColumn<any>[] = [
  { key: 'schemaname', label: 'Schema', width: 80 },
  { key: 'tablename', label: 'Table', width: 140 },
  { key: 'indexname', label: 'Index', width: 200, render: (v) => <span className="font-mono text-xs font-medium">{String(v)}</span> },
  { key: 'index_size', label: 'Size', width: 90, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs">{fmtBytes(Number(v))}</span> },
  { key: 'idx_scan', label: 'Scans', width: 90, align: 'right', sortable: true, render: (v) => <span className={cn('font-mono text-xs', Number(v) === 0 ? 'text-red-400' : '')}>{Number(v).toLocaleString()}</span> },
  { key: 'idx_tup_read', label: 'Rows Read', width: 100, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
];

function fmtBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default function TopObjectsPage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [activeTab, setActiveTab] = useState('bloating');
  const [objType, setObjType] = useState<'table' | 'index'>('table');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['top-objects', selectedConnectionId, activeTab, objType],
    queryFn: async () => {
      const res = await fetch(`/api/analysis/top-objects?connection_id=${selectedConnectionId}&tab=${activeTab}&type=${objType}&limit=50`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedConnectionId,
  });

  const rows = data?.data || [];
  const cols = objType === 'index' ? indexColumns : (columnDefs[activeTab] || columnDefs.bloating);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-lg font-bold">Top 오브젝트</h1>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {/* Primary Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8">
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="text-xs">{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Sub Tabs (Table/Index) */}
      <Tabs value={objType} onValueChange={(v) => setObjType(v as 'table' | 'index')}>
        <TabsList className="h-7">
          <TabsTrigger value="table" className="text-xs">Table</TabsTrigger>
          <TabsTrigger value="index" className="text-xs">Index</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Data Table */}
      <WidgetCard title={`${tabs.find((t) => t.key === activeTab)?.label} — ${objType === 'table' ? '테이블' : '인덱스'} (${rows.length}건)`} fullscreenable>
        <DataTable
          data={rows}
          columns={cols as any}
          rowKey={objType === 'index' ? 'indexname' : 'relname'}
          searchable
          searchPlaceholder="오브젝트 검색..."
          exportable
          exportFilename={`top-objects-${activeTab}`}
          pageSize={30}
          compact
          emptyMessage={isLoading ? '데이터 로딩 중...' : '데이터가 없습니다'}
        />
      </WidgetCard>
    </div>
  );
}
