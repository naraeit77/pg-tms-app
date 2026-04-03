'use client'

import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useSelectedDatabase } from '@/hooks/use-selected-database'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Play,
  Sparkles,
  FileCode2,
  Database,
  Lightbulb,
  Route,
  Loader2,
  AlertCircle,
  Info,
  Search,
  Copy,
  Check,
  Zap,
  Table2,
  ArrowRight,
  ChevronRight,
} from 'lucide-react'
import { IndexDiagram } from '@/components/charts/index-diagram'

type InputMode = 'queryid' | 'sql'

interface TableInfo {
  name: string
  alias?: string
  schema?: string
  columns: ColumnInfo[]
  existingIndexes: ExistingIndex[]
  estimatedRows?: number
  seqScanCount?: number
  idxScanCount?: number
}

interface ColumnInfo {
  name: string
  type: string
  usedIn: string[]
  hasIndex: boolean
  indexName?: string
}

interface ExistingIndex {
  name: string
  columns: string[]
  type: string
  isUnique: boolean
  size?: string
  scanCount?: number
}

interface JoinInfo {
  leftTable: string
  rightTable: string
  leftColumn: string
  rightColumn: string
  joinType: string
}

interface IndexRecommendation {
  table: string
  columns: string[]
  type: string
  ddl: string
  reason: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  estimatedImprovement: string
}

interface AccessPath {
  step: number
  table: string
  accessType: string
  condition?: string
  estimatedCost?: number
}

interface AnalysisResult {
  tables: TableInfo[]
  joins: JoinInfo[]
  recommendations: IndexRecommendation[]
  explainPlan?: any
  accessPaths: AccessPath[]
  hints?: string
  summary: {
    tableCount: number
    joinCount: number
    existingIndexCount: number
    missingIndexCount: number
    overallHealthScore: number
  }
}

export default function QueryArtifactsPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase()

  const [inputMode, setInputMode] = useState<InputMode>('queryid')
  const [queryId, setQueryId] = useState('')
  const [isLoadingQueryId, setIsLoadingQueryId] = useState(false)
  const [queryIdError, setQueryIdError] = useState<string | null>(null)

  const [sql, setSql] = useState('')
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null)
  const [options, setOptions] = useState({
    includeStatistics: true,
    includeRecommendations: true,
    includeHints: false,
  })

  const [hintsCopied, setHintsCopied] = useState(false)

  const lookupQueryId = async () => {
    if (!queryId.trim() || !selectedConnectionId) {
      setQueryIdError('queryid와 데이터베이스 연결이 필요합니다')
      return
    }
    setIsLoadingQueryId(true)
    setQueryIdError(null)

    try {
      const res = await fetch(`/api/monitoring/sql-detail?connection_id=${selectedConnectionId}&queryid=${queryId}`)
      const data = await res.json()
      const sqlData = data.data?.current || data.data
      if (!sqlData?.query) throw new Error(data.error || 'SQL을 찾을 수 없습니다')
      setSql(sqlData.query)
      setInputMode('sql')
    } catch (error) {
      setQueryIdError(error instanceof Error ? error.message : 'SQL 조회 실패')
    } finally {
      setIsLoadingQueryId(false)
    }
  }

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ai/query-artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sql.trim(), connectionId: selectedConnectionId || '', options }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || '분석 실패')
      }
      const json = await res.json()
      return json.data as AnalysisResult
    },
  })

  const handleAnalyze = useCallback(() => {
    if (!sql.trim()) return
    setSelectedTable(null)
    analyzeMutation.mutate()
  }, [sql, analyzeMutation])

  const data = analyzeMutation.data

  const copyHints = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text)
    setHintsCopied(true)
    setTimeout(() => setHintsCopied(false), 2000)
  }, [])

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50 border-green-200'
    if (score >= 50) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    return 'text-red-600 bg-red-50 border-red-200'
  }

  const getPriorityColor = (p: string) => {
    if (p === 'HIGH') return 'destructive'
    if (p === 'MEDIUM') return 'secondary'
    return 'outline'
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-7 h-7 text-indigo-500" />
              Query Artifacts
            </h1>
            <p className="text-muted-foreground mt-1">
              SQL 쿼리를 분석하여 인덱스 생성도를 시각화하고 최적화 방안을 제안합니다
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedConnection && (
              <Badge variant="outline" className="text-xs">
                <Database className="w-3 h-3 mr-1" />{selectedConnection.name}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 pt-4 overflow-hidden">
        <div className="grid grid-cols-12 gap-4 h-full">
          {/* Left Panel */}
          <div className="col-span-4 flex flex-col gap-4">
            <Card className="flex-1 flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileCode2 className="w-5 h-5 text-blue-500" />SQL 입력
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-4">
                <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as InputMode)}>
                  <TabsList className="w-full">
                    <TabsTrigger value="queryid" className="flex-1"><Search className="w-4 h-4 mr-2" />queryid 조회</TabsTrigger>
                    <TabsTrigger value="sql" className="flex-1"><FileCode2 className="w-4 h-4 mr-2" />직접 입력</TabsTrigger>
                  </TabsList>

                  <TabsContent value="queryid" className="mt-3 space-y-3">
                    <div>
                      <Label className="text-sm">queryid (pg_stat_statements)</Label>
                      <div className="flex gap-2 mt-1">
                        <Input placeholder="예: 1234567890" value={queryId} onChange={(e) => setQueryId(e.target.value)} className="font-mono" onKeyDown={(e) => e.key === 'Enter' && lookupQueryId()} />
                        <Button onClick={lookupQueryId} disabled={isLoadingQueryId || !selectedConnectionId} size="sm">
                          {isLoadingQueryId ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-1" />조회</>}
                        </Button>
                      </div>
                      {!selectedConnectionId && <p className="text-xs text-amber-600 mt-1">데이터베이스 연결을 먼저 선택하세요</p>}
                      {queryIdError && <p className="text-xs text-red-600 mt-1">{queryIdError}</p>}
                    </div>
                  </TabsContent>

                  <TabsContent value="sql" className="mt-3">
                    <p className="text-xs text-muted-foreground mb-2">분석할 SQL을 직접 입력하세요.</p>
                  </TabsContent>
                </Tabs>

                <Textarea
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  placeholder="SELECT ... FROM ... WHERE ..."
                  className="flex-1 font-mono text-sm resize-none min-h-[180px]"
                />

                <div className="space-y-3">
                  <Separator />
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">통계 정보 조회</Label>
                    <Switch checked={options.includeStatistics} onCheckedChange={(checked) => setOptions(prev => ({ ...prev, includeStatistics: checked }))} disabled={!selectedConnectionId} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">AI 권장사항 생성</Label>
                    <Switch checked={options.includeRecommendations} onCheckedChange={(checked) => setOptions(prev => ({ ...prev, includeRecommendations: checked }))} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">pg_hint_plan 힌트 제안</Label>
                    <Switch checked={options.includeHints} onCheckedChange={(checked) => setOptions(prev => ({ ...prev, includeHints: checked }))} />
                  </div>
                </div>

                <Button onClick={handleAnalyze} disabled={!sql.trim() || analyzeMutation.isPending} className="w-full">
                  {analyzeMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />분석 중...</> : <><Play className="w-4 h-4 mr-2" />분석 시작</>}
                </Button>
              </CardContent>
            </Card>

            {/* Table Detail Panel - sqltms.info 스타일 */}
            {selectedTable && (() => {
              const tableJoin = data?.joins.find(j =>
                j.leftTable === selectedTable.name || j.rightTable === selectedTable.name
                || j.leftTable === selectedTable.alias || j.rightTable === selectedTable.alias
              );
              const joinType = tableJoin?.joinType?.toUpperCase().replace('JOIN', '').trim() || '';
              const usedCols = selectedTable.columns.filter(c => c.usedIn.length > 0);
              const noIndexCols = usedCols.filter(c => !c.hasIndex && c.usedIn.some(u => u !== 'select'));
              const tableRecs = data?.recommendations.filter(r => r.table === selectedTable.name) || [];

              const getColRating = (col: ColumnInfo) => {
                if (col.hasIndex) return { label: 'GOOD', color: 'text-emerald-600' };
                if (col.usedIn.some(u => u === 'WHERE' || u === 'JOIN')) return { label: 'POOR', color: 'text-red-500' };
                return { label: 'FAIR', color: 'text-amber-500' };
              };

              return (
                <Card className="max-h-[400px] overflow-y-auto shadow-lg">
                  <CardContent className="py-4 space-y-4">
                    {/* Table Header */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Database className="w-5 h-5 text-blue-500" />
                        <span className="text-lg font-bold">{selectedTable.name.toUpperCase()}</span>
                      </div>
                      {joinType && (
                        <Badge className="text-xs bg-gray-900 text-white hover:bg-gray-800">{joinType}</Badge>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center p-2 bg-gray-50 dark:bg-gray-900 rounded">
                        <div className="font-bold text-sm">{selectedTable.estimatedRows?.toLocaleString() || '-'}</div>
                        <div className="text-[10px] text-muted-foreground">행 수</div>
                      </div>
                      <div className="text-center p-2 bg-gray-50 dark:bg-gray-900 rounded">
                        <div className="font-bold text-sm">{selectedTable.seqScanCount?.toLocaleString() || '0'}</div>
                        <div className="text-[10px] text-muted-foreground">Seq Scan</div>
                      </div>
                      <div className="text-center p-2 bg-gray-50 dark:bg-gray-900 rounded">
                        <div className="font-bold text-sm">{selectedTable.idxScanCount?.toLocaleString() || '0'}</div>
                        <div className="text-[10px] text-muted-foreground">Idx Scan</div>
                      </div>
                    </div>

                    <Separator />

                    {/* Column Analysis */}
                    {usedCols.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                          <ChevronRight className="w-4 h-4" />
                          컬럼 분석 ({usedCols.length}개)
                        </h4>
                        <div className="space-y-2">
                          {usedCols.map((col, i) => {
                            const rating = getColRating(col);
                            return (
                              <div key={i} className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-900 rounded-lg border border-border/50">
                                <div className="flex items-start gap-2">
                                  <div className={cn(
                                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 flex-shrink-0',
                                    col.hasIndex ? 'bg-blue-500 text-white' : 'bg-white border-2 border-amber-400 text-amber-500'
                                  )}>
                                    {col.hasIndex ? '✓' : '!'}
                                  </div>
                                  <div>
                                    <div className="font-mono text-sm font-semibold">{col.name.toUpperCase()}  <span className="text-muted-foreground font-normal">#{i + 1}</span></div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {col.usedIn.join(', ')}
                                    </div>
                                  </div>
                                </div>
                                <span className={cn('text-xs font-bold', rating.color)}>{rating.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Existing Indexes */}
                    {selectedTable.existingIndexes.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                          <ChevronRight className="w-4 h-4" />
                          기존 인덱스 ({selectedTable.existingIndexes.length}개)
                        </h4>
                        <div className="space-y-1.5">
                          {selectedTable.existingIndexes.map((idx, i) => (
                            <div key={i} className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200/50 dark:border-blue-800/30">
                              <div className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-300">{idx.name}</div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                ({idx.columns.join(', ')}) [{idx.type}]{idx.isUnique ? ' UNIQUE' : ''} {idx.size && `· ${idx.size}`}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Index Recommendation */}
                    {noIndexCols.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-amber-600">
                          <Lightbulb className="w-4 h-4" />
                          인덱스 추천
                        </h4>
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200/50 dark:border-amber-800/30">
                          <p className="text-xs text-muted-foreground mb-2">다음 컬럼에 인덱스를 생성하면 성능이 향상될 수 있습니다:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {noIndexCols.map((col, i) => (
                              <Badge key={i} variant="outline" className="font-mono text-xs bg-white dark:bg-gray-900 border-amber-300 dark:border-amber-700">
                                {col.name.toUpperCase()}
                              </Badge>
                            ))}
                          </div>
                          {tableRecs.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {tableRecs.map((rec, i) => (
                                <pre key={i} className="text-[10px] font-mono bg-white dark:bg-gray-900 p-1.5 rounded border overflow-x-auto">{rec.ddl}</pre>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
          </div>

          {/* Right Panel - Results */}
          <div className="col-span-8 flex flex-col gap-4 overflow-hidden">
            {/* Error */}
            {analyzeMutation.isError && (
              <Card className="border-red-500/20 bg-red-500/5">
                <CardContent className="flex items-start gap-3 py-4">
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-red-500 mb-2">분석 실패</p>
                    <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans">{analyzeMutation.error?.message}</pre>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Empty State */}
            {!data && !analyzeMutation.isPending && !analyzeMutation.isError && (
              <Card className="flex-1">
                <CardContent className="flex items-center justify-center h-full">
                  <div className="text-center text-muted-foreground">
                    <Sparkles className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <h3 className="text-lg font-medium mb-2">SQL을 분석해 보세요</h3>
                    <p className="text-sm max-w-md">SQL 쿼리를 입력하고 분석 버튼을 클릭하면 인덱스 생성도와 최적화 권장사항이 표시됩니다.</p>
                    <div className="flex items-center justify-center gap-4 mt-6 text-xs">
                      <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500" /><span>인덱스 있음</span></div>
                      <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-yellow-500" /><span>인덱스 권장</span></div>
                      <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500" /><span>인덱스 필요</span></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Loading */}
            {analyzeMutation.isPending && (
              <Card className="flex-1">
                <CardContent className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-indigo-500" />
                    <h3 className="text-lg font-medium mb-2">SQL 분석 중...</h3>
                    <p className="text-sm text-muted-foreground">쿼리를 파싱하고 인덱스 생성도를 생성하고 있습니다</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Results */}
            {data && !analyzeMutation.isPending && (
              <>
                {/* Summary Bar */}
                <Card>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2"><Database className="w-4 h-4 text-indigo-500" /><span className="text-sm"><strong>{data.summary.tableCount}</strong> 테이블</span></div>
                        <div className="flex items-center gap-2"><Route className="w-4 h-4 text-purple-500" /><span className="text-sm"><strong>{data.summary.joinCount}</strong> 조인</span></div>
                        <div className="flex items-center gap-2"><Info className="w-4 h-4 text-green-500" /><span className="text-sm"><strong>{data.summary.existingIndexCount}</strong> 기존 인덱스</span></div>
                        <div className="flex items-center gap-2"><Lightbulb className="w-4 h-4 text-yellow-500" /><span className="text-sm"><strong>{data.summary.missingIndexCount}</strong> 누락 인덱스</span></div>
                      </div>
                      <Badge className={getHealthColor(data.summary.overallHealthScore)}>
                        Health Score: {data.summary.overallHealthScore}%
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Tabs */}
                <Tabs defaultValue="diagram" className="flex-1 flex flex-col overflow-hidden">
                  <TabsList className="w-fit">
                    <TabsTrigger value="diagram" className="flex items-center gap-1"><Sparkles className="w-4 h-4" />인덱스 생성도</TabsTrigger>
                    <TabsTrigger value="recommendations" className="flex items-center gap-1">
                      <Lightbulb className="w-4 h-4" />권장사항
                      {data.recommendations.length > 0 && <Badge variant="secondary" className="ml-1 h-5">{data.recommendations.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="access-path" className="flex items-center gap-1"><Route className="w-4 h-4" />접근 경로</TabsTrigger>
                    {data.hints && <TabsTrigger value="hints" className="flex items-center gap-1"><Zap className="w-4 h-4" />힌트 제안</TabsTrigger>}
                  </TabsList>

                  {/* Index Diagram */}
                  <TabsContent value="diagram" className="flex-1 mt-4 overflow-auto">
                    <Card>
                      <CardContent className="py-4">
                        <IndexDiagram
                          tables={data.tables}
                          joins={data.joins}
                          recommendations={data.recommendations}
                          onSelectTable={setSelectedTable}
                          selectedTable={selectedTable}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Recommendations */}
                  <TabsContent value="recommendations" className="flex-1 mt-4 overflow-auto">
                    <div className="space-y-3">
                      {data.recommendations.length === 0 ? (
                        <Card>
                          <CardContent className="py-8 text-center text-muted-foreground">
                            <Check className="w-12 h-12 mx-auto mb-3 text-green-500" />
                            <p>인덱스 권장사항이 없습니다. 현재 인덱스 구성이 양호합니다.</p>
                          </CardContent>
                        </Card>
                      ) : (
                        data.recommendations.map((rec, idx) => (
                          <Card key={idx}>
                            <CardContent className="py-4">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant={getPriorityColor(rec.priority) as any}>{rec.priority}</Badge>
                                  <span className="font-semibold">{rec.table}</span>
                                  <Badge variant="outline" className="text-xs">{rec.type}</Badge>
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">{rec.reason}</p>
                              <pre className="bg-slate-900 text-slate-100 p-3 rounded text-sm font-mono overflow-x-auto">{rec.ddl}</pre>
                              <p className="text-xs text-green-600 mt-2">예상 효과: {rec.estimatedImprovement}</p>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  </TabsContent>

                  {/* Access Paths */}
                  <TabsContent value="access-path" className="flex-1 mt-4 overflow-auto">
                    <Card>
                      <CardContent className="py-4">
                        {data.accessPaths.length === 0 ? (
                          <p className="text-center text-muted-foreground py-4">접근 경로 정보가 없습니다</p>
                        ) : (
                          <div className="space-y-4">
                            {/* Access direction */}
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span>실행 순서</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </div>

                            {/* SVG Pipeline */}
                            <div className="overflow-x-auto border border-border rounded-lg bg-white">
                              <svg
                                width={Math.max(600, data.accessPaths.length * 200 + 100)}
                                height={180}
                                viewBox={`0 0 ${Math.max(600, data.accessPaths.length * 200 + 100)} 180`}
                                className="select-none"
                              >
                                {data.accessPaths.map((path, idx) => {
                                  const cx = 80 + idx * 200;
                                  const cy = 80;
                                  const isSeqScan = path.accessType?.toLowerCase().includes('seq');
                                  const isIndexScan = path.accessType?.toLowerCase().includes('index');
                                  const isJoin = path.accessType?.toLowerCase().includes('join') || path.accessType?.toLowerCase().includes('loop') || path.accessType?.toLowerCase().includes('hash') || path.accessType?.toLowerCase().includes('merge');
                                  const nodeColor = isSeqScan ? '#ef4444' : isIndexScan ? '#22c55e' : isJoin ? '#6366f1' : '#3b82f6';
                                  const bgColor = isSeqScan ? '#fef2f2' : isIndexScan ? '#f0fdf4' : isJoin ? '#eef2ff' : '#eff6ff';

                                  return (
                                    <g key={idx}>
                                      {/* Connector line */}
                                      {idx > 0 && (
                                        <g>
                                          <line
                                            x1={80 + (idx - 1) * 200 + 55}
                                            y1={cy}
                                            x2={cx - 55}
                                            y2={cy}
                                            stroke="#d1d5db"
                                            strokeWidth={2}
                                            markerEnd="url(#arrowhead)"
                                          />
                                        </g>
                                      )}

                                      {/* Step number */}
                                      <circle cx={cx} cy={24} r={12} fill={nodeColor} />
                                      <text x={cx} y={28} textAnchor="middle" fontSize={11} fill="white" fontWeight="bold">
                                        {path.step}
                                      </text>

                                      {/* Node rounded rect */}
                                      <rect
                                        x={cx - 52}
                                        y={cy - 30}
                                        width={104}
                                        height={60}
                                        rx={8}
                                        fill={bgColor}
                                        stroke={nodeColor}
                                        strokeWidth={2}
                                      />

                                      {/* Table name */}
                                      <text x={cx} y={cy - 8} textAnchor="middle" fontSize={12} fill="#1f2937" fontWeight="bold">
                                        {(path.table || '').toUpperCase().substring(0, 12)}
                                      </text>

                                      {/* Access type */}
                                      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill={nodeColor} fontWeight="600">
                                        {path.accessType}
                                      </text>

                                      {/* Cost */}
                                      {path.estimatedCost != null && path.estimatedCost > 0 && (
                                        <text x={cx} y={cy + 48} textAnchor="middle" fontSize={9} fill="#9ca3af">
                                          cost: {path.estimatedCost > 1000 ? `${(path.estimatedCost / 1000).toFixed(1)}K` : path.estimatedCost.toFixed(1)}
                                        </text>
                                      )}

                                      {/* Condition */}
                                      {path.condition && (
                                        <text x={cx} y={cy + 60} textAnchor="middle" fontSize={8} fill="#9ca3af" className="font-mono">
                                          {path.condition.length > 25 ? path.condition.substring(0, 23) + '…' : path.condition}
                                        </text>
                                      )}
                                    </g>
                                  );
                                })}
                                {/* Arrow marker */}
                                <defs>
                                  <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                                    <polygon points="0 0, 8 3, 0 6" fill="#d1d5db" />
                                  </marker>
                                </defs>
                              </svg>
                            </div>

                            {/* Legend */}
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-2 text-[11px] text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-red-100 border-2 border-red-500" />Seq Scan (전체 스캔)
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-green-100 border-2 border-green-500" />Index Scan
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-indigo-100 border-2 border-indigo-500" />Join / Aggregate
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-blue-100 border-2 border-blue-500" />기타
                              </div>
                            </div>

                            {/* Detail table */}
                            <div className="border border-border rounded-lg overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-muted/50">
                                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-12">#</th>
                                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">테이블</th>
                                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">접근 방식</th>
                                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">조건</th>
                                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Cost</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {data.accessPaths.map((path, idx) => {
                                    const isSeqScan = path.accessType?.toLowerCase().includes('seq');
                                    return (
                                      <tr key={idx} className="border-t border-border/50 hover:bg-muted/20">
                                        <td className="px-3 py-2 font-bold text-muted-foreground">{path.step}</td>
                                        <td className="px-3 py-2 font-semibold">{path.table}</td>
                                        <td className="px-3 py-2">
                                          <Badge variant={isSeqScan ? 'destructive' : 'outline'} className="text-[10px]">
                                            {path.accessType}
                                          </Badge>
                                        </td>
                                        <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-[200px]">{path.condition || '-'}</td>
                                        <td className="px-3 py-2 text-right font-mono">
                                          {path.estimatedCost != null && path.estimatedCost > 0 ? path.estimatedCost.toFixed(1) : '-'}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Hints */}
                  {data.hints && (
                    <TabsContent value="hints" className="flex-1 mt-4 overflow-auto">
                      <div className="space-y-4">
                        <Card>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base flex items-center gap-2">
                                <Zap className="w-5 h-5 text-amber-500" />pg_hint_plan Hints
                              </CardTitle>
                              <Button variant="outline" size="sm" onClick={() => copyHints(data.hints!)} className="h-8">
                                {hintsCopied ? <><Check className="w-3.5 h-3.5 mr-1.5 text-green-500" />복사됨</> : <><Copy className="w-3.5 h-3.5 mr-1.5" />복사</>}
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm font-mono leading-relaxed">
                              <code>{data.hints}</code>
                            </pre>
                            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
                              <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">적용 방법</h4>
                              <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
                                pg_hint_plan 확장을 설치한 후, SQL 앞에 힌트 코멘트를 추가합니다:
                              </p>
                              <pre className="mt-2 text-xs bg-white dark:bg-slate-900 p-2 rounded border text-slate-700 dark:text-slate-300 overflow-x-auto">
                                {`${data.hints}\nSELECT ...\nFROM ...`}
                              </pre>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="bg-slate-50 dark:bg-slate-900/50">
                          <CardContent className="py-4">
                            <div className="flex items-start gap-3">
                              <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                              <div className="text-sm space-y-2">
                                <h4 className="font-semibold">pg_hint_plan 안내</h4>
                                <ul className="text-muted-foreground space-y-1 ml-4 list-disc text-xs">
                                  <li>pg_hint_plan은 PostgreSQL 확장으로, 실행 계획을 제어할 수 있습니다</li>
                                  <li>SeqScan, IndexScan, NestLoop, HashJoin 등의 힌트를 지원합니다</li>
                                  <li>EXPLAIN으로 힌트 적용 여부를 반드시 확인하세요</li>
                                  <li>데이터 분포가 변하면 최적의 힌트도 달라질 수 있습니다</li>
                                </ul>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>
                  )}
                </Tabs>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
