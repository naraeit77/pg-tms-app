'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Send, Loader2, Plus, Trash2, Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

const QUICK_QUESTIONS = [
  '가장 느린 쿼리 5개를 보여줘',
  'Shared Blocks Read가 높은 쿼리는?',
  '현재 활성 세션 상태를 알려줘',
  'Temp 사용량이 높은 쿼리는?',
  '인덱스 추천을 해줘',
];

export default function ChatPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ role: string; content: string; toolCalls?: any[]; toolResults?: any[] }>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: sessionsData } = useQuery({
    queryKey: ['ai-chat-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/ai/chat/sessions');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

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

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          connection_id: selectedConnectionId,
          message,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Chat failed');
      }
      return res.json();
    },
    onMutate: (message) => {
      setMessages((prev) => [...prev, { role: 'user', content: message }]);
      setInput('');
    },
    onSuccess: (data) => {
      const d = data.data;
      if (!sessionId) setSessionId(d.session_id);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: d.content,
        toolCalls: d.tool_calls,
        toolResults: d.tool_results,
      }]);
      queryClient.invalidateQueries({ queryKey: ['ai-chat-sessions'] });
    },
    onError: (error) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: `오류: ${error.message}` }]);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;
    chatMutation.mutate(input.trim());
  };

  const handleNewChat = () => {
    setSessionId(null);
    setMessages([]);
  };

  const sessions = sessionsData?.data || [];

  return (
    <div className="flex h-[calc(100vh-140px)] gap-4">
      {/* 세션 목록 */}
      <div className="w-64 flex-shrink-0">
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-2 flex-shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">대화 목록</CardTitle>
              <Button variant="ghost" size="sm" onClick={handleNewChat} className="h-7 w-7 p-0">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-2 flex-1 overflow-auto">
            {sessions.map((s: any) => (
              <button
                key={s.id}
                onClick={() => loadMessages(s.id)}
                className={`w-full text-left px-3 py-2 rounded text-xs mb-1 transition-colors ${
                  sessionId === s.id ? 'bg-slate-100 font-medium' : 'hover:bg-slate-50'
                }`}
              >
                <div className="truncate">{s.title}</div>
                <div className="text-muted-foreground text-[10px]">
                  {new Date(s.lastMessageAt).toLocaleString('ko-KR')} · {s.messageCount}개
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* 채팅 영역 */}
      <div className="flex-1 flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardHeader className="pb-2 flex-shrink-0 border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-5 w-5" /> AI 튜닝 어드바이저
              {selectedConnection && (
                <Badge variant="outline" className="text-xs">{selectedConnection.name}</Badge>
              )}
            </CardTitle>
          </CardHeader>

          {/* 메시지 목록 */}
          <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <Bot className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                <p className="text-sm mb-4">PostgreSQL 튜닝에 대해 물어보세요.</p>
                <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
                  {QUICK_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); }}
                      className="text-xs px-3 py-1.5 rounded-full border hover:bg-slate-50 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  msg.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100'
                }`}>
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {msg.toolCalls.map((tc: any, j: number) => (
                        <Badge key={j} variant="secondary" className="text-[10px]">
                          <Wrench className="h-2.5 w-2.5 mr-1" />
                          {tc.function?.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}

            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-lg px-4 py-2 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">데이터베이스 조회 중...</span>
                </div>
              </div>
            )}
          </div>

          {/* 입력 영역 */}
          <div className="p-4 border-t flex-shrink-0">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="질문을 입력하세요..."
                disabled={!selectedConnectionId || chatMutation.isPending}
                className="flex-1"
              />
              <Button onClick={handleSend} disabled={!input.trim() || !selectedConnectionId || chatMutation.isPending}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
