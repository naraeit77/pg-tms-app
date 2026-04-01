'use client';

import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

export default function TuningHistoryPage() {
  const { selectedConnectionId } = useSelectedDatabase();

  const { data, isLoading } = useQuery({
    queryKey: ['tuning-tasks', selectedConnectionId],
    queryFn: async () => {
      const params = selectedConnectionId ? `?connection_id=${selectedConnectionId}` : '';
      const res = await fetch(`/api/tuning${params}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const completed = (data?.data || []).filter((t: any) => t.status === 'COMPLETED');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><History className="h-6 w-6" /> 튜닝 이력</h1>
        <p className="text-muted-foreground">완료된 튜닝 {completed.length}건</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>QueryID</TableHead>
                <TableHead>SQL</TableHead>
                <TableHead className="text-right">Before(ms)</TableHead>
                <TableHead className="text-right">After(ms)</TableHead>
                <TableHead className="text-right">개선율</TableHead>
                <TableHead>완료일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">로딩 중...</TableCell></TableRow>
              ) : completed.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">완료된 튜닝이 없습니다</TableCell></TableRow>
              ) : (
                completed.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.queryid}</TableCell>
                    <TableCell className="max-w-[300px]"><div className="font-mono text-xs truncate">{t.sqlText}</div></TableCell>
                    <TableCell className="text-right font-mono text-xs">{t.beforeMeanExecTime?.toFixed(2) ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{t.afterMeanExecTime?.toFixed(2) ?? '-'}</TableCell>
                    <TableCell className="text-right">
                      {t.improvementPct != null && (
                        <Badge variant="default" className="text-xs bg-green-500">{t.improvementPct.toFixed(1)}%</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{t.completedAt ? new Date(t.completedAt).toLocaleDateString('ko-KR') : '-'}</TableCell>
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
