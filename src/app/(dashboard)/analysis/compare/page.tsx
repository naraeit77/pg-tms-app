'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { GitCompare, Play, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

function PlanSummary({ plan, label }: { plan: any; label: string }) {
  if (!plan) return null;
  const node = plan.Plan || plan;
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-sm">{label}</h3>
      <div className="bg-slate-50 p-3 rounded text-xs font-mono space-y-1">
        <div>Node Type: <Badge variant="outline" className="text-xs">{node['Node Type']}</Badge></div>
        <div>Total Cost: {node['Total Cost']?.toFixed(1)}</div>
        {plan['Planning Time'] != null && <div>Planning: {plan['Planning Time']?.toFixed(2)}ms</div>}
        {plan['Execution Time'] != null && <div>Execution: {plan['Execution Time']?.toFixed(2)}ms</div>}
        {node['Actual Rows'] != null && <div>Actual Rows: {node['Actual Rows']?.toLocaleString()}</div>}
        {node['Shared Hit Blocks'] != null && <div>Shared Hit: {node['Shared Hit Blocks']?.toLocaleString()}</div>}
        {node['Shared Read Blocks'] != null && <div>Shared Read: {node['Shared Read Blocks']?.toLocaleString()}</div>}
      </div>
    </div>
  );
}

export default function ComparePage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [sql1, setSql1] = useState('');
  const [sql2, setSql2] = useState('');
  const [results, setResults] = useState<{ plan1: any; plan2: any } | null>(null);

  const compareMutation = useMutation({
    mutationFn: async () => {
      const [res1, res2] = await Promise.all([
        fetch('/api/pg/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connection_id: selectedConnectionId, sql: sql1.trim(), analyze: true }),
        }),
        fetch('/api/pg/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connection_id: selectedConnectionId, sql: sql2.trim(), analyze: true }),
        }),
      ]);

      const [data1, data2] = await Promise.all([res1.json(), res2.json()]);
      if (!res1.ok) throw new Error(data1.error);
      if (!res2.ok) throw new Error(data2.error);
      return { plan1: data1.data, plan2: data2.data };
    },
    onSuccess: (data) => setResults(data),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><GitCompare className="h-6 w-6" /> 실행계획 비교</h1>
        <p className="text-muted-foreground">두 SQL의 실행계획을 나란히 비교합니다 (ANALYZE 모드)</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">SQL A (Before)</CardTitle></CardHeader>
          <CardContent>
            <Textarea placeholder="원래 SQL..." value={sql1} onChange={(e) => setSql1(e.target.value)} className="font-mono text-sm min-h-[100px]" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">SQL B (After)</CardTitle></CardHeader>
          <CardContent>
            <Textarea placeholder="개선된 SQL..." value={sql2} onChange={(e) => setSql2(e.target.value)} className="font-mono text-sm min-h-[100px]" />
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center">
        <Button
          onClick={() => compareMutation.mutate()}
          disabled={!sql1.trim() || !sql2.trim() || !selectedConnectionId || compareMutation.isPending}
        >
          {compareMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          비교 실행
        </Button>
      </div>

      {compareMutation.isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-red-700 text-sm">{(compareMutation.error as Error).message}</CardContent>
        </Card>
      )}

      {results && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-4">
                <PlanSummary plan={results.plan1.plan} label="Plan A (Before)" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <PlanSummary plan={results.plan2.plan} label="Plan B (After)" />
              </CardContent>
            </Card>
          </div>

          {results.plan1.executionTimeMs != null && results.plan2.executionTimeMs != null && (
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center justify-center gap-8">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Before</div>
                    <div className="text-xl font-bold font-mono">{results.plan1.executionTimeMs.toFixed(2)}ms</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl">→</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">After</div>
                    <div className="text-xl font-bold font-mono">{results.plan2.executionTimeMs.toFixed(2)}ms</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">개선율</div>
                    <Badge variant={results.plan2.executionTimeMs < results.plan1.executionTimeMs ? 'default' : 'destructive'} className="text-base">
                      {((1 - results.plan2.executionTimeMs / results.plan1.executionTimeMs) * 100).toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Raw JSON A</CardTitle></CardHeader>
              <CardContent>
                <pre className="font-mono text-xs bg-slate-50 p-3 rounded overflow-auto max-h-[300px]">{results.plan1.rawJson}</pre>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Raw JSON B</CardTitle></CardHeader>
              <CardContent>
                <pre className="font-mono text-xs bg-slate-50 p-3 rounded overflow-auto max-h-[300px]">{results.plan2.rawJson}</pre>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
