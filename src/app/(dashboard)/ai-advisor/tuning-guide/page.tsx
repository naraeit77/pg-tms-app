'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSelectedDatabase } from '@/hooks/use-selected-database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  AlertTriangle,
  Bot,
  Sparkles,
  Send,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Database,
  FileText,
  Lightbulb,
  Zap,
  BookOpen,
  Wrench,
  History,
  Trash2,
  Copy,
  Check,
  WifiOff,
  Search,
  MessageSquare,
  User,
  Loader2,
  Download,
} from 'lucide-react'
import { ExplainPlanTree } from '@/components/charts/explain-plan-tree'

type AnalysisContext = 'tuning' | 'explain' | 'index' | 'rewrite'
type SupportedLanguage = 'ko' | 'en'
type InputMode = 'queryid' | 'sql'

interface SQLMetrics {
  calls: number
  total_exec_time: number
  mean_exec_time: number
  rows: number
  shared_blks_hit: number
  shared_blks_read: number
  temp_blks_written: number
}

interface HistoryItem {
  id: string
  timestamp: string
  sql_text: string
  context: AnalysisContext
  response: string
}

interface QueryIdResult {
  sql: string
  metrics: SQLMetrics | null
  executionPlan: unknown | null
  planningTime?: number
  executionTime?: number
  nodeTypes?: string[]
}

interface LLMHealthStatus {
  healthy: boolean
  model: string
  latency: number
  error?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

const CONTEXT_INFO: Record<AnalysisContext, { label: string; icon: typeof Zap; description: string }> = {
  tuning: {
    label: '성능 튜닝',
    icon: Zap,
    description: 'SQL 성능 분석 및 최적화 권장사항',
  },
  explain: {
    label: '실행계획 설명',
    icon: BookOpen,
    description: 'SQL과 실행계획을 이해하기 쉽게 설명',
  },
  index: {
    label: '인덱스 권장',
    icon: Database,
    description: '인덱스 설계 및 DDL 생성',
  },
  rewrite: {
    label: 'SQL 재작성',
    icon: Wrench,
    description: '더 효율적인 SQL로 재작성',
  },
}

export default function AITuningGuidePage() {
  const { selectedConnectionId } = useSelectedDatabase()

  // Input mode state
  const [inputMode, setInputMode] = useState<InputMode>('queryid')
  const [queryId, setQueryId] = useState('')
  const [isLoadingQueryId, setIsLoadingQueryId] = useState(false)
  const [queryIdError, setQueryIdError] = useState<string | null>(null)
  const [queryIdResult, setQueryIdResult] = useState<QueryIdResult | null>(null)
  const [explainFetchError, setExplainFetchError] = useState<string | null>(null)

  // Form state
  const [sqlText, setSqlText] = useState('')
  const [executionPlan, setExecutionPlan] = useState('')
  const [context, setContext] = useState<AnalysisContext>('tuning')
  const [language, setLanguage] = useState<SupportedLanguage>('ko')
  const [useMetrics, setUseMetrics] = useState(false)
  const [metrics, setMetrics] = useState<SQLMetrics>({
    calls: 0,
    total_exec_time: 0,
    mean_exec_time: 0,
    rows: 0,
    shared_blks_hit: 0,
    shared_blks_read: 0,
    temp_blks_written: 0,
  })

  // UI state
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const [llmHealth, setLLMHealth] = useState<LLMHealthStatus | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [executionPlanOpen, setExecutionPlanOpen] = useState(false)

  // Chat state for follow-up questions
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [followUpQuestion, setFollowUpQuestion] = useState('')
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false)
  const [analysisComplete, setAnalysisComplete] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // Check LLM health on mount
  useEffect(() => {
    checkLLMHealth()
  }, [])

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('ai-tuning-history-pg')
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory))
      } catch {}
    }
  }, [])

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('ai-tuning-history-pg', JSON.stringify(history.slice(0, 20)))
  }, [history])

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [chatMessages])

  const checkLLMHealth = async () => {
    setHealthLoading(true)
    try {
      const response = await fetch('/api/ai/tuning-guide/health')
      const data = await response.json()
      if (data.success) {
        setLLMHealth({ healthy: true, model: data.data.model, latency: data.data.latency })
      } else {
        setLLMHealth({ healthy: false, model: data.config?.modelName || 'unknown', latency: 0, error: data.error?.message })
      }
    } catch {
      setLLMHealth({ healthy: false, model: 'unknown', latency: 0, error: 'Health endpoint 연결 실패' })
    } finally {
      setHealthLoading(false)
    }
  }

  /**
   * Lookup SQL by queryid from pg_stat_statements
   */
  const lookupQueryId = async () => {
    if (!queryId.trim() || !selectedConnectionId) {
      setQueryIdError('queryid와 데이터베이스 연결이 필요합니다')
      return
    }
    setIsLoadingQueryId(true)
    setQueryIdError(null)
    setQueryIdResult(null)

    try {
      const res = await fetch(
        `/api/monitoring/sql-detail?connection_id=${selectedConnectionId}&queryid=${queryId}`
      )
      const data = await res.json()
      if (!res.ok || !data.success || !data.data) {
        throw new Error(data.error || 'SQL을 찾을 수 없습니다')
      }

      const sqlData = data.data?.current || data.data
      if (!sqlData?.query) throw new Error('SQL을 찾을 수 없습니다')
      setSqlText(sqlData.query)

      let resultMetrics: SQLMetrics | null = null
      if (sqlData.calls) {
        resultMetrics = {
          calls: sqlData.calls || 0,
          total_exec_time: sqlData.total_exec_time || 0,
          mean_exec_time: sqlData.mean_exec_time || 0,
          rows: sqlData.rows || 0,
          shared_blks_hit: sqlData.shared_blks_hit || 0,
          shared_blks_read: sqlData.shared_blks_read || 0,
          temp_blks_written: sqlData.temp_blks_written || 0,
        }
        setMetrics(resultMetrics)
        setUseMetrics(true)
      }

      // EXPLAIN 자동 조회 — 파라미터가 있으면 API의 PREPARE/EXECUTE 방식 활용
      let resultPlan: unknown | null = null
      let planningTime: number | undefined
      let executionTime: number | undefined
      let nodeTypes: string[] | undefined
      let explainError: string | null = null
      try {
        const explainRes = await fetch('/api/pg/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connection_id: selectedConnectionId,
            sql: sqlData.query,
            analyze: false,
          }),
        })
        const explainData = await explainRes.json()
        if (explainData.success && explainData.data?.plan) {
          resultPlan = explainData.data.plan
          planningTime = explainData.data.planningTimeMs
          executionTime = explainData.data.executionTimeMs
          setExecutionPlan(JSON.stringify(explainData.data.plan, null, 2))
          setExecutionPlanOpen(true)
        } else {
          explainError = explainData.error || 'EXPLAIN 실행 실패'
          setExecutionPlanOpen(true)
        }
      } catch {
        explainError = 'EXPLAIN 요청 실패'
        setExecutionPlanOpen(true)
      }
      setExplainFetchError(explainError)

      setQueryIdResult({
        sql: sqlData.query,
        metrics: resultMetrics,
        executionPlan: resultPlan,
        planningTime,
        executionTime,
        nodeTypes,
      })

      setInputMode('sql')
    } catch (error) {
      setQueryIdError(error instanceof Error ? error.message : 'SQL 조회 실패')
    } finally {
      setIsLoadingQueryId(false)
    }
  }

  /**
   * Submit analysis with SSE streaming
   */
  const handleSubmit = useCallback(async () => {
    if (!sqlText.trim() || isAnalyzing) return

    setIsAnalyzing(true)
    setStreamContent('')
    setAnalysisComplete(false)
    setChatMessages([])

    const body: Record<string, unknown> = {
      sql_text: sqlText,
      context,
      language,
      connection_id: selectedConnectionId,
    }
    if (executionPlan.trim()) body.execution_plan = executionPlan
    if (useMetrics && metrics.calls > 0) body.metrics = metrics

    try {
      const response = await fetch('/api/ai/tuning-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) throw new Error('분석 요청 실패')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('스트리밍 응답 없음')

      const decoder = new TextDecoder()
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'content' && data.content) {
              fullContent += data.content
              setStreamContent(fullContent)
            }
            if (data.type === 'error') {
              throw new Error(data.error)
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue
            throw e
          }
        }
      }

      // Analysis complete
      setAnalysisComplete(true)
      setChatMessages([{
        role: 'assistant',
        content: fullContent,
        timestamp: new Date().toISOString(),
      }])

      // Add to history
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        sql_text: sqlText.substring(0, 200),
        context,
        response: fullContent.substring(0, 500),
      }
      setHistory(prev => [newItem, ...prev.slice(0, 19)])
    } catch (error) {
      console.error('Stream error:', error)
      setStreamContent(prev => prev + '\n\n❌ 오류: ' + (error instanceof Error ? error.message : '알 수 없는 오류'))
    } finally {
      setIsAnalyzing(false)
    }
  }, [sqlText, executionPlan, context, language, useMetrics, metrics, selectedConnectionId, isAnalyzing])

  /**
   * Send follow-up question
   */
  const sendFollowUp = async () => {
    if (!followUpQuestion.trim() || isSendingFollowUp) return
    const question = followUpQuestion.trim()
    setFollowUpQuestion('')
    setIsSendingFollowUp(true)

    const userMessage: ChatMessage = { role: 'user', content: question, timestamp: new Date().toISOString() }
    setChatMessages(prev => [...prev, userMessage])

    try {
      const conversationHistory = chatMessages.map(msg => ({ role: msg.role, content: msg.content }))

      const response = await fetch('/api/ai/tuning-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql_text: sqlText,
          context,
          language,
          follow_up: true,
          conversation_history: conversationHistory,
          user_question: question,
        }),
      })

      if (!response.ok) throw new Error('추가 질문 실패')

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      setChatMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date().toISOString() }])

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n\n')

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'content' && data.content) {
                assistantContent += data.content
                setChatMessages(prev => {
                  const updated = [...prev]
                  updated[updated.length - 1] = { ...updated[updated.length - 1], content: assistantContent }
                  return updated
                })
              }
            } catch {}
          }
        }
      }
    } catch {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: '죄송합니다. 질문 처리 중 오류가 발생했습니다.',
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setIsSendingFollowUp(false)
    }
  }

  const loadFromHistory = (item: HistoryItem) => {
    setSqlText(item.sql_text)
    setContext(item.context)
    setHistoryOpen(false)
  }

  const clearHistory = () => {
    setHistory([])
    localStorage.removeItem('ai-tuning-history-pg')
  }

  const copySQL = async () => {
    await navigator.clipboard.writeText(sqlText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const clearForm = () => {
    setSqlText('')
    setExecutionPlan('')
    setQueryId('')
    setQueryIdError(null)
    setQueryIdResult(null)
    setExplainFetchError(null)
    setMetrics({ calls: 0, total_exec_time: 0, mean_exec_time: 0, rows: 0, shared_blks_hit: 0, shared_blks_read: 0, temp_blks_written: 0 })
    setStreamContent('')
    setChatMessages([])
    setAnalysisComplete(false)
  }

  const exportAnalysis = () => {
    const content = chatMessages.map(m => `[${m.role === 'user' ? '사용자' : 'AI'}]\n${m.content}`).join('\n\n---\n\n')
    const blob = new Blob([`# AI 튜닝 분석 결과\n\n## SQL\n\`\`\`sql\n${sqlText}\n\`\`\`\n\n## 분석\n${content}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tuning-analysis-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-6">
      {/* LLM Status Banner */}
      {llmHealth && !llmHealth.healthy && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <WifiOff className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-900 dark:text-amber-300">LLM 서버 연결 불가</p>
                  <p className="text-sm text-amber-700 dark:text-amber-400">{llmHealth.error || 'AI 분석 기능을 사용할 수 없습니다.'}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={checkLLMHealth} disabled={healthLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${healthLoading ? 'animate-spin' : ''}`} />
                재연결
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 flex items-center">
            <Bot className="h-8 w-8 mr-3 text-purple-600" />
            AI 튜닝 가이드
          </h1>
          <p className="text-gray-500 dark:text-gray-400">AI 기반 PostgreSQL SQL 튜닝 분석 (Ollama + qwen3:8b)</p>
        </div>
        <div className="flex items-center space-x-2">
          {llmHealth?.healthy && (
            <Badge variant="outline" className="text-green-600 border-green-200">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2" />
              <span className="truncate max-w-[200px]">{llmHealth.model}</span>
              <span className="ml-1">({llmHealth.latency}ms)</span>
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={checkLLMHealth} disabled={healthLoading}>
            <RefreshCw className={`h-4 w-4 ${healthLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Input */}
        <div className="lg:col-span-2 space-y-4">
          {/* Input Mode Selector */}
          <Card>
            <CardContent className="pt-4">
              <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as InputMode)}>
                <TabsList className="w-full mb-4">
                  <TabsTrigger value="queryid" className="flex-1">
                    <Search className="h-4 w-4 mr-2" />
                    queryid로 조회
                  </TabsTrigger>
                  <TabsTrigger value="sql" className="flex-1">
                    <FileText className="h-4 w-4 mr-2" />
                    SQL 직접 입력
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="queryid" className="mt-0">
                  <div className="space-y-3">
                    <div>
                      <Label>queryid (pg_stat_statements)</Label>
                      <div className="flex space-x-2 mt-1">
                        <Input
                          placeholder="예: 1234567890"
                          value={queryId}
                          onChange={(e) => setQueryId(e.target.value)}
                          className="font-mono"
                          onKeyDown={(e) => e.key === 'Enter' && lookupQueryId()}
                        />
                        <Button onClick={lookupQueryId} disabled={isLoadingQueryId || !selectedConnectionId}>
                          {isLoadingQueryId ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="h-4 w-4 mr-2" />조회</>}
                        </Button>
                      </div>
                      {!selectedConnectionId && <p className="text-xs text-amber-600 mt-1">데이터베이스 연결을 먼저 선택하세요</p>}
                      {queryIdError && <p className="text-xs text-red-600 mt-1">{queryIdError}</p>}
                    </div>
                    <p className="text-xs text-gray-500">pg_stat_statements에서 queryid로 SQL 텍스트, 실행계획, 성능 메트릭을 자동으로 조회합니다.</p>
                  </div>
                </TabsContent>

                <TabsContent value="sql" className="mt-0">
                  <p className="text-sm text-gray-500">아래 입력란에 분석할 SQL을 직접 입력하세요.</p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* SQL Input */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center"><FileText className="h-5 w-5 mr-2" />SQL 입력</CardTitle>
                  <CardDescription>분석할 SQL 문을 입력하세요</CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  {sqlText && (
                    <Button variant="ghost" size="sm" onClick={copySQL}>
                      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={clearForm}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="SELECT * FROM users WHERE department_id = $1..."
                value={sqlText}
                onChange={(e) => setSqlText(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
              />
            </CardContent>
          </Card>

          {/* Execution Plan (Optional) */}
          <Collapsible open={executionPlanOpen} onOpenChange={setExecutionPlanOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center text-base">
                        <Database className="h-5 w-5 mr-2" />
                        실행계획 (선택사항)
                        {executionPlan && <Badge variant="secondary" className="ml-2 text-xs">입력됨</Badge>}
                      </CardTitle>
                      <CardDescription>EXPLAIN (FORMAT JSON) 출력을 붙여넣으세요</CardDescription>
                    </div>
                    {executionPlanOpen ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-3">
                  {/* EXPLAIN 자동 조회 실패 메시지 */}
                  {explainFetchError && !executionPlan && (
                    <div className="flex items-start space-x-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-900 dark:text-amber-300">실행계획 자동 조회 실패</p>
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">{explainFetchError}</p>
                        <p className="text-xs text-gray-500 mt-1">EXPLAIN (FORMAT JSON) 결과를 아래에 직접 붙여넣을 수 있습니다.</p>
                      </div>
                    </div>
                  )}
                  {/* Oracle-style plan tree view */}
                  {executionPlan && (() => {
                    try {
                      const parsed = JSON.parse(executionPlan)
                      return (
                        <div className="border border-border rounded-md overflow-hidden">
                          <ExplainPlanTree plan={parsed} />
                        </div>
                      )
                    } catch {
                      return null
                    }
                  })()}
                  {/* Raw JSON editor */}
                  <Textarea
                    placeholder='[{"Plan": {"Node Type": "Seq Scan", "Relation Name": "users", ...}}]'
                    value={executionPlan}
                    onChange={(e) => setExecutionPlan(e.target.value)}
                    className="min-h-[120px] font-mono text-xs"
                  />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Metrics (Optional) */}
          <Collapsible open={useMetrics} onOpenChange={setUseMetrics}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center text-base">
                        <Zap className="h-5 w-5 mr-2" />
                        성능 메트릭 (선택사항)
                        {useMetrics && metrics.calls > 0 && <Badge variant="secondary" className="ml-2 text-xs">입력됨</Badge>}
                      </CardTitle>
                      <CardDescription>pg_stat_statements 통계를 입력하면 더 정확한 분석이 가능합니다</CardDescription>
                    </div>
                    {useMetrics ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {[
                      { key: 'calls', label: '실행 횟수 (calls)' },
                      { key: 'total_exec_time', label: '총 실행시간 (ms)' },
                      { key: 'mean_exec_time', label: '평균 실행시간 (ms)' },
                      { key: 'rows', label: '처리 행수' },
                      { key: 'shared_blks_hit', label: 'Shared Blks Hit' },
                      { key: 'shared_blks_read', label: 'Shared Blks Read' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <Label>{label}</Label>
                        <input
                          type="number"
                          value={(metrics as any)[key]}
                          onChange={(e) => setMetrics(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                          className="w-full mt-1 px-3 py-2 border rounded-md text-sm dark:bg-gray-900 dark:border-gray-700"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* AI Analysis Results */}
          {(streamContent || isAnalyzing) && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center">
                    <Sparkles className="h-5 w-5 mr-2 text-purple-600" />
                    AI 분석 결과
                  </CardTitle>
                  {analysisComplete && (
                    <Button variant="outline" size="sm" onClick={exportAnalysis}>
                      <Download className="h-4 w-4 mr-2" />내보내기
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Streaming / result content */}
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                  {streamContent || (
                    <div className="flex items-center text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />분석 중...
                    </div>
                  )}
                  {isAnalyzing && <span className="inline-block w-2 h-5 bg-purple-500 animate-pulse ml-0.5" />}
                </div>

                {/* Follow-up chat messages */}
                {chatMessages.length > 1 && (
                  <div className="border-t pt-4 space-y-3">
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <MessageSquare className="h-4 w-4" /><span>추가 질문 대화</span>
                    </div>
                    <div ref={chatContainerRef} className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                      {chatMessages.slice(1).map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-lg p-3 ${msg.role === 'user' ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'}`}>
                            <div className="flex items-center space-x-2 mb-1">
                              {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                              <span className="text-xs opacity-70">{msg.role === 'user' ? '사용자' : 'AI'}</span>
                            </div>
                            <div className={`text-sm whitespace-pre-wrap ${msg.role === 'assistant' ? 'prose prose-sm dark:prose-invert max-w-none' : ''}`}>
                              {msg.content || <span className="flex items-center"><Loader2 className="h-4 w-4 animate-spin mr-2" />응답 생성 중...</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Follow-up input */}
                {analysisComplete && (
                  <div className="pt-4 border-t">
                    <div className="flex space-x-2">
                      <Input
                        placeholder="추가 질문을 입력하세요... (예: 인덱스를 추가하면 어떻게 될까요?)"
                        value={followUpQuestion}
                        onChange={(e) => setFollowUpQuestion(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFollowUp() } }}
                        disabled={isSendingFollowUp}
                      />
                      <Button onClick={sendFollowUp} disabled={!followUpQuestion.trim() || isSendingFollowUp}>
                        {isSendingFollowUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">분석 결과에 대해 추가 질문을 할 수 있습니다. AI가 이전 대화 맥락을 기억합니다.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Panel - Controls */}
        <div className="space-y-4">
          {/* Analysis Context */}
          <Card>
            <CardHeader><CardTitle className="flex items-center"><Lightbulb className="h-5 w-5 mr-2" />분석 유형</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(CONTEXT_INFO) as AnalysisContext[]).map((ctx) => {
                  const info = CONTEXT_INFO[ctx]
                  const Icon = info.icon
                  return (
                    <Button key={ctx} variant={context === ctx ? 'default' : 'outline'} className="flex flex-col items-center h-auto py-3" onClick={() => setContext(ctx)}>
                      <Icon className="h-5 w-5 mb-1" /><span className="text-xs">{info.label}</span>
                    </Button>
                  )
                })}
              </div>
              <p className="text-sm text-gray-500">{CONTEXT_INFO[context].description}</p>
            </CardContent>
          </Card>

          {/* Language */}
          <Card>
            <CardHeader><CardTitle className="text-base">응답 언어</CardTitle></CardHeader>
            <CardContent>
              <Select value={language} onValueChange={(v) => setLanguage(v as SupportedLanguage)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ko">한국어</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Submit */}
          <Button className="w-full" size="lg" onClick={handleSubmit} disabled={!sqlText.trim() || isAnalyzing}>
            {isAnalyzing ? <><RefreshCw className="h-5 w-5 mr-2 animate-spin" />분석 중...</> : <><Send className="h-5 w-5 mr-2" />AI 분석 시작</>}
          </Button>

          {/* History */}
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center text-base"><History className="h-5 w-5 mr-2" />최근 분석 기록</CardTitle>
                    <div className="flex items-center space-x-2">
                      <Badge variant="secondary">{history.length}</Badge>
                      {historyOpen ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  {history.length > 0 ? (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {history.map((item) => (
                        <div key={item.id} className="p-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer" onClick={() => loadFromHistory(item)}>
                          <div className="flex items-center justify-between mb-1">
                            <Badge variant="outline" className="text-xs">{CONTEXT_INFO[item.context].label}</Badge>
                            <span className="text-xs text-gray-500">{new Date(item.timestamp).toLocaleString('ko-KR')}</span>
                          </div>
                          <p className="text-sm font-mono text-gray-700 dark:text-gray-300 line-clamp-2">{item.sql_text}</p>
                        </div>
                      ))}
                      <Button variant="ghost" size="sm" className="w-full text-red-600" onClick={(e) => { e.stopPropagation(); clearHistory() }}>
                        <Trash2 className="h-4 w-4 mr-2" />기록 삭제
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">분석 기록이 없습니다</p>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Tips */}
          <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200">
            <CardContent className="pt-4">
              <div className="flex items-start space-x-3">
                <Lightbulb className="h-5 w-5 text-purple-600 mt-0.5" />
                <div>
                  <p className="font-medium text-purple-900 dark:text-purple-300 text-sm">분석 팁</p>
                  <ul className="text-xs text-purple-700 dark:text-purple-400 mt-1 space-y-1">
                    <li>• queryid로 조회하면 실행계획과 메트릭이 자동으로 입력됩니다</li>
                    <li>• 분석 완료 후 추가 질문으로 상세한 내용을 확인하세요</li>
                    <li>• 실행계획(EXPLAIN JSON)을 함께 입력하면 더 정확한 분석이 가능합니다</li>
                    <li>• pg_hint_plan 확장을 사용 중이면 힌트도 제안합니다</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
