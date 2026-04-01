'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GitCompare, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

export default function SnapshotComparePage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [id1, setId1] = useState('');
  const [id2, setId2] = useState('');

  const { data: snapshots } = useQuery({
    queryKey: ['snapshots', selectedConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/snapshots?connection_id=${selectedConnectionId}&limit=50`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedConnectionId,
  });

  const { data: comparison, isLoading: comparing, refetch } = useQuery({
    queryKey: ['snapshot-compare', id1, id2],
    queryFn: async () => {
      const res = await fetch(`/api/snapshots/compare?id1=${id1}&id2=${id2}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: false,
  });

  const snapshotList = snapshots?.data || [];
  const cmp = comparison?.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><GitCompare className="h-6 w-6" /> 스냅샷 비교</h1>
        <p className="text-muted-foreground">두 스냅샷 간 성능 델타를 비교합니다</p>
      </div>

      <Card>
        <CardContent className="pt-4 flex items-end gap-4">
          <div className="flex-1 space-y-1">
            <label className="text-sm font-medium">스냅샷 A (Before)</label>
            <Select value={id1} onValueChange={setId1}>
              <SelectTrigger><SelectValue placeholder="선택..." /></SelectTrigger>
              <SelectContent>
                {snapshotList.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>#{s.snapshotNumber} - {new Date(s.createdAt).toLocaleString('ko-KR')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground mb-2" />
          <div className="flex-1 space-y-1">
            <label className="text-sm font-medium">스냅샷 B (After)</label>
            <Select value={id2} onValueChange={setId2}>
              <SelectTrigger><SelectValue placeholder="선택..." /></SelectTrigger>
              <SelectContent>
                {snapshotList.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>#{s.snapshotNumber} - {new Date(s.createdAt).toLocaleString('ko-KR')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => refetch()} disabled={!id1 || !id2 || id1 === id2 || comparing}>비교</Button>
        </CardContent>
      </Card>

      {cmp && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card><CardContent className="pt-4 text-center">
              <div className="text-xs text-muted-foreground">총 쿼리</div>
              <div className="text-xl font-bold">{cmp.summary.totalQueries}</div>
            </CardContent></Card>
            <Card className="border-red-200"><CardContent className="pt-4 text-center">
              <div className="text-xs text-red-600">성능 악화</div>
              <div className="text-xl font-bold text-red-600">{cmp.summary.degraded}</div>
            </CardContent></Card>
            <Card className="border-green-200"><CardContent className="pt-4 text-center">
              <div className="text-xs text-green-600">성능 개선</div>
              <div className="text-xl font-bold text-green-600">{cmp.summary.improved}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 text-center">
              <div className="text-xs text-muted-foreground">신규 쿼리</div>
              <div className="text-xl font-bold">{cmp.summary.newQueries}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 text-center">
              <div className="text-xs text-muted-foreground">제거 쿼리</div>
              <div className="text-xl font-bold">{cmp.summary.removedQueries}</div>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">쿼리별 비교 (성능 악화순)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Query</TableHead>
                      <TableHead className="text-right">Before Time</TableHead>
                      <TableHead className="text-right">After Time</TableHead>
                      <TableHead className="text-right">Delta</TableHead>
                      <TableHead className="text-right">Before Calls</TableHead>
                      <TableHead className="text-right">After Calls</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cmp.comparison.slice(0, 50).map((c: any) => (
                      <TableRow key={c.queryid} className={(c.execTimeDelta || 0) > 0 ? 'bg-red-50' : (c.execTimeDelta || 0) < 0 ? 'bg-green-50' : ''}>
                        <TableCell className="max-w-[300px]">
                          <div className="font-mono text-xs truncate" title={c.query}>{c.query}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{c.snap1?.totalExecTime?.toFixed(1) ?? '-'}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{c.snap2?.totalExecTime?.toFixed(1) ?? '-'}</TableCell>
                        <TableCell className="text-right">
                          {c.execTimeDelta != null && (
                            <Badge variant={c.execTimeDelta > 0 ? 'destructive' : 'default'} className="text-xs font-mono">
                              {c.execTimeDelta > 0 ? '+' : ''}{c.execTimeDelta.toFixed(1)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{c.snap1?.calls?.toLocaleString() ?? '-'}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{c.snap2?.calls?.toLocaleString() ?? '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
