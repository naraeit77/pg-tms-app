'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import Link from 'next/link';

export default function SearchPage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['sql-search', selectedConnectionId, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams({ connection_id: selectedConnectionId!, q: searchTerm });
      const res = await fetch(`/api/analysis/search?${params}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedConnectionId && !!searchTerm,
  });

  const rows = data?.data || [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Search className="h-6 w-6" /> SQL 검색</h1>
        <p className="text-muted-foreground">pg_stat_statements에서 SQL 텍스트를 검색합니다</p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="테이블명, 키워드 검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') setSearchTerm(query); }}
          className="flex-1"
        />
        <Button onClick={() => setSearchTerm(query)} disabled={!query.trim()}>
          <Search className="mr-2 h-4 w-4" />검색
        </Button>
      </div>

      {searchTerm && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Query</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Total Time (ms)</TableHead>
                  <TableHead className="text-right">Mean (ms)</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead>User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">검색 중...</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">결과 없음</TableCell></TableRow>
                ) : (
                  rows.map((row: any) => (
                    <TableRow key={row.queryid}>
                      <TableCell className="max-w-[400px]">
                        <Link href={`/analysis/sql/${row.queryid}?connection_id=${selectedConnectionId}`} className="hover:underline">
                          <div className="font-mono text-xs truncate">{row.query}</div>
                          <div className="text-xs text-muted-foreground">queryid: {row.queryid}</div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono">{row.calls?.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{row.total_exec_time?.toFixed(1)}</TableCell>
                      <TableCell className="text-right font-mono">{row.mean_exec_time?.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">{row.rows?.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{row.username}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
