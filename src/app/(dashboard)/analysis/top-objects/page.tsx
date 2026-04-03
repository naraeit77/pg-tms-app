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
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';

const tabs = [
  { key: 'bloating', label: 'Bloating' },
  { key: 'scan', label: 'Scan' },
  { key: 'dml', label: 'DML' },
  { key: 'analyze_time', label: 'Analyze Time' },
  { key: 'age', label: 'Age' },
  { key: 'dead_tuple', label: 'Dead Tuple' },
];

function fmtBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function fmtDuration(secs: number | null): string {
  if (secs == null) return '-';
  if (secs < 60) return `${secs}초 전`;
  if (secs < 3600) return `${Math.floor(secs / 60)}분 전`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}시간 전`;
  return `${Math.floor(secs / 86400)}일 전`;
}

const schemaCol: DataTableColumn<any> = {
  key: 'schemaname', label: 'Schema', width: 80,
  render: (v) => <span className="text-xs text-muted-foreground">{String(v)}</span>,
};
const tableNameCol: DataTableColumn<any> = {
  key: 'relname', label: 'Table', width: 160,
  render: (v) => <span className="font-mono text-xs font-medium">{String(v)}</span>,
};
const tableSizeCol: DataTableColumn<any> = {
  key: 'table_size', label: 'Size', width: 85, align: 'right', sortable: true,
  render: (v) => <span className="font-mono text-xs">{fmtBytes(Number(v))}</span>,
};

/* ── Table Column Definitions per Tab ── */
const tableColumnDefs: Record<string, DataTableColumn<any>[]> = {
  bloating: [
    schemaCol,
    tableNameCol,
    tableSizeCol,
    {
      key: 'n_live_tup', label: 'Live Tuples', width: 100, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'n_dead_tup', label: 'Dead Tuples', width: 100, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs text-orange-400">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'bloat_pct', label: 'Bloat %', width: 80, align: 'right', sortable: true,
      render: (v) => {
        const pct = Number(v);
        return (
          <span className={cn('font-mono text-xs font-bold', pct > 30 ? 'text-red-500' : pct > 20 ? 'text-red-400' : pct > 10 ? 'text-orange-400' : '')}>
            {pct.toFixed(1)}%
          </span>
        );
      },
    },
    {
      key: 'bytes_per_row', label: 'Bytes/Row', width: 85, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs text-muted-foreground">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'last_autovacuum', label: 'Last Vacuum', width: 140,
      render: (v) => <span className="text-[11px] text-muted-foreground">{v ? String(v).slice(0, 19) : <span className="text-red-400">없음</span>}</span>,
    },
  ],
  scan: [
    schemaCol,
    tableNameCol,
    tableSizeCol,
    {
      key: 'n_live_tup', label: 'Rows', width: 90, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'seq_scan', label: 'Seq Scan', width: 90, align: 'right', sortable: true,
      render: (v) => <span className={cn('font-mono text-xs font-bold', Number(v) > 10000 ? 'text-red-400' : Number(v) > 1000 ? 'text-orange-400' : '')}>{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'avg_seq_rows', label: 'Avg Seq Rows', width: 100, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs text-muted-foreground">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'idx_scan', label: 'Idx Scan', width: 90, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs text-emerald-400">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'idx_scan_ratio', label: 'Idx Ratio', width: 80, align: 'right', sortable: true,
      render: (v) => {
        const pct = Number(v);
        return (
          <span className={cn('font-mono text-xs font-bold', pct < 50 ? 'text-red-400' : pct < 80 ? 'text-orange-400' : 'text-emerald-400')}>
            {pct.toFixed(1)}%
          </span>
        );
      },
    },
  ],
  dml: [
    schemaCol,
    tableNameCol,
    tableSizeCol,
    {
      key: 'total_dml', label: 'Total DML', width: 100, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs font-bold">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'inserts', label: 'Inserts', width: 85, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs text-blue-400">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'updates', label: 'Updates', width: 85, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs text-amber-400">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'deletes', label: 'Deletes', width: 85, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs text-red-400">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'hot_updates', label: 'HOT', width: 80, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs text-emerald-400">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'hot_update_ratio', label: 'HOT %', width: 70, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs text-muted-foreground">{Number(v).toFixed(1)}%</span>,
    },
  ],
  analyze_time: [
    schemaCol,
    tableNameCol,
    tableSizeCol,
    {
      key: 'n_live_tup', label: 'Rows', width: 90, align: 'right',
      render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'secs_since_vacuum', label: 'Vacuum 경과', width: 100, align: 'right', sortable: true,
      render: (v) => {
        const secs = Number(v);
        return <span className={cn('text-xs', secs > 86400 * 7 ? 'text-red-400' : secs > 86400 ? 'text-orange-400' : 'text-muted-foreground')}>{fmtDuration(v ? secs : null)}</span>;
      },
    },
    {
      key: 'secs_since_analyze', label: 'Analyze 경과', width: 100, align: 'right', sortable: true,
      render: (v) => {
        const secs = Number(v);
        return <span className={cn('text-xs', secs > 86400 * 7 ? 'text-red-400' : secs > 86400 ? 'text-orange-400' : 'text-muted-foreground')}>{fmtDuration(v ? secs : null)}</span>;
      },
    },
    {
      key: 'vacuum_count', label: 'Vacuum', width: 65, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs">{String(v)}</span>,
    },
    {
      key: 'autovacuum_count', label: 'Auto', width: 55, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs">{String(v)}</span>,
    },
    {
      key: 'analyze_count', label: 'Analyze', width: 65, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs">{String(v)}</span>,
    },
    {
      key: 'autoanalyze_count', label: 'Auto', width: 55, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs">{String(v)}</span>,
    },
  ],
  age: [
    schemaCol,
    tableNameCol,
    tableSizeCol,
    {
      key: 'n_live_tup', label: 'Rows', width: 90, align: 'right',
      render: (v) => <span className="font-mono text-xs">{v != null ? Number(v).toLocaleString() : '-'}</span>,
    },
    {
      key: 'xid_age', label: 'XID Age', width: 120, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs font-bold">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'wraparound_pct', label: 'Wraparound %', width: 110, align: 'right', sortable: true,
      render: (v) => {
        const pct = Number(v);
        return (
          <span className={cn('font-mono text-xs font-bold', pct > 50 ? 'text-red-500' : pct > 30 ? 'text-red-400' : pct > 10 ? 'text-orange-400' : 'text-emerald-400')}>
            {pct.toFixed(2)}%
          </span>
        );
      },
    },
    {
      key: 'n_dead_tup', label: 'Dead Tuples', width: 100, align: 'right',
      render: (v) => <span className="font-mono text-xs text-orange-400">{v != null ? Number(v).toLocaleString() : '-'}</span>,
    },
    {
      key: 'last_autovacuum', label: 'Last Vacuum', width: 140,
      render: (v) => <span className="text-[11px] text-muted-foreground">{v ? String(v).slice(0, 19) : '-'}</span>,
    },
  ],
  dead_tuple: [
    schemaCol,
    tableNameCol,
    tableSizeCol,
    {
      key: 'n_dead_tup', label: 'Dead Tuples', width: 110, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs font-bold text-orange-400">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'n_live_tup', label: 'Live Tuples', width: 110, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'dead_ratio', label: 'Dead %', width: 75, align: 'right', sortable: true,
      render: (v) => {
        const pct = Number(v);
        return <span className={cn('font-mono text-xs font-bold', pct > 20 ? 'text-red-400' : pct > 10 ? 'text-orange-400' : '')}>{pct.toFixed(1)}%</span>;
      },
    },
    {
      key: 'n_mod_since_analyze', label: 'Mod Since Analyze', width: 130, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs text-muted-foreground">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'secs_since_vacuum', label: 'Vacuum 경과', width: 100, align: 'right', sortable: true,
      render: (v) => {
        const secs = Number(v);
        return <span className={cn('text-xs', secs > 86400 * 7 ? 'text-red-400' : secs > 86400 ? 'text-orange-400' : 'text-muted-foreground')}>{fmtDuration(v ? secs : null)}</span>;
      },
    },
    {
      key: 'autovacuum_count', label: 'Vacuum 횟수', width: 90, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs">{String(v)}</span>,
    },
  ],
};

/* ── Index 공통 컬럼 ── */
const idxSchemaCol: DataTableColumn<any> = {
  key: 'schemaname', label: 'Schema', width: 70,
  render: (v) => <span className="text-xs text-muted-foreground">{String(v)}</span>,
};
const idxTableCol: DataTableColumn<any> = {
  key: 'tablename', label: 'Table', width: 120,
  render: (v) => <span className="font-mono text-xs">{String(v)}</span>,
};
const idxNameCol: DataTableColumn<any> = {
  key: 'indexname', label: 'Index', width: 180,
  render: (v) => <span className="font-mono text-xs font-medium">{String(v)}</span>,
};
const idxColumnsCol: DataTableColumn<any> = {
  key: 'columns', label: 'Columns', width: 180,
  render: (v) => {
    const cols = Array.isArray(v) ? v : [];
    return (
      <div className="flex flex-wrap gap-0.5">
        {cols.map((c: string, i: number) => (
          <Badge key={i} variant="outline" className="text-[10px] px-1 py-0 font-mono border-blue-500/20 text-blue-400">{c}</Badge>
        ))}
      </div>
    );
  },
};
const idxTypeCol: DataTableColumn<any> = {
  key: 'index_type', label: 'Type', width: 60,
  render: (v) => <Badge variant="outline" className="text-[10px] px-1 py-0">{String(v)}</Badge>,
};
const idxSizeCol: DataTableColumn<any> = {
  key: 'index_size', label: 'Size', width: 80, align: 'right', sortable: true,
  render: (v) => <span className="font-mono text-xs">{fmtBytes(Number(v))}</span>,
};
const idxUniqueCol: DataTableColumn<any> = {
  key: 'is_unique', label: 'UQ', width: 45, align: 'center',
  render: (v, row) => row.is_primary
    ? <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-500/30 text-amber-400">PK</Badge>
    : v
      ? <Badge variant="outline" className="text-[10px] px-1 py-0 border-blue-500/30 text-blue-400">UQ</Badge>
      : <span className="text-xs text-muted-foreground">-</span>,
};

/* ── Index Column Definitions per Tab ── */
const indexColumnDefs: Record<string, DataTableColumn<any>[]> = {
  bloating: [
    idxSchemaCol, idxTableCol, idxNameCol, idxColumnsCol, idxTypeCol, idxUniqueCol, idxSizeCol,
    { key: 'table_size', label: 'Table Size', width: 80, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs text-muted-foreground">{fmtBytes(Number(v))}</span> },
    { key: 'idx_scan', label: 'Scans', width: 75, align: 'right', sortable: true, render: (v) => <span className={cn('font-mono text-xs', Number(v) === 0 ? 'text-red-400 font-bold' : '')}>{Number(v).toLocaleString()}</span> },
    {
      key: 'unused', label: '상태', width: 60, align: 'center',
      render: (v) => v
        ? <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400">미사용</Badge>
        : <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">사용</Badge>,
    },
  ],
  scan: [
    idxSchemaCol, idxTableCol, idxNameCol, idxColumnsCol, idxTypeCol, idxSizeCol,
    { key: 'idx_scan', label: 'Scans', width: 85, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs font-bold">{Number(v).toLocaleString()}</span> },
    { key: 'idx_tup_read', label: 'Rows Read', width: 95, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
    { key: 'idx_tup_fetch', label: 'Rows Fetch', width: 95, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
    {
      key: 'fetch_ratio', label: 'Fetch %', width: 70, align: 'right', sortable: true,
      render: (v) => <span className="font-mono text-xs text-muted-foreground">{Number(v).toFixed(1)}%</span>,
    },
  ],
  dml: [
    idxSchemaCol, idxTableCol, idxNameCol, idxColumnsCol, idxTypeCol, idxSizeCol,
    { key: 'idx_blks_read', label: 'Blks Read', width: 85, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs text-orange-400">{Number(v).toLocaleString()}</span> },
    { key: 'idx_blks_hit', label: 'Blks Hit', width: 85, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs text-emerald-400">{Number(v).toLocaleString()}</span> },
    {
      key: 'cache_hit_ratio', label: 'Cache Hit %', width: 85, align: 'right', sortable: true,
      render: (v) => {
        const pct = Number(v);
        return <span className={cn('font-mono text-xs font-bold', pct < 90 ? 'text-red-400' : pct < 95 ? 'text-orange-400' : 'text-emerald-400')}>{pct.toFixed(1)}%</span>;
      },
    },
    { key: 'idx_scan', label: 'Scans', width: 75, align: 'right', sortable: true, render: (v) => <span className="font-mono text-xs">{Number(v).toLocaleString()}</span> },
  ],
};

// analyze_time, age, dead_tuple → 미사용 인덱스 감지
const unusedIndexColumns: DataTableColumn<any>[] = [
  idxSchemaCol, idxTableCol, idxNameCol, idxColumnsCol, idxTypeCol, idxUniqueCol, idxSizeCol,
  {
    key: 'index_def', label: 'Index Definition',
    render: (v) => (
      <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[400px]" title={String(v)}>{String(v)}</div>
    ),
  },
];

const indexTabLabels: Record<string, string> = {
  bloating: '인덱스 크기별 (미사용 감지)',
  scan: '인덱스 사용 빈도',
  dml: '인덱스 I/O 부하',
  analyze_time: '미사용 인덱스 (삭제 후보)',
  age: '미사용 인덱스 (삭제 후보)',
  dead_tuple: '미사용 인덱스 (삭제 후보)',
};

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

  const getColumns = (): DataTableColumn<any>[] => {
    if (objType === 'table') {
      return tableColumnDefs[activeTab] || tableColumnDefs.bloating;
    }
    if (indexColumnDefs[activeTab]) {
      return indexColumnDefs[activeTab];
    }
    return unusedIndexColumns;
  };

  const tabLabel = tabs.find((t) => t.key === activeTab)?.label || '';
  const subLabel = objType === 'table' ? '테이블' : indexTabLabels[activeTab] || '인덱스';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-lg font-bold">Top 오브젝트</h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{rows.length}건</Badge>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
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
      <WidgetCard title={`${tabLabel} — ${subLabel} (${rows.length}건)`} fullscreenable>
        <DataTable
          data={rows}
          columns={getColumns() as any}
          rowKey={objType === 'index' ? 'indexname' : 'relname'}
          searchable
          searchPlaceholder="오브젝트 검색..."
          exportable
          exportFilename={`top-objects-${activeTab}-${objType}`}
          pageSize={30}
          compact
          emptyMessage={
            !selectedConnectionId
              ? 'DB를 선택해주세요'
              : isLoading
                ? '데이터 로딩 중...'
                : '데이터가 없습니다'
          }
        />
      </WidgetCard>
    </div>
  );
}
