'use client';

import { useQuery } from '@tanstack/react-query';
import { Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import Link from 'next/link';

const statusLabels: Record<string, { label: string; color: string }> = {
  IDENTIFIED: { label: '식별', color: 'bg-blue-500' },
  ASSIGNED: { label: '할당', color: 'bg-yellow-500' },
  IN_PROGRESS: { label: '진행중', color: 'bg-orange-500' },
  REVIEW: { label: '검토', color: 'bg-purple-500' },
  COMPLETED: { label: '완료', color: 'bg-green-500' },
  CANCELLED: { label: '취소', color: 'bg-slate-400' },
};

export default function TuningDashboardPage() {
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

  const tasks = data?.data || [];
  const statusCounts = tasks.reduce((acc: Record<string, number>, t: any) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="h-6 w-6" /> 튜닝 대시보드</h1>
          <p className="text-muted-foreground">총 {tasks.length}건</p>
        </div>
        <Link href="/tuning/register">
          <Badge className="cursor-pointer bg-slate-900 text-white hover:bg-slate-700 px-4 py-2">+ SQL 등록</Badge>
        </Link>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {Object.entries(statusLabels).map(([key, { label, color }]) => (
          <Card key={key}>
            <CardContent className="pt-3 pb-3 text-center">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-xl font-bold">{statusCounts[key] || 0}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>QueryID</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>우선순위</TableHead>
                <TableHead>SQL</TableHead>
                <TableHead className="text-right">Before Mean(ms)</TableHead>
                <TableHead className="text-right">After Mean(ms)</TableHead>
                <TableHead className="text-right">개선율</TableHead>
                <TableHead>등록일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8">로딩 중...</TableCell></TableRow>
              ) : tasks.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8">등록된 튜닝 대상이 없습니다</TableCell></TableRow>
              ) : (
                tasks.map((t: any) => {
                  const st = statusLabels[t.status] || { label: t.status, color: 'bg-slate-400' };
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.queryid}</TableCell>
                      <TableCell><Badge className={`${st.color} text-white text-xs`}>{st.label}</Badge></TableCell>
                      <TableCell><Badge variant={t.priority === 'HIGH' ? 'destructive' : t.priority === 'LOW' ? 'secondary' : 'outline'} className="text-xs">{t.priority}</Badge></TableCell>
                      <TableCell className="max-w-[250px]"><div className="font-mono text-xs truncate">{t.sqlText}</div></TableCell>
                      <TableCell className="text-right font-mono text-xs">{t.beforeMeanExecTime?.toFixed(2) ?? '-'}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{t.afterMeanExecTime?.toFixed(2) ?? '-'}</TableCell>
                      <TableCell className="text-right">
                        {t.improvementPct != null && (
                          <Badge variant={t.improvementPct > 0 ? 'default' : 'destructive'} className="text-xs">
                            {t.improvementPct > 0 ? '+' : ''}{t.improvementPct.toFixed(1)}%
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{new Date(t.createdAt).toLocaleDateString('ko-KR')}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
