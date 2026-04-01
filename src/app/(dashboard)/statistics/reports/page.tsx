'use client';

/**
 * 보고서 (Reports)
 * WhaTap 보고서 스타일
 * 스냅샷 기반 보고서 생성 + AI 보고서
 */

import { useQuery } from '@tanstack/react-query';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { WidgetCard } from '@/components/shared/widget-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw, FileText, Download, Clock, Bot, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface Snapshot {
  id: string;
  status: string;
  tps: number;
  activeConnections: number;
  cacheHitRatio: number;
  createdAt: string;
}

export default function ReportsPage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [reportType, setReportType] = useState<'snapshot' | 'ai'>('snapshot');

  const { data: snapshotData, isLoading } = useQuery({
    queryKey: ['snapshots', selectedConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/snapshots?connection_id=${selectedConnectionId}&limit=20`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedConnectionId,
  });

  const snapshots: Snapshot[] = snapshotData || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-lg font-bold">보고서</h1>
        <Select value={reportType} onValueChange={(v) => setReportType(v as any)}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="snapshot" className="text-xs">스냅샷 보고서</SelectItem>
            <SelectItem value="ai" className="text-xs">AI 분석 보고서</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-border/50 hover:border-blue-500/30 transition-colors cursor-pointer">
          <Link href="/snapshots/compare">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-400" />
                스냅샷 비교 보고서
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">두 시점의 스냅샷을 비교하여 성능 변화를 분석합니다.</p>
              <div className="flex items-center gap-1 mt-2 text-xs text-blue-400">
                바로가기 <ArrowRight className="h-3 w-3" />
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="border-border/50 hover:border-purple-500/30 transition-colors cursor-pointer">
          <Link href="/ai-advisor/chat">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="h-4 w-4 text-purple-400" />
                AI 성능 분석
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">AI가 현재 데이터베이스 상태를 분석하고 권고안을 제공합니다.</p>
              <div className="flex items-center gap-1 mt-2 text-xs text-purple-400">
                바로가기 <ArrowRight className="h-3 w-3" />
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="border-border/50 hover:border-emerald-500/30 transition-colors cursor-pointer">
          <Link href="/snapshots">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-emerald-400" />
                스냅샷 이력
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">수집된 스냅샷 목록을 확인하고 관리합니다.</p>
              <div className="flex items-center gap-1 mt-2 text-xs text-emerald-400">
                바로가기 <ArrowRight className="h-3 w-3" />
              </div>
            </CardContent>
          </Link>
        </Card>
      </div>

      {/* Recent Snapshots */}
      <WidgetCard title="최근 스냅샷" fullscreenable>
        {!selectedConnectionId ? (
          <div className="py-8 text-center text-muted-foreground text-sm">DB를 선택해주세요</div>
        ) : snapshots.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            {isLoading ? '로딩 중...' : '수집된 스냅샷이 없습니다'}
          </div>
        ) : (
          <div className="space-y-2">
            {snapshots.slice(0, 10).map((snap) => (
              <div
                key={snap.id}
                className="flex items-center justify-between p-3 rounded-md border border-border/30 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={cn('text-[10px]',
                    snap.status === 'completed' ? 'border-emerald-500/30 text-emerald-400' :
                    snap.status === 'failed' ? 'border-red-500/30 text-red-400' :
                    'border-amber-500/30 text-amber-400'
                  )}>
                    {snap.status}
                  </Badge>
                  <div>
                    <div className="text-xs font-mono text-muted-foreground">
                      {new Date(snap.createdAt).toLocaleString('ko-KR')}
                    </div>
                    <div className="flex gap-3 mt-0.5 text-[11px]">
                      <span>TPS: <strong>{snap.tps?.toFixed(1) || '-'}</strong></span>
                      <span>Active: <strong>{snap.activeConnections || '-'}</strong></span>
                      <span>Cache: <strong>{snap.cacheHitRatio ? `${(snap.cacheHitRatio * 100).toFixed(1)}%` : '-'}</strong></span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/snapshots/${snap.id}`}>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                      <FileText className="h-3 w-3" />
                      상세
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </WidgetCard>
    </div>
  );
}
