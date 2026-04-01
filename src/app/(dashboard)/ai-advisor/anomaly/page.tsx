'use client';

import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

export default function AnomalyPage() {
  const { selectedConnectionId } = useSelectedDatabase();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ai/anomaly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: selectedConnectionId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
  });

  const result = mutation.data?.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><AlertTriangle className="h-6 w-6" /> 이상 탐지</h1>
          <p className="text-muted-foreground">스냅샷 히스토리 기반 Z-Score 이상 탐지 + AI 원인 분석</p>
        </div>
        <Button onClick={() => mutation.mutate()} disabled={!selectedConnectionId || mutation.isPending}>
          {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          이상 탐지 실행
        </Button>
      </div>

      {mutation.isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-red-700 text-sm">{(mutation.error as Error).message}</CardContent>
        </Card>
      )}

      {result && (
        <>
          {result.message && (
            <Card><CardContent className="py-4 text-muted-foreground text-sm">{result.message}</CardContent></Card>
          )}

          {result.anomalies?.length > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {result.anomalies.map((a: any) => (
                  <Card key={a.metric} className={a.severity === 'CRITICAL' ? 'border-red-300 bg-red-50' : 'border-yellow-300 bg-yellow-50'}>
                    <CardContent className="pt-4 text-center">
                      <Badge variant={a.severity === 'CRITICAL' ? 'destructive' : 'secondary'} className="text-xs mb-2">
                        {a.severity}
                      </Badge>
                      <div className="text-sm font-medium">{a.metric}</div>
                      <div className="text-2xl font-bold font-mono">{a.current}</div>
                      <div className="text-xs text-muted-foreground">
                        평균: {a.mean} | Z-Score: {a.zScore}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {result.aiAnalysis && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">AI 원인 분석</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="font-mono text-xs whitespace-pre-wrap bg-slate-50 p-4 rounded">{result.aiAnalysis}</pre>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : result.anomalies && result.anomalies.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <div className="text-green-500 text-4xl mb-2">✓</div>
                <p className="text-lg font-medium">이상 없음</p>
                <p className="text-muted-foreground text-sm">모든 메트릭이 정상 범위입니다 (Z-Score &lt; 2)</p>
                <p className="text-xs text-muted-foreground mt-2">분석된 스냅샷: {result.snapshotCount}개</p>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
