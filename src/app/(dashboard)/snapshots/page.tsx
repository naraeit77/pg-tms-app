'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Plus, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

export default function SnapshotsPage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['snapshots', selectedConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/snapshots?connection_id=${selectedConnectionId}&limit=50`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedConnectionId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: selectedConnectionId }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['snapshots', selectedConnectionId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/snapshots/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['snapshots', selectedConnectionId] }),
  });

  const rows = data?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Camera className="h-6 w-6" /> 스냅샷</h1>
          <p className="text-muted-foreground">성능 데이터 스냅샷 ({rows.length}개)</p>
        </div>
        <Button onClick={() => createMutation.mutate()} disabled={!selectedConnectionId || createMutation.isPending}>
          {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          스냅샷 생성
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>생성 시각</TableHead>
                <TableHead className="text-right">Cache Hit%</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Tx Committed</TableHead>
                <TableHead className="text-right">Deadlocks</TableHead>
                <TableHead className="text-right">소요 시간</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8">로딩 중...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8">스냅샷이 없습니다</TableCell></TableRow>
              ) : (
                rows.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.snapshotNumber}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === 'COMPLETED' ? 'default' : 'destructive'} className="text-xs">
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{new Date(s.createdAt).toLocaleString('ko-KR')}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{s.cacheHitRatio ?? '-'}%</TableCell>
                    <TableCell className="text-right font-mono text-xs">{s.activeBackends ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{s.txCommitted?.toLocaleString() ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{s.deadlocks ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{s.durationMs ?? '-'}ms</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500"
                        onClick={() => { if (confirm('삭제하시겠습니까?')) deleteMutation.mutate(s.id); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
