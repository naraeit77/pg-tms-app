'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { GitCompare, Play, Loader2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

const HOTSPOT_TYPES = ['Seq Scan', 'Sort', 'Hash Join', 'Nested Loop'];

function PlanNode({ node, depth = 0 }: { node: any; depth?: number }) {
  if (!node) return null;
  const nodeType = node['Node Type'] || 'Unknown';
  const actualRows = node['Actual Rows'];
  const planRows = node['Plan Rows'];
  const actualTime = node['Actual Total Time'];
  const startupCost = node['Startup Cost'];
  const totalCost = node['Total Cost'];
  const relation = node['Relation Name'];
  const alias = node['Alias'];
  const filter = node['Filter'];
  const indexName = node['Index Name'];
  const joinType = node['Join Type'];
  const sharedHit = node['Shared Hit Blocks'];
  const sharedRead = node['Shared Read Blocks'];
  const isHotspot = HOTSPOT_TYPES.includes(nodeType) && (actualRows > 10000 || totalCost > 1000);

  return (
    <div className="ml-4 border-l-2 border-slate-200 pl-3 py-1">
      <div className={`flex items-start gap-2 text-sm ${isHotspot ? 'bg-red-50 -ml-3 pl-3 py-1 rounded border border-red-200' : ''}`}>
        {isHotspot && <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={isHotspot ? 'destructive' : 'outline'} className="text-xs font-mono">
              {nodeType}
            </Badge>
            {joinType && <Badge variant="secondary" className="text-xs">{joinType}</Badge>}
            {relation && <span className="font-mono text-xs text-blue-600">{relation}{alias && alias !== relation ? ` (${alias})` : ''}</span>}
            {indexName && <span className="font-mono text-xs text-green-600">idx: {indexName}</span>}
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground mt-0.5 flex-wrap">
            {totalCost != null && <span>Cost: {startupCost?.toFixed(1)}..{totalCost?.toFixed(1)}</span>}
            {actualTime != null && <span>Time: {actualTime?.toFixed(2)}ms</span>}
            {planRows != null && <span>Est Rows: {planRows?.toLocaleString()}</span>}
            {actualRows != null && <span>Actual: {actualRows?.toLocaleString()}</span>}
            {sharedHit != null && <span>Hit: {sharedHit?.toLocaleString()}</span>}
            {sharedRead != null && sharedRead > 0 && <span className="text-orange-600">Read: {sharedRead?.toLocaleString()}</span>}
          </div>
          {filter && <div className="text-xs font-mono text-slate-500 mt-0.5 truncate" title={filter}>Filter: {filter}</div>}
        </div>
      </div>
      {node.Plans?.map((child: any, i: number) => (
        <PlanNode key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function ExecutionPlanPage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [sql, setSql] = useState('');
  const [analyze, setAnalyze] = useState(false);
  const [planResult, setPlanResult] = useState<any>(null);

  const explainMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/pg/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
          sql: sql.trim(),
          analyze,
          save: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'EXPLAIN failed');
      }
      return res.json();
    },
    onSuccess: (data) => setPlanResult(data.data),
  });

  const plan = planResult?.plan;
  const planNode = plan?.Plan || plan;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><GitCompare className="h-6 w-6" /> EXPLAIN 뷰어</h1>
        <p className="text-muted-foreground">SQL을 입력하고 실행계획을 분석하세요</p>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <Textarea
            placeholder="SELECT * FROM users WHERE id = 1;"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            className="font-mono text-sm min-h-[120px]"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch id="analyze" checked={analyze} onCheckedChange={setAnalyze} />
                <Label htmlFor="analyze" className="text-sm">ANALYZE (실제 실행)</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {analyze ? '쿼리를 실제 실행합니다 (읽기 전용 트랜잭션 + ROLLBACK)' : 'Plan만 확인합니다 (쿼리 실행 없음)'}
              </p>
            </div>
            <Button
              onClick={() => explainMutation.mutate()}
              disabled={!sql.trim() || !selectedConnectionId || explainMutation.isPending}
            >
              {explainMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              EXPLAIN 실행
            </Button>
          </div>
        </CardContent>
      </Card>

      {explainMutation.isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-red-700 text-sm">
            {(explainMutation.error as Error).message}
          </CardContent>
        </Card>
      )}

      {planNode && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                실행계획 트리
                <div className="flex gap-4 text-xs text-muted-foreground font-normal">
                  {planResult?.planningTimeMs != null && <span>Planning: {planResult.planningTimeMs.toFixed(2)}ms</span>}
                  {planResult?.executionTimeMs != null && <span>Execution: {planResult.executionTimeMs.toFixed(2)}ms</span>}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PlanNode node={planNode} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Raw JSON</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="font-mono text-xs bg-slate-50 p-4 rounded overflow-auto max-h-[400px]">
                {planResult?.rawJson}
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
