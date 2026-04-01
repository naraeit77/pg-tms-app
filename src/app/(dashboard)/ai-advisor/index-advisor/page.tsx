'use client';

import { useMutation } from '@tanstack/react-query';
import { Search, Loader2, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

export default function IndexAdvisorPage() {
  const { selectedConnectionId } = useSelectedDatabase();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ai/index-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: selectedConnectionId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
  });

  const result = mutation.data?.data;
  const parsed = result?.parsed;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Search className="h-6 w-6" /> AI 인덱스 추천</h1>
          <p className="text-muted-foreground">테이블 통계 + Top SQL 분석 기반 인덱스 최적화 권고</p>
        </div>
        <Button onClick={() => mutation.mutate()} disabled={!selectedConnectionId || mutation.isPending}>
          {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          인덱스 분석
        </Button>
      </div>

      {mutation.isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-red-700 text-sm">{(mutation.error as Error).message}</CardContent>
        </Card>
      )}

      {parsed ? (
        <div className="space-y-4">
          {parsed.missingIndexes?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  누락된 인덱스 <Badge className="bg-blue-500 text-white text-xs">{parsed.missingIndexes.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {parsed.missingIndexes.map((idx: any, i: number) => (
                  <div key={i} className="border rounded p-3 space-y-1">
                    <pre className="font-mono text-xs bg-blue-50 p-2 rounded">{idx.ddl}</pre>
                    <p className="text-xs text-muted-foreground">{idx.reason}</p>
                    {idx.estimatedImprovement && <Badge variant="outline" className="text-xs text-green-600">{idx.estimatedImprovement}</Badge>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {parsed.unusedIndexes?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  미사용 인덱스 (제거 대상) <Badge variant="destructive" className="text-xs">{parsed.unusedIndexes.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {parsed.unusedIndexes.map((idx: any, i: number) => (
                  <div key={i} className="border border-red-200 rounded p-3 space-y-1">
                    <pre className="font-mono text-xs bg-red-50 p-2 rounded">{idx.ddl}</pre>
                    <p className="text-xs text-muted-foreground">{idx.reason}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {parsed.summary && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm">{parsed.summary}</p>
              </CardContent>
            </Card>
          )}
        </div>
      ) : result?.content ? (
        <Card>
          <CardContent className="pt-4">
            <pre className="font-mono text-xs whitespace-pre-wrap">{result.content}</pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
