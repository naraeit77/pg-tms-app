'use client'

import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useSelectedDatabase } from '@/hooks/use-selected-database'
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

            {/* Table Detail Panel */}
            {selectedTable && (
              <Card className="max-h-[300px] overflow-y-auto">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Table2 className="w-4 h-4 text-blue-500" />
                    {selectedTable.schema}.{selectedTable.name}
                    {selectedTable.alias && <Badge variant="outline" className="text-xs">alias: {selectedTable.alias}</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2 bg-gray-50 dark:bg-gray-900 rounded">
                      <div className="font-bold">{selectedTable.estimatedRows?.toLocaleString() || '-'}</div>
                      <div className="text-muted-foreground">행 수</div>
                    </div>
                    <div className="text-center p-2 bg-gray-50 dark:bg-gray-900 rounded">
                      <div className="font-bold">{selectedTable.seqScanCount?.toLocaleString() || '0'}</div>
                      <div className="text-muted-foreground">Seq Scan</div>
                    </div>
                    <div className="text-center p-2 bg-gray-50 dark:bg-gray-900 rounded">
                      <div className="font-bold">{selectedTable.idxScanCount?.toLocaleString() || '0'}</div>
                      <div className="text-muted-foreground">Idx Scan</div>
                    </div>
                  </div>
                  {selectedTable.existingIndexes.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-1">기존 인덱스</h4>
                      {selectedTable.existingIndexes.map((idx, i) => (
                        <div key={i} className="p-1.5 bg-blue-50 dark:bg-blue-950/30 rounded mb-1">
                          <div className="font-mono">{idx.name}</div>
                          <div className="text-muted-foreground">({idx.columns.join(', ')}) [{idx.type}] {idx.size}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedTable.columns.filter(c => c.usedIn.length > 0).length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-1">사용 컬럼</h4>
                      {selectedTable.columns.filter(c => c.usedIn.length > 0).map((col, i) => (
                        <div key={i} className="flex items-center justify-between p-1">
                          <span className="font-mono">{col.name}</span>
                          <div className="flex gap-1">
                            {col.usedIn.map(u => <Badge key={u} variant="outline" className="text-[10px]">{u}</Badge>)}
                            {col.hasIndex ? <Badge className="text-[10px] bg-blue-500">indexed</Badge> : <Badge variant="destructive" className="text-[10px]">no-idx</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
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
                  <TabsContent value="diagram" className="flex-1 mt-4 overflow-auto space-y-4">
                    {/* Visual diagram */}
                    <Card>
                      <CardContent className="py-6">
                        <div className="flex items-center justify-center gap-4 flex-wrap">
                          {data.tables.map((table, idx) => (
                            <div key={table.name} className="flex items-center gap-2">
                              {idx > 0 && (
                                <div className="flex flex-col items-center">
                                  <ArrowRight className="w-5 h-5 text-gray-400" />
                                  {data.joins[idx - 1] && (
                                    <span className="text-[10px] text-gray-500">
                                      {data.joins[idx - 1].joinType}
                                    </span>
                                  )}
                                </div>
                              )}
                              <div
                                className={`relative cursor-pointer transition-all hover:scale-105 ${
                                  selectedTable?.name === table.name ? 'ring-2 ring-indigo-500' : ''
                                }`}
                                onClick={() => setSelectedTable(table)}
                              >
                                {/* Table circle */}
                                <div className={`w-24 h-24 rounded-full border-2 flex flex-col items-center justify-center ${
                                  table.existingIndexes.length > 0 ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-red-500 bg-red-50 dark:bg-red-950/20'
                                }`}>
                                  <span className="text-xs font-bold truncate max-w-[80px]">{table.alias || table.name}</span>
                                  <span className="text-[10px] text-muted-foreground">{table.estimatedRows?.toLocaleString() || '?'} rows</span>
                                </div>
                                {/* Index points */}
                                <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex gap-1">
                                  {table.columns.filter(c => c.usedIn.length > 0).slice(0, 5).map((col, ci) => (
                                    <div
                                      key={ci}
                                      className={`w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center ${
                                        col.hasIndex
                                          ? 'bg-blue-500 text-white'
                                          : 'bg-white border-2 border-red-500 text-red-500'
                                      }`}
                                      title={`${col.name} (${col.usedIn.join(', ')})`}
                                    >
                                      {ci + 1}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {data.tables.length === 0 && (
                          <p className="text-center text-muted-foreground">테이블이 감지되지 않았습니다</p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Guide */}
                    <Card className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
                      <CardContent className="py-4">
                        <div className="flex items-start gap-3">
                          <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                          <div className="space-y-3 text-sm">
                            <div>
                              <h4 className="font-semibold mb-1">인덱스 생성도 읽는 법</h4>
                              <ul className="text-muted-foreground space-y-1 ml-4 list-disc text-xs">
                                <li><strong>원(테이블)</strong>: SQL에서 사용된 테이블. 녹색 테두리=인덱스 있음, 빨간 테두리=인덱스 없음</li>
                                <li><strong>화살표</strong>: JOIN 관계 및 접근 순서</li>
                                <li><span className="inline-flex items-center gap-1"><span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-bold inline-flex items-center justify-center">n</span>파란색</span>: 인덱스가 이미 존재</li>
                                <li><span className="inline-flex items-center gap-1"><span className="w-4 h-4 rounded-full border-2 border-red-500 text-red-500 text-[9px] font-bold inline-flex items-center justify-center">n</span>빨간 테두리</span>: 인덱스 생성 권장</li>
                                <li>테이블 원을 클릭하면 왼쪽 패널에서 상세 정보를 확인할 수 있습니다</li>
                              </ul>
                            </div>
                          </div>
                        </div>
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
                        <div className="space-y-3">
                          {data.accessPaths.map((path, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-sm font-bold text-indigo-600">
                                {path.step}
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                              <div className="flex-1 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-sm">{path.table}</span>
                                  <Badge variant="outline" className="text-xs">{path.accessType}</Badge>
                                  {path.estimatedCost !== undefined && path.estimatedCost > 0 && (
                                    <span className="text-xs text-muted-foreground">cost: {path.estimatedCost.toFixed(1)}</span>
                                  )}
                                </div>
                                {path.condition && <p className="text-xs text-muted-foreground mt-1">{path.condition}</p>}
                              </div>
                            </div>
                          ))}
                          {data.accessPaths.length === 0 && (
                            <p className="text-center text-muted-foreground py-4">접근 경로 정보가 없습니다</p>
                          )}
                        </div>
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
