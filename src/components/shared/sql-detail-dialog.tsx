'use client';

/**
 * SQL Detail Dialog - SQL Elapse Map에서 선택된 SQL 포인트들을 팝업 모달로 표시
 * 인스턴스 모니터링 및 멀티 인스턴스 모니터링에서 공통 사용
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { getElapsedGrade, formatElapsed, type SqlElapsePoint } from '@/components/charts/sql-elapse-map';

interface SqlDetailDialogProps {
  points: SqlElapsePoint[];
  open: boolean;
  onClose: () => void;
}

export function SqlDetailDialog({ points, open, onClose }: SqlDetailDialogProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const sorted = [...points].sort((a, b) => b.elapsed - a.elapsed);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const gradeSummary = (['A', 'B', 'C', 'D', 'F'] as const).map(grade => {
    const count = points.filter(p => getElapsedGrade(p.elapsed).grade === grade).length;
    const info = getElapsedGrade(grade === 'A' ? 0 : grade === 'B' ? 0.5 : grade === 'C' ? 3 : grade === 'D' ? 10 : 20);
    return { grade, count, info };
  }).filter(g => g.count > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setExpandedIndex(null); } }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            SQL 상세 정보
            <Badge variant="outline" className="text-[10px] font-mono">
              {points.length}개 선택됨
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Grade Summary */}
        <div className="flex items-center gap-3 pb-3 border-b border-border/50">
          {gradeSummary.map(({ grade, count, info }) => (
            <div key={grade} className="flex items-center gap-1.5 text-xs">
              <span className={cn(
                'inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold border',
                info.bgColor, info.color
              )}>
                {grade}
              </span>
              <span className="text-muted-foreground">{info.label}</span>
              <span className="font-bold">{count}</span>
            </div>
          ))}
        </div>

        {/* SQL List */}
        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 border-b border-border sticky top-0 z-10">
                {['', '등급', 'PID', 'User', 'Query ID', 'Elapsed', 'Query'].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => {
                const g = getElapsedGrade(p.elapsed);
                const isExpanded = expandedIndex === i;
                return (
                  <tr
                    key={i}
                    className={cn(
                      'border-b border-border/30 cursor-pointer transition-colors',
                      isExpanded ? 'bg-muted/30' : 'hover:bg-muted/20'
                    )}
                    onClick={() => setExpandedIndex(isExpanded ? null : i)}
                  >
                    <td className="px-3 py-2 w-6">
                      {isExpanded
                        ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                        : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        'inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold border',
                        g.bgColor, g.color
                      )}>
                        {g.grade}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-blue-400">{p.pid || '-'}</td>
                    <td className="px-3 py-2">{p.user || '-'}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{p.queryid || '-'}</td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        'font-mono font-semibold',
                        p.elapsed >= 15 ? 'text-red-400' : p.elapsed >= 3 ? 'text-orange-400' : ''
                      )}>
                        {formatElapsed(p.elapsed)}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">
                      {isExpanded ? (
                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground font-sans">SQL Full Text</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 gap-1 text-[10px] px-1.5"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(p.query || '');
                              }}
                            >
                              {copied ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
                              {copied ? '복사됨' : '복사'}
                            </Button>
                          </div>
                          <pre className="rounded-md bg-muted/50 p-3 font-mono text-[11px] whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto border border-border/50">
                            {p.query || '-'}
                          </pre>
                          <div className="rounded-md bg-muted/50 p-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-sans">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">PID</span>
                              <span className="font-mono text-blue-400">{p.pid || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">User</span>
                              <span className="font-mono">{p.user || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">실행시간</span>
                              <span className={cn(
                                'font-mono font-bold',
                                p.elapsed >= 15 ? 'text-red-400' : p.elapsed >= 3 ? 'text-orange-400' : ''
                              )}>
                                {formatElapsed(p.elapsed)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">등급</span>
                              <span className={cn('font-bold', g.color)}>{g.grade} - {g.label}</span>
                            </div>
                            <div className="flex justify-between col-span-2">
                              <span className="text-muted-foreground">Query ID</span>
                              <span className="font-mono">{p.queryid || <span className="text-muted-foreground/50 italic">N/A</span>}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">시간</span>
                              <span className="font-mono">{p.time}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="truncate block max-w-[400px]" title={p.query}>
                          {p.query?.replace(/\s+/g, ' ').substring(0, 120) || '-'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
