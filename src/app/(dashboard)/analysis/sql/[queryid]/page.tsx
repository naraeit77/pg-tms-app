'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Code2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { ExplainPlanTree } from '@/components/charts/explain-plan-tree';

export default function SqlDetailPage({ params }: { params: Promise<{ queryid: string }> }) {
  const { queryid } = use(params);
  const searchParams = useSearchParams();
  const { selectedConnectionId } = useSelectedDatabase();
  // URL의 connection_id 우선, 없으면 전역 선택된 연결 사용
  const connectionId = searchParams.get('connection_id') || selectedConnectionId;

  const { data, isLoading } = useQuery({
    queryKey: ['sql-detail', connectionId, queryid],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring/sql-detail?connection_id=${connectionId}&queryid=${queryid}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!connectionId && !!queryid,
  });

  const current = data?.data?.current;
  const history = data?.data?.history || [];

  // Auto EXPLAIN — $1, $2 등 파라미터를 NULL로 치환
  const { data: explainData } = useQuery({
    queryKey: ['sql-explain', connectionId, current?.query],
    queryFn: async () => {
      const explainSql = current.query.replace(/\$\d+/g, 'NULL');
      const res = await fetch('/api/pg/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId, sql: explainSql, analyze: false }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.success ? json.data : null;
    },
    enabled: !!connectionId && !!current?.query,
    retry: false,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Code2 className="h-6 w-6" /> SQL 상세</h1>
        <p className="text-muted-foreground">queryid: {queryid}</p>
      </div>

      {isLoading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">로딩 중...</CardContent></Card>
      ) : !current ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">해당 queryid를 찾을 수 없습니다</CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">SQL 텍스트</CardTitle></CardHeader>
            <CardContent>
              <pre className="font-mono text-xs bg-slate-50 p-4 rounded overflow-auto max-h-[200px] whitespace-pre-wrap">{current.query}</pre>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Calls</div>
                <div className="text-xl font-bold font-mono">{current.calls?.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Total Exec Time</div>
                <div className="text-xl font-bold font-mono">{current.total_exec_time?.toFixed(1)}ms</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Mean Exec Time</div>
                <div className="text-xl font-bold font-mono">{current.mean_exec_time?.toFixed(2)}ms</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Rows</div>
                <div className="text-xl font-bold font-mono">{current.rows?.toLocaleString()}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Shared Blks Hit</div>
                <div className="text-lg font-bold font-mono">{current.shared_blks_hit?.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Shared Blks Read</div>
                <div className="text-lg font-bold font-mono">{current.shared_blks_read?.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Temp Blks R/W</div>
                <div className="text-lg font-bold font-mono">{current.temp_blks_read?.toLocaleString()} / {current.temp_blks_written?.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">User</div>
                <div className="text-lg font-bold">{current.username}</div>
              </CardContent>
            </Card>
          </div>

          {explainData?.plan && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">실행계획 (Execution Plan)</CardTitle></CardHeader>
              <CardContent className="p-0">
                <ExplainPlanTree plan={explainData.plan} />
              </CardContent>
            </Card>
          )}

          {history.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">실행 이력</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>수집 시각</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Total Time</TableHead>
                      <TableHead className="text-right">Mean Time</TableHead>
                      <TableHead className="text-right">Rows</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((h: any) => (
                      <TableRow key={h.id}>
                        <TableCell className="text-xs">{new Date(h.collectedAt).toLocaleString('ko-KR')}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{h.calls?.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{h.totalExecTime?.toFixed(1)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{h.meanExecTime?.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{h.rows?.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
