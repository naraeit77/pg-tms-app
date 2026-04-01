'use client';

/**
 * DB 파라미터 (Database Parameters)
 * WhaTap /postgresql/analysis-databaseparameter 스타일
 * PG 파라미터 조회 + 변경사항 하이라이트
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
import { RefreshCw, AlertTriangle } from 'lucide-react';

const categories = [
  { key: 'all', label: '전체' },
  { key: 'memory', label: '메모리' },
  { key: 'wal', label: 'WAL/복제' },
  { key: 'autovacuum', label: 'Autovacuum' },
  { key: 'connections', label: '연결' },
  { key: 'query', label: '쿼리/플래너' },
  { key: 'logging', label: '로깅' },
];

export default function ParametersPage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [category, setCategory] = useState('all');
  const [showChangedOnly, setShowChangedOnly] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['parameters', selectedConnectionId, category],
    queryFn: async () => {
      const res = await fetch(`/api/analysis/parameters?connection_id=${selectedConnectionId}&category=${category}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedConnectionId,
  });

  const parameters = data?.data?.parameters || [];
  const changedCount = data?.data?.changedCount || 0;

  const displayData = showChangedOnly
    ? parameters.filter((p: any) => p.setting !== p.boot_val && p.boot_val !== null)
    : parameters;

  const columns: DataTableColumn<any>[] = [
    {
      key: 'name', label: '파라미터', width: 240,
      render: (v, row: any) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs">{String(v)}</span>
          {row.setting !== row.boot_val && row.boot_val !== null && (
            <AlertTriangle className="h-3 w-3 text-orange-400 shrink-0" />
          )}
          {row.pending_restart && (
            <Badge className="text-[8px] px-1 py-0 bg-red-600">restart</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'setting', label: '현재 값', width: 150,
      render: (v, row: any) => (
        <span className={cn('font-mono text-xs',
          row.setting !== row.boot_val && row.boot_val !== null ? 'text-orange-400 font-bold' : ''
        )}>
          {String(v)}{row.unit ? ` ${row.unit}` : ''}
        </span>
      ),
    },
    {
      key: 'boot_val', label: '기본값', width: 120,
      render: (v, row: any) => <span className="font-mono text-xs text-muted-foreground">{String(v ?? '-')}{row.unit ? ` ${row.unit}` : ''}</span>,
    },
    { key: 'context', label: 'Context', width: 90, render: (v) => <span className="text-[11px]">{String(v)}</span> },
    { key: 'source', label: 'Source', width: 100, render: (v) => <span className="text-[11px]">{String(v)}</span> },
    { key: 'category', label: '카테고리', width: 180, defaultVisible: false, render: (v) => <span className="text-[11px]">{String(v)}</span> },
    { key: 'short_desc', label: '설명', render: (v) => <span className="text-[11px] text-muted-foreground">{String(v)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">DB 파라미터</h1>
          <Badge variant="outline" className="text-xs">{parameters.length}개</Badge>
          {changedCount > 0 && (
            <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-400 gap-1">
              <AlertTriangle className="h-3 w-3" />
              {changedCount}개 변경됨
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showChangedOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowChangedOnly(!showChangedOnly)}
            className="text-xs"
          >
            변경사항만 보기
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Category Tabs */}
      <Tabs value={category} onValueChange={setCategory}>
        <TabsList className="h-8 flex-wrap">
          {categories.map((c) => (
            <TabsTrigger key={c.key} value={c.key} className="text-xs">{c.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Parameters Table */}
      <WidgetCard title={`파라미터 목록 (${displayData.length}건)`} fullscreenable>
        <DataTable
          data={displayData}
          columns={columns as any}
          rowKey="name"
          searchable
          searchPlaceholder="파라미터 검색..."
          searchFields={['name', 'setting', 'short_desc', 'category']}
          exportable
          exportFilename="pg-parameters"
          customizable
          pageSize={30}
          compact
          emptyMessage={isLoading ? '파라미터 로딩 중...' : '파라미터가 없습니다'}
        />
      </WidgetCard>
    </div>
  );
}
