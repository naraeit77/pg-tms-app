'use client';

import { useState, useMemo, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronUp, ChevronDown, ChevronsUpDown, Search } from 'lucide-react';
import { CsvExportButton } from './csv-export-button';
import { ColumnCustomizer, type ColumnDef } from './column-customizer';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  /** Default visible */
  defaultVisible?: boolean;
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  /** Custom cell renderer */
  render?: (value: unknown, row: T, index: number) => ReactNode;
  /** Cell className */
  className?: string;
}

type SortDirection = 'asc' | 'desc' | null;

interface DataTableProps<T extends Record<string, unknown>> {
  data: T[];
  columns: DataTableColumn<T>[];
  /** Unique key for each row */
  rowKey: string;
  /** Whether to show search input */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Fields to search on (defaults to all string columns) */
  searchFields?: string[];
  /** Whether to show CSV export button */
  exportable?: boolean;
  exportFilename?: string;
  /** Whether to show column customizer */
  customizable?: boolean;
  /** Rows per page (0 = no pagination) */
  pageSize?: number;
  /** Row click handler */
  onRowClick?: (row: T) => void;
  /** Active/selected row key */
  activeRowKey?: string;
  /** Empty state message */
  emptyMessage?: string;
  /** Max table height for scrolling */
  maxHeight?: string;
  /** Performance color for text based on value */
  perfColorField?: string;
  /** Table className */
  className?: string;
  /** Extra controls to show in toolbar */
  toolbarExtra?: ReactNode;
  /** Compact row size */
  compact?: boolean;
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  rowKey,
  searchable = false,
  searchPlaceholder = '검색...',
  searchFields,
  exportable = false,
  exportFilename = 'data',
  customizable = false,
  pageSize = 0,
  onRowClick,
  activeRowKey,
  emptyMessage = '데이터가 없습니다.',
  maxHeight,
  className,
  toolbarExtra,
  compact = false,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [page, setPage] = useState(0);
  const [columnDefs, setColumnDefs] = useState<ColumnDef[]>(() =>
    columns.map((col) => ({
      key: col.key,
      label: col.label,
      visible: col.defaultVisible !== false,
    }))
  );

  // Visible columns in order
  const visibleColumns = useMemo(() => {
    const visibleKeys = new Set(columnDefs.filter((c) => c.visible).map((c) => c.key));
    const orderedKeys = columnDefs.filter((c) => c.visible).map((c) => c.key);
    return orderedKeys
      .map((key) => columns.find((c) => c.key === key))
      .filter((c): c is DataTableColumn<T> => c !== undefined && visibleKeys.has(c.key));
  }, [columns, columnDefs]);

  // Search filter
  const filteredData = useMemo(() => {
    if (!search) return data;
    const term = search.toLowerCase();
    const fields = searchFields ?? columns.filter((c) => c.sortable !== false).map((c) => c.key);
    return data.filter((row) =>
      fields.some((key) => {
        const val = row[key];
        return val !== null && val !== undefined && String(val).toLowerCase().includes(term);
      })
    );
  }, [data, search, searchFields, columns]);

  // Sort
  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const cmp = typeof aVal === 'number' && typeof bVal === 'number'
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredData, sortKey, sortDir]);

  // Pagination
  const pagedData = useMemo(() => {
    if (pageSize <= 0) return sortedData;
    const start = page * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, page, pageSize]);

  const totalPages = pageSize > 0 ? Math.ceil(sortedData.length / pageSize) : 1;

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        if (sortDir === 'asc') setSortDir('desc');
        else if (sortDir === 'desc') {
          setSortKey(null);
          setSortDir(null);
        }
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
      setPage(0);
    },
    [sortKey, sortDir]
  );

  const showToolbar = searchable || exportable || customizable || toolbarExtra;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Toolbar */}
      {showToolbar && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {searchable && (
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  className="pl-9 h-8 w-[200px] text-sm"
                />
              </div>
            )}
            {toolbarExtra}
          </div>
          <div className="flex items-center gap-2">
            {customizable && (
              <ColumnCustomizer columns={columnDefs} onColumnsChange={setColumnDefs} />
            )}
            {exportable && (
              <CsvExportButton
                data={sortedData}
                filename={exportFilename}
                columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              />
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div
        className={cn('rounded-md border border-border/50 overflow-auto', maxHeight && 'overflow-y-auto')}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="hover:bg-transparent border-border/50">
              {visibleColumns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    'text-xs font-semibold text-muted-foreground whitespace-nowrap select-none',
                    col.sortable !== false && 'cursor-pointer hover:text-foreground',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right',
                    compact ? 'py-1.5 px-2' : 'py-2 px-3'
                  )}
                  style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && (
                      sortKey === col.key ? (
                        sortDir === 'asc' ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-30" />
                      )
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleColumns.length}
                  className="text-center text-muted-foreground py-8"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              pagedData.map((row, index) => (
                <TableRow
                  key={String(row[rowKey])}
                  className={cn(
                    'border-border/30',
                    onRowClick && 'cursor-pointer',
                    activeRowKey && String(row[rowKey]) === activeRowKey && 'bg-primary/5'
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {visibleColumns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        'text-sm',
                        col.align === 'center' && 'text-center',
                        col.align === 'right' && 'text-right',
                        compact ? 'py-1 px-2' : 'py-1.5 px-3',
                        col.className
                      )}
                    >
                      {col.render
                        ? col.render(row[col.key], row, index)
                        : row[col.key] !== null && row[col.key] !== undefined
                          ? String(row[col.key])
                          : '-'}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pageSize > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {sortedData.length}건 중 {page * pageSize + 1}–
            {Math.min((page + 1) * pageSize, sortedData.length)}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              이전
            </Button>
            <span className="px-2">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
            >
              다음
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
