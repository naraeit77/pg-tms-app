'use client';

/**
 * Oracle-style Execution Plan Tree Table
 * PostgreSQL EXPLAIN (FORMAT JSON) 결과를 Oracle DBMS_XPLAN.DISPLAY 스타일로 표시
 */

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Alias'?: string;
  'Index Name'?: string;
  'Index Cond'?: string;
  'Filter'?: string;
  'Join Type'?: string;
  'Hash Cond'?: string;
  'Merge Cond'?: string;
  'Startup Cost'?: number;
  'Total Cost'?: number;
  'Plan Rows'?: number;
  'Plan Width'?: number;
  'Actual Startup Time'?: number;
  'Actual Total Time'?: number;
  'Actual Rows'?: number;
  'Actual Loops'?: number;
  'Shared Hit Blocks'?: number;
  'Shared Read Blocks'?: number;
  'Sort Key'?: string[];
  'Sort Method'?: string;
  'Group Key'?: string[];
  'Output'?: string[];
  'Workers Planned'?: number;
  'Workers Launched'?: number;
  Plans?: PlanNode[];
  [key: string]: any;
}

interface FlatRow {
  id: number;
  depth: number;
  node: PlanNode;
  operation: string;
  object: string;
  costPct: number;
}

interface ExplainPlanTreeProps {
  plan: any;
  className?: string;
}

function flattenPlan(node: PlanNode, depth: number, rows: FlatRow[], maxCost: { value: number }): void {
  const totalCost = node['Total Cost'] || 0;
  if (totalCost > maxCost.value) maxCost.value = totalCost;

  // Build operation string (Oracle style with indentation)
  let operation = node['Node Type'] || 'Unknown';
  if (node['Join Type']) operation = `${node['Join Type']} ${operation}`;
  if (node['Scan Direction'] && node['Scan Direction'] !== 'Forward') {
    operation = `${node['Scan Direction']} ${operation}`;
  }
  if (node['Parallel Aware']) operation = `Parallel ${operation}`;

  // Object name
  let object = '';
  if (node['Relation Name']) {
    object = node['Alias'] && node['Alias'] !== node['Relation Name']
      ? `${node['Relation Name']} (${node['Alias']})`
      : node['Relation Name'];
  }
  if (node['Index Name']) {
    object = object ? `${object} → ${node['Index Name']}` : node['Index Name'];
  }
  if (node['CTE Name']) {
    object = node['CTE Name'];
  }
  if (node['Function Name']) {
    object = node['Function Name'];
  }

  rows.push({
    id: rows.length,
    depth,
    node,
    operation,
    object,
    costPct: 0, // calculated after
  });

  if (node.Plans) {
    for (const child of node.Plans) {
      flattenPlan(child, depth + 1, rows, maxCost);
    }
  }
}

function getAccessInfo(node: PlanNode): string {
  const parts: string[] = [];
  if (node['Index Cond']) parts.push(`Idx: ${node['Index Cond']}`);
  if (node['Filter']) parts.push(`Filter: ${node['Filter']}`);
  if (node['Hash Cond']) parts.push(`Hash: ${node['Hash Cond']}`);
  if (node['Merge Cond']) parts.push(`Merge: ${node['Merge Cond']}`);
  if (node['Sort Key']) parts.push(`Sort: ${node['Sort Key'].join(', ')}`);
  if (node['Group Key']) parts.push(`Group: ${node['Group Key'].join(', ')}`);
  if (node['Recheck Cond']) parts.push(`Recheck: ${node['Recheck Cond']}`);
  return parts.join(' | ');
}

function fmtNum(n: number | undefined): string {
  if (n == null) return '-';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtCost(n: number | undefined): string {
  if (n == null) return '-';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(1);
}

function fmtTime(ms: number | undefined): string {
  if (ms == null) return '-';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(2)}ms`;
}

function CostBar({ pct }: { pct: number }) {
  const color = pct >= 50 ? 'bg-red-500' : pct >= 20 ? 'bg-orange-400' : pct >= 5 ? 'bg-blue-400' : 'bg-emerald-400';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-[50px] h-[6px] bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums w-[32px] text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

export function ExplainPlanTree({ plan, className }: ExplainPlanTreeProps) {
  const [expandedInfo, setExpandedInfo] = useState<Set<number>>(new Set());

  const { rows, isAnalyze, planningTime, executionTime } = useMemo(() => {
    if (!plan) return { rows: [], isAnalyze: false, planningTime: undefined, executionTime: undefined };

    // Handle various plan formats
    let rootPlan: PlanNode;
    let planObj = plan;
    if (Array.isArray(planObj)) planObj = planObj[0];
    if (planObj?.Plan) {
      rootPlan = planObj.Plan;
    } else if (planObj?.['Node Type']) {
      rootPlan = planObj;
    } else {
      return { rows: [], isAnalyze: false, planningTime: undefined, executionTime: undefined };
    }

    const isAnalyze = rootPlan['Actual Total Time'] != null;
    const flatRows: FlatRow[] = [];
    const maxCost = { value: 0 };
    flattenPlan(rootPlan, 0, flatRows, maxCost);

    // Calculate cost percentage relative to root total cost
    const rootCost = rootPlan['Total Cost'] || 1;
    for (const row of flatRows) {
      const nodeCost = (row.node['Total Cost'] || 0) -
        (row.node.Plans?.reduce((sum, c) => sum + (c['Total Cost'] || 0), 0) || 0);
      row.costPct = Math.max(0, (nodeCost / rootCost) * 100);
    }

    return {
      rows: flatRows,
      isAnalyze,
      planningTime: planObj?.['Planning Time'],
      executionTime: planObj?.['Execution Time'],
    };
  }, [plan]);

  if (rows.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground text-center py-4', className)}>
        실행계획 데이터가 없습니다
      </div>
    );
  }

  const toggleInfo = (id: number) => {
    setExpandedInfo(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className={cn('overflow-auto', className)}>
      {/* Summary bar */}
      {(planningTime != null || executionTime != null) && (
        <div className="flex items-center gap-4 px-3 py-1.5 bg-muted/50 border-b border-border text-[11px] text-muted-foreground">
          {planningTime != null && <span>Planning: <strong className="text-foreground">{fmtTime(planningTime)}</strong></span>}
          {executionTime != null && <span>Execution: <strong className="text-foreground">{fmtTime(executionTime)}</strong></span>}
          {isAnalyze && <span className="ml-auto text-[10px] text-emerald-600 font-medium">ANALYZE</span>}
        </div>
      )}

      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/30 border-b border-border">
            <th className="text-center px-2 py-1.5 font-medium text-muted-foreground w-8">#</th>
            <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Operation</th>
            <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-[140px]">Object</th>
            <th className="text-right px-2 py-1.5 font-medium text-muted-foreground w-[60px]">Rows</th>
            <th className="text-right px-2 py-1.5 font-medium text-muted-foreground w-[50px]">Width</th>
            <th className="text-right px-2 py-1.5 font-medium text-muted-foreground w-[65px]">Cost</th>
            <th className="text-left px-2 py-1.5 font-medium text-muted-foreground w-[90px]">Cost %</th>
            {isAnalyze && (
              <>
                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground w-[60px]">A-Rows</th>
                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground w-[65px]">A-Time</th>
                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground w-[50px]">Loops</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const info = getAccessInfo(row.node);
            const isInfoOpen = expandedInfo.has(row.id);
            const hasWarning = row.node['Node Type']?.includes('Seq Scan') && (row.node['Plan Rows'] || 0) > 1000;

            return (
              <tr
                key={row.id}
                className={cn(
                  'border-b border-border/30 hover:bg-muted/20 cursor-pointer',
                  hasWarning && 'bg-orange-50'
                )}
                onClick={() => info && toggleInfo(row.id)}
              >
                <td className="text-center px-2 py-1.5 font-mono text-muted-foreground">{row.id}</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center">
                    {/* Tree indentation */}
                    <span style={{ width: row.depth * 16 }} className="flex-shrink-0" />
                    {info ? (
                      isInfoOpen
                        ? <ChevronDown className="h-3 w-3 text-muted-foreground mr-1 flex-shrink-0" />
                        : <ChevronRight className="h-3 w-3 text-muted-foreground mr-1 flex-shrink-0" />
                    ) : (
                      <span className="w-4 mr-1 flex-shrink-0" />
                    )}
                    <span className={cn(
                      'font-medium',
                      hasWarning && 'text-orange-600',
                      row.node['Node Type']?.includes('Index') && 'text-emerald-600',
                    )}>
                      {row.operation}
                    </span>
                    {hasWarning && <AlertTriangle className="h-3 w-3 text-orange-500 ml-1" />}
                    {row.node['Workers Planned'] && (
                      <span className="ml-1.5 text-[9px] bg-blue-100 text-blue-600 px-1 py-0 rounded">
                        {row.node['Workers Launched'] ?? row.node['Workers Planned']}W
                      </span>
                    )}
                  </div>
                  {/* Expanded access info */}
                  {isInfoOpen && info && (
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground" style={{ marginLeft: row.depth * 16 + 20 }}>
                      {info}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground truncate max-w-[140px]" title={row.object}>
                  {row.object || '-'}
                </td>
                <td className="text-right px-2 py-1.5 font-mono">{fmtNum(row.node['Plan Rows'])}</td>
                <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">{row.node['Plan Width'] ?? '-'}</td>
                <td className="text-right px-2 py-1.5 font-mono">{fmtCost(row.node['Total Cost'])}</td>
                <td className="px-2 py-1.5"><CostBar pct={row.costPct} /></td>
                {isAnalyze && (
                  <>
                    <td className="text-right px-2 py-1.5 font-mono">
                      {row.node['Actual Rows'] != null ? fmtNum(row.node['Actual Rows']) : '-'}
                    </td>
                    <td className="text-right px-2 py-1.5 font-mono">
                      {row.node['Actual Total Time'] != null ? fmtTime(row.node['Actual Total Time']) : '-'}
                    </td>
                    <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">
                      {row.node['Actual Loops'] ?? '-'}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
