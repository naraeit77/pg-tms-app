'use client';

import { useMutation } from '@tanstack/react-query';
import { TrendingUp, Loader2, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

export default function PredictionPage() {
  const { selectedConnectionId } = useSelectedDatabase();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ai/prediction', {
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
          <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="h-6 w-6" /> 성능 예측</h1>
          <p className="text-muted-foreground">스냅샷 트렌드 기반 성능 예측 + 용량 계획</p>
        </div>
        <Button onClick={() => mutation.mutate()} disabled={!selectedConnectionId || mutation.isPending}>
          {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          예측 분석
        </Button>
      </div>

      {mutation.isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-red-700 text-sm">{(mutation.error as Error).message}</CardContent>
        </Card>
      )}

      {result && (
        <>
          {result.trends && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(['cacheHitRatio', 'activeBackends', 'deadlocks', 'txCommitted'] as const).map((metric) => {
                const data = result.trends[metric] || [];
                const latest = data[data.length - 1]?.value;
                const first = data[0]?.value;
                const trend = latest != null && first != null ? latest - first : null;
                const labels: Record<string, string> = {
                  cacheHitRatio: 'Cache Hit %',
                  activeBackends: 'Active Backends',
                  deadlocks: 'Deadlocks',
                  txCommitted: 'Tx Committed',
                };
                return (
                  <Card key={metric}>
                    <CardContent className="pt-4 text-center">
                      <div className="text-xs text-muted-foreground">{labels[metric]}</div>
                      <div className="text-xl font-bold font-mono">{latest ?? '-'}</div>
                      {trend != null && (
                        <div className={`text-xs ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {trend > 0 ? '+' : ''}{typeof trend === 'number' ? trend.toFixed(1) : trend}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground">{data.length} snapshots</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">AI 성능 예측 분석</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="font-mono text-xs whitespace-pre-wrap bg-slate-50 p-4 rounded">{result.content}</pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
