'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot, Send, Loader2, Plus, Trash2, Wrench, CheckSquare, Square,
  Database, MessageSquare, X, CheckCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { cn } from '@/lib/utils';

const QUICK_QUESTIONS = [
  '가장 느린 쿼리 5개를 보여줘',
  'Shared Blocks Read가 높은 쿼리는?',
  '현재 활성 세션 상태를 알려줘',
  'Temp 사용량이 높은 쿼리는?',
  '인덱스 추천을 해줘',
];

interface ChatMsg {
  role: string;
  content: string;
  toolCalls?: any[];
  toolResults?: any[];
}

export default function ChatPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Selection mode for bulk delete
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: sessionsData } = useQuery({
    queryKey: ['ai-chat-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/ai/chat/sessions');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const sessions: any[] = sessionsData?.data || [];

  const loadMessages = async (sid: string) => {
    const res = await fetch(`/api/ai/chat/sessions/${sid}/messages`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.data.map((m: any) => ({
        role: m.role,
        content: m.content || '',
        toolCalls: m.toolCalls,
        toolResults: m.toolResults,
      })));
    }
    setSessionId(sid);
  };

  const handleNewChat = () => {
    setSessionId(null);
    setMessages([]);
    setStreamingContent('');
    setActiveTools([]);
  };

  // ── SSE Streaming Send ──
  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming || !selectedConnectionId) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsStreaming(true);
    setStreamingContent('');
    setActiveTools([]);

    try {
      const res = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          connection_id: selectedConnectionId,
          message: userMsg,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Chat failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let toolCalls: any[] = [];
      let toolResults: any[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case 'session':
                if (!sessionId) setSessionId(data.session_id);
                break;
              case 'tool_start':
                setActiveTools(prev => [...prev, data.name]);
                toolCalls.push({ function: { name: data.name, arguments: data.arguments } });
                break;
              case 'tool_result':
                setActiveTools(prev => prev.filter(t => t !== data.name));
                toolResults.push({ name: data.name, result: data.result });
                break;
              case 'content':
                accumulated += data.content;
                setStreamingContent(accumulated);
                break;
              case 'done':
                break;
              case 'error':
                accumulated = `오류: ${data.error}`;
                setStreamingContent(accumulated);
                break;
            }
          } catch {}
        }
      }

      // Finalize
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: accumulated,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        toolResults: toolResults.length > 0 ? toolResults : undefined,
      }]);
      setStreamingContent('');
      queryClient.invalidateQueries({ queryKey: ['ai-chat-sessions'] });
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `오류: ${error.message}` }]);
    } finally {
      setIsStreaming(false);
      setActiveTools([]);
    }
  }, [input, isStreaming, sessionId, selectedConnectionId, queryClient]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamingContent]);

  // ── Delete handlers ──
  const deleteMutation = useMutation({
    mutationFn: async (payload: { id?: string; ids?: string[]; all?: boolean }) => {
      const res = await fetch('/api/ai/chat/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Delete failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-chat-sessions'] });
      setSelectedIds(new Set());
      setSelectMode(false);
      // If current session was deleted, reset
      if (sessionId) {
        setSessionId(null);
        setMessages([]);
      }
    },
  });

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    deleteMutation.mutate({ ids: Array.from(selectedIds) });
  };

  const handleDeleteAll = () => {
    if (!confirm('모든 대화를 삭제하시겠습니까?')) return;
    deleteMutation.mutate({ all: true });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sessions.map((s: any) => s.id)));
    }
  };

  return (
    <div className="flex h-[calc(100vh-140px)] gap-3 p-2">
      {/* ── 세션 목록 ── */}
      <div className="w-72 flex-shrink-0">
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-2 flex-shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">대화 목록</CardTitle>
              <div className="flex items-center gap-1">
                {selectMode ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={toggleSelectAll} className="h-7 px-2 text-xs" title="전체 선택">
                      <CheckCheck className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDeleteSelected}
                      disabled={selectedIds.size === 0 || deleteMutation.isPending}
                      className="h-7 px-2 text-xs text-red-500 hover:text-red-600"
                      title="선택 삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {selectedIds.size > 0 && <span className="ml-1">{selectedIds.size}</span>}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }} className="h-7 px-2 text-xs">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    {sessions.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)} className="h-7 px-2 text-xs text-muted-foreground" title="선택 모드">
                        <CheckSquare className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={handleNewChat} className="h-7 w-7 p-0" title="새 대화">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            {/* Bulk actions */}
            {selectMode && sessions.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteAll}
                disabled={deleteMutation.isPending}
                className="w-full h-7 text-xs text-red-500 hover:text-red-600 mt-1"
              >
                <Trash2 className="h-3 w-3 mr-1" />전체 삭제 ({sessions.length}개)
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-2 flex-1 overflow-auto">
            {sessions.length === 0 ? (
              <div className="text-center text-muted-foreground text-xs py-8">대화가 없습니다</div>
            ) : (
              sessions.map((s: any) => (
                <div
                  key={s.id}
                  className={cn(
                    'flex items-start gap-2 px-2 py-2 rounded text-xs mb-1 transition-colors cursor-pointer',
                    sessionId === s.id ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/50',
                  )}
                  onClick={() => selectMode ? toggleSelect(s.id) : loadMessages(s.id)}
                >
                  {selectMode && (
                    <div className="flex-shrink-0 mt-0.5">
                      {selectedIds.has(s.id) ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{s.title}</div>
                    <div className="text-muted-foreground text-[10px] mt-0.5">
                      {new Date(s.lastMessageAt).toLocaleString('ko-KR')} · {s.messageCount}개
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 채팅 영역 ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <Card className="flex-1 flex flex-col">
          <CardHeader className="pb-2 flex-shrink-0 border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" /> AI 튜닝 어드바이저
              {selectedConnection && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Database className="h-3 w-3" />{selectedConnection.name}
                </Badge>
              )}
              {sessionId && (
                <span className="text-xs text-muted-foreground ml-auto font-normal">
                  {messages.filter(m => m.role === 'user').length}개 질문
                </span>
              )}
            </CardTitle>
          </CardHeader>

          {/* 메시지 목록 */}
          <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-4">
            {messages.length === 0 && !isStreaming && (
              <div className="text-center text-muted-foreground py-16">
                <Bot className="h-14 w-14 mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-sm font-medium mb-1">PostgreSQL 튜닝 어드바이저</p>
                <p className="text-xs mb-6">데이터베이스 성능 분석, 인덱스 추천, 쿼리 최적화에 대해 물어보세요.</p>
                <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
                  {QUICK_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}

            {/* Streaming state */}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="max-w-[80%] space-y-2">
                  {/* Tool execution indicators */}
                  {activeTools.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {activeTools.map((tool, j) => (
                        <Badge key={j} variant="secondary" className="text-[10px] gap-1 animate-pulse">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          {tool === 'query_stats' ? 'SQL 통계 조회 중...' :
                           tool === 'explain_query' ? '실행계획 분석 중...' :
                           tool === 'table_info' ? '테이블 정보 조회 중...' :
                           tool === 'index_info' ? '인덱스 정보 조회 중...' :
                           `${tool} 실행 중...`}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {/* Streaming content */}
                  {streamingContent ? (
                    <div className="bg-muted/50 rounded-lg px-4 py-3 border border-border/50">
                      <div className="text-sm whitespace-pre-wrap">{streamingContent}<span className="animate-pulse">▊</span></div>
                    </div>
                  ) : activeTools.length === 0 && (
                    <div className="bg-muted/50 rounded-lg px-4 py-2 flex items-center gap-2 border border-border/50">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">생각 중...</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 입력 영역 */}
          <div className="p-4 border-t flex-shrink-0">
            {!selectedConnectionId && (
              <p className="text-xs text-amber-600 mb-2">상단에서 데이터베이스를 선택해주세요.</p>
            )}
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="질문을 입력하세요... (Enter로 전송)"
                disabled={!selectedConnectionId || isStreaming}
                className="flex-1"
              />
              <Button onClick={handleSend} disabled={!input.trim() || !selectedConnectionId || isStreaming} size="icon">
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ─── Message Bubble ─── */

function MessageBubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === 'user';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[80%] rounded-lg px-4 py-3',
        isUser
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted/50 border border-border/50',
      )}>
        {/* Tool call badges */}
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {msg.toolCalls.map((tc: any, j: number) => (
              <Badge key={j} variant="secondary" className="text-[10px] gap-1">
                <Wrench className="h-2.5 w-2.5" />
                {tc.function?.name}
              </Badge>
            ))}
          </div>
        )}
        {/* Content with basic formatting */}
        <div className={cn('text-sm whitespace-pre-wrap leading-relaxed', isUser && 'text-primary-foreground')}>
          {formatContent(msg.content)}
        </div>
      </div>
    </div>
  );
}

/* ─── Basic content formatting (code blocks, bold) ─── */

function formatContent(text: string) {
  if (!text) return null;

  // Split by code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const content = part.slice(3, -3);
      const firstLine = content.indexOf('\n');
      const code = firstLine > -1 ? content.slice(firstLine + 1) : content;
      const lang = firstLine > -1 ? content.slice(0, firstLine).trim() : '';
      return (
        <pre key={i} className="bg-slate-900 text-slate-100 rounded-md px-3 py-2 my-2 overflow-x-auto text-xs font-mono">
          {lang && <div className="text-[10px] text-slate-400 mb-1">{lang}</div>}
          <code>{code}</code>
        </pre>
      );
    }
    // Inline code
    const inlineParts = part.split(/(`[^`]+`)/g);
    return (
      <span key={i}>
        {inlineParts.map((ip, j) => {
          if (ip.startsWith('`') && ip.endsWith('`')) {
            return <code key={j} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{ip.slice(1, -1)}</code>;
          }
          // Bold
          const boldParts = ip.split(/(\*\*[^*]+\*\*)/g);
          return boldParts.map((bp, k) => {
            if (bp.startsWith('**') && bp.endsWith('**')) {
              return <strong key={`${j}-${k}`}>{bp.slice(2, -2)}</strong>;
            }
            return <span key={`${j}-${k}`}>{bp}</span>;
          });
        })}
      </span>
    );
  });
}
