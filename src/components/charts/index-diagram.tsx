'use client';

/**
 * TMS 2.0 스타일 인덱스 생성도 (Index Diagram)
 * sqltms.info 참고 디자인
 *
 * - 테이블을 원형 노드로 표시 (실제 테이블명 명시)
 * - 조인 컬럼 위에 번호 포인트 (파란색=인덱스 있음, 빨간색=없음)
 * - 각 포인트 위에 개별 컬럼명 표시
 * - SVG 실선(INNER JOIN) / 점선(OUTER JOIN) 연결
 * - 접근 방향 화살표
 * - 줌 컨트롤
 */

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { ZoomIn, ZoomOut, Maximize2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ─── Types ─── */

interface ColumnInfo {
  name: string;
  type: string;
  usedIn: string[];
  hasIndex: boolean;
  indexName?: string;
}

interface ExistingIndex {
  name: string;
  columns: string[];
  type: string;
  isUnique: boolean;
  size?: string;
  scanCount?: number;
}

interface TableInfo {
  name: string;
  alias?: string;
  schema?: string;
  columns: ColumnInfo[];
  existingIndexes: ExistingIndex[];
  estimatedRows?: number;
  seqScanCount?: number;
  idxScanCount?: number;
}

interface JoinInfo {
  leftTable: string;
  rightTable: string;
  leftColumn: string;
  rightColumn: string;
  joinType: string;
}

interface IndexRecommendation {
  table: string;
  columns: string[];
  type: string;
  ddl: string;
  reason: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedImprovement: string;
}

export interface IndexDiagramProps {
  tables: TableInfo[];
  joins: JoinInfo[];
  recommendations: IndexRecommendation[];
  onSelectTable?: (table: TableInfo) => void;
  selectedTable?: TableInfo | null;
}

/* ─── Constants ─── */

const CIRCLE_R = 56;
const NODE_SPACING = 230;
const SVG_PADDING_X = 100;
const SVG_PADDING_TOP = 90;
const SVG_HEIGHT = 300;

/* ─── Main Component ─── */

export function IndexDiagram({
  tables,
  joins,
  recommendations,
  onSelectTable,
  selectedTable,
}: IndexDiagramProps) {
  const [zoom, setZoom] = useState(1);

  const svgWidth = useMemo(
    () => Math.max(600, tables.length * NODE_SPACING + SVG_PADDING_X * 2),
    [tables.length]
  );

  // Map table name/alias to index for positioning
  const tablePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; table: TableInfo }>();
    tables.forEach((t, i) => {
      const x = SVG_PADDING_X + i * NODE_SPACING + CIRCLE_R;
      const y = SVG_PADDING_TOP + CIRCLE_R + 20;
      map.set(t.name, { x, y, table: t });
      if (t.alias && t.alias !== t.name) map.set(t.alias, { x, y, table: t });
    });
    return map;
  }, [tables]);

  const findJoinForTable = (tableName: string): JoinInfo | undefined => {
    return joins.find(j =>
      j.leftTable === tableName || j.rightTable === tableName
      || tables.find(t => t.name === tableName)?.alias === j.leftTable
      || tables.find(t => t.name === tableName)?.alias === j.rightTable
    );
  };

  const findJoinBetween = (leftName: string, rightName: string): JoinInfo | undefined => {
    return joins.find(j => {
      const names1 = [leftName, tables.find(t => t.name === leftName)?.alias].filter(Boolean);
      const names2 = [rightName, tables.find(t => t.name === rightName)?.alias].filter(Boolean);
      return (names1.includes(j.leftTable) && names2.includes(j.rightTable))
        || (names2.includes(j.leftTable) && names1.includes(j.rightTable));
    });
  };

  if (tables.length === 0) {
    return <div className="text-center text-muted-foreground py-8">테이블이 감지되지 않았습니다</div>;
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">인덱스 생성도</span>
          <span className="text-xs text-muted-foreground">{tables.length} 테이블</span>
        </div>
        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(z + 0.15, 2))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(z - 0.15, 0.5))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setZoom(1)}>
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Access direction */}
      <div className="flex items-center gap-1.5 px-4 text-xs text-muted-foreground">
        <span>테이블 접근 방향</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </div>

      {/* SVG Diagram */}
      <div className="overflow-auto border border-border rounded-lg bg-white dark:bg-slate-950">
        <svg
          width={svgWidth * zoom}
          height={SVG_HEIGHT * zoom}
          viewBox={`0 0 ${svgWidth} ${SVG_HEIGHT}`}
          className="select-none"
        >
          {/* Join lines between consecutive tables */}
          {tables.map((table, idx) => {
            if (idx === 0) return null;
            const prevTable = tables[idx - 1];
            const join = findJoinBetween(prevTable.name, table.name);
            const x1 = SVG_PADDING_X + (idx - 1) * NODE_SPACING + CIRCLE_R + CIRCLE_R;
            const x2 = SVG_PADDING_X + idx * NODE_SPACING;
            const y = SVG_PADDING_TOP + CIRCLE_R + 20;
            const isOuter = join?.joinType?.toUpperCase().includes('LEFT')
              || join?.joinType?.toUpperCase().includes('RIGHT')
              || join?.joinType?.toUpperCase().includes('FULL')
              || join?.joinType?.toUpperCase().includes('OUTER');

            // Join column labels on the line
            const midX = (x1 + x2 + CIRCLE_R) / 2;

            return (
              <g key={`line-${idx}`}>
                <line
                  x1={x1}
                  y1={y}
                  x2={x2 + CIRCLE_R}
                  y2={y}
                  stroke="#9ca3af"
                  strokeWidth={1.5}
                  strokeDasharray={isOuter ? '6 4' : undefined}
                />
                {/* Join column text on line */}
                {join && (
                  <text
                    x={midX}
                    y={y - 8}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#6b7280"
                    className="font-mono"
                  >
                    {join.leftColumn} = {join.rightColumn}
                  </text>
                )}
              </g>
            );
          })}

          {/* Table nodes */}
          {tables.map((table, idx) => {
            const cx = SVG_PADDING_X + idx * NODE_SPACING + CIRCLE_R;
            const cy = SVG_PADDING_TOP + CIRCLE_R + 20;
            const hasIdx = table.existingIndexes.length > 0;
            const isSelected = selectedTable?.name === table.name;
            const usedCols = table.columns.filter(c => c.usedIn.some(u => u !== 'select'));

            // Join type for this table
            const tableJoin = findJoinForTable(table.name);
            const joinLabel = tableJoin?.joinType?.toUpperCase().replace('JOIN', '').trim() || '';

            return (
              <g
                key={table.name}
                className="cursor-pointer"
                onClick={() => onSelectTable?.(table)}
              >
                {/* Selection highlight ring */}
                {isSelected && (
                  <circle cx={cx} cy={cy} r={CIRCLE_R + 6} fill="none" stroke="#6366f1" strokeWidth={2.5} strokeDasharray="4 2" />
                )}

                {/* Main circle */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={CIRCLE_R}
                  fill="white"
                  stroke={hasIdx ? '#22c55e' : '#ef4444'}
                  strokeWidth={2.5}
                />

                {/* Table name - actual name, bold */}
                <text x={cx} y={cy - 4} textAnchor="middle" fontWeight="bold" fontSize={14} fill="#1f2937">
                  {table.name.toUpperCase()}
                </text>

                {/* Sub label: alias or Table */}
                <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fill={hasIdx ? '#22c55e' : '#ef4444'}>
                  {table.alias && table.alias !== table.name ? `(${table.alias})` : 'Table'}
                </text>

                {/* Column name labels above circle */}
                {usedCols.length > 0 && (
                  <text
                    x={cx}
                    y={cy - CIRCLE_R - 22}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#6b7280"
                    className="font-mono"
                  >
                    {usedCols.map(c => c.name.toUpperCase()).join(' + ')}
                  </text>
                )}

                {/* Index point dots - positioned ON the circle border (top arc) */}
                {usedCols.length > 0 && (() => {
                  const DOT_R = 11;
                  // Spread dots along the top arc of the circle
                  // Angle range: from -60° to +60° (centered at top = -90°)
                  const totalAngle = Math.min(usedCols.length * 25, 120); // degrees
                  const startAngle = -90 - totalAngle / 2;
                  const stepAngle = usedCols.length > 1 ? totalAngle / (usedCols.length - 1) : 0;

                  return usedCols.map((col, ci) => {
                    const angleDeg = usedCols.length === 1 ? -90 : startAngle + ci * stepAngle;
                    const angleRad = (angleDeg * Math.PI) / 180;
                    const dotX = cx + CIRCLE_R * Math.cos(angleRad);
                    const dotY = cy + CIRCLE_R * Math.sin(angleRad);

                    return (
                      <g key={ci}>
                        {col.hasIndex ? (
                          <>
                            <circle cx={dotX} cy={dotY} r={DOT_R} fill="#3b82f6" />
                            <text x={dotX} y={dotY + 4} textAnchor="middle" fontSize={11} fill="white" fontWeight="bold">
                              {ci + 1}
                            </text>
                          </>
                        ) : (
                          <>
                            <circle cx={dotX} cy={dotY} r={DOT_R} fill="white" stroke="#ef4444" strokeWidth={2.5} />
                            <text x={dotX} y={dotY + 4} textAnchor="middle" fontSize={11} fill="#ef4444" fontWeight="bold">
                              {ci + 1}
                            </text>
                          </>
                        )}
                      </g>
                    );
                  });
                })()}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <svg width="18" height="18"><circle cx="9" cy="9" r="7" fill="#3b82f6" /><text x="9" y="12.5" textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">n</text></svg>
          인덱스 있음
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="18" height="18"><circle cx="9" cy="9" r="7" fill="white" stroke="#ef4444" strokeWidth="2" /><text x="9" y="12.5" textAnchor="middle" fontSize="9" fill="#ef4444" fontWeight="bold">n</text></svg>
          인덱스 없음
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="24" height="12"><line x1="0" y1="6" x2="24" y2="6" stroke="#9ca3af" strokeWidth="1.5" /></svg>
          INNER JOIN
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="24" height="12"><line x1="0" y1="6" x2="24" y2="6" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
          OUTER JOIN
        </div>
      </div>

      {/* Reading guide */}
      <div className="bg-muted/50 rounded-lg px-4 py-3 text-xs text-muted-foreground space-y-2">
        <h4 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="none" stroke="#6b7280" strokeWidth="1.5"/><text x="7" y="10" textAnchor="middle" fontSize="9" fill="#6b7280" fontWeight="bold">i</text></svg>
          인덱스 생성도 읽는 법
        </h4>
        <ul className="space-y-0.5 ml-4 list-disc">
          <li><strong>원(테이블)</strong>: SQL에서 사용된 테이블을 나타냅니다. 왼쪽에서 오른쪽으로 접근 순서를 보여줍니다.</li>
          <li><strong>실선</strong>: INNER JOIN 관계를 나타냅니다.</li>
          <li><strong>점선</strong>: OUTER JOIN 관계를 나타냅니다.</li>
          <li><strong>연결선 위 텍스트</strong>: 조인에 사용된 컬럼명입니다.</li>
        </ul>
        <h4 className="font-semibold text-foreground text-sm pt-1">번호의 의미 (인덱스 포인트)</h4>
        <ul className="space-y-0.5 ml-4 list-disc">
          <li>테이블 위의 번호는 WHERE, JOIN, ORDER BY, GROUP BY 조건에 사용된 <strong>컬럼의 순번</strong>입니다.</li>
          <li><span className="text-blue-500 font-semibold">파란색 원</span>: 해당 컬럼에 인덱스가 이미 존재합니다.</li>
          <li><span className="text-red-500 font-semibold">빨간색 테두리</span>: 인덱스가 없어서 생성을 권장합니다.</li>
        </ul>
        <h4 className="font-semibold text-foreground text-sm pt-1">최적화 팁</h4>
        <ul className="space-y-0.5 ml-4 list-disc">
          <li>빨간색 테두리 번호가 있는 컬럼에 인덱스 생성을 검토하세요.</li>
          <li>조인 컬럼(연결선 위 텍스트)은 양쪽 테이블 모두에 인덱스가 있어야 성능이 좋습니다.</li>
          <li>테이블 원을 클릭하면 왼쪽 패널에서 상세 정보를 확인할 수 있습니다.</li>
        </ul>
      </div>
    </div>
  );
}
