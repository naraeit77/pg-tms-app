'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Zap, Loader2, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

export default function AutoTuningPage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [topN, setTopN] = useState('5');
  const [orderBy, setOrderBy] = useState('total_exec_time');

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ai/auto-tuning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: selectedConnectionId, top_n: parseInt(topN), order_by: orderBy }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
  });

  const result = mutation.data?.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Zap className="h-6 w-6" /> AI 자동 튜닝</h1>
        <p className="text-muted-foreground">Top-N SQL을 자동 분석하고 튜닝 권고를 생성합니다</p>
      </div>

      <Card>
        <CardContent className="pt-4 flex items-end gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Top N</label>
            <Select value={topN} onValueChange={setTopN}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['3', '5', '10', '20'].map((n) => <SelectItem key={n} value={n}>Top {n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">정렬 기준</label>
            <Select value={orderBy} onValueChange={setOrderBy}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="total_exec_time">Total Exec Time</SelectItem>
                <SelectItem value="calls">Calls</SelectItem>
                <SelectItem value="shared_blks_read">Shared Blks Read</SelectItem>
                <SelectItem value="mean_exec_time">Mean Exec Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => mutation.mutate()} disabled={!selectedConnectionId || mutation.isPending}>
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            자동 분석 실행
          </Button>
        </CardContent>
      </Card>

      {mutation.isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-red-700 text-sm">{(mutation.error as Error).message}</CardContent>
        </Card>
      )}

      {result && (
        <>
          {result.parsed && Array.isArray(result.parsed) ? (
            <div className="space-y-4">
              {result.parsed.map((item: any, i: number) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      queryid: {item.queryid}
                      <Badge variant={item.priority === 'HIGH' ? 'destructive' : item.priority === 'MEDIUM' ? 'secondary' : 'outline'} className="text-xs">
                        {item.priority}
                      </Badge>
                      {item.estimatedImprovement && <Badge variant="outline" className="text-xs text-green-600">{item.estimatedImprovement}</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm">{item.summary}</p>
                    {item.recommendations?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-1">권고사항:</p>
                        <ul className="list-disc list-inside text-xs space-y-0.5">
                          {item.recommendations.map((r: string, j: number) => <li key={j}>{r}</li>)}
                        </ul>
                      </div>
                    )}
                    {item.indexDDL?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-1">인덱스 DDL:</p>
                        {item.indexDDL.map((ddl: string, j: number) => (
                          <pre key={j} className="font-mono text-xs bg-slate-50 p-2 rounded">{ddl}</pre>
                        ))}
                      </div>
                    )}
                    {item.rewrittenSQL && (
                      <div>
                        <p className="text-xs font-medium mb-1">개선된 SQL:</p>
                        <pre className="font-mono text-xs bg-green-50 p-2 rounded">{item.rewrittenSQL}</pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-4">
                <pre className="font-mono text-xs whitespace-pre-wrap">{result.content}</pre>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
