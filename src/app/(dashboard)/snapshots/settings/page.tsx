'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { Settings, Play, Square } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function SnapshotSettingsPage() {
  const { data, refetch } = useQuery({
    queryKey: ['scheduler-status'],
    queryFn: async () => {
      const res = await fetch('/api/scheduler');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    refetchInterval: 10000,
  });

  const actionMutation = useMutation({
    mutationFn: async (action: string) => {
      const res = await fetch('/api/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, snapshotInterval: 300, retentionDays: 90 }),
      });
      return res.json();
    },
    onSuccess: () => refetch(),
  });

  const status = data?.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="h-6 w-6" /> 스냅샷 설정</h1>
        <p className="text-muted-foreground">자동 스냅샷 수집 스케줄러 관리</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            스케줄러 상태
            <Badge variant={status?.isRunning ? 'default' : 'secondary'} className={status?.isRunning ? 'bg-green-500 text-white' : ''}>
              {status?.isRunning ? '실행 중' : '중지됨'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">스냅샷 수집 수</div>
              <div className="text-lg font-bold font-mono">{status?.snapshotCount ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">에러 수</div>
              <div className="text-lg font-bold font-mono">{status?.errorCount ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">마지막 수집</div>
              <div className="text-sm">{status?.lastSnapshotAt ? new Date(status.lastSnapshotAt).toLocaleString('ko-KR') : '-'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">마지막 정리</div>
              <div className="text-sm">{status?.lastPurgeAt ? new Date(status.lastPurgeAt).toLocaleString('ko-KR') : '-'}</div>
            </div>
          </div>

          <div className="flex gap-2">
            {!status?.isRunning ? (
              <Button onClick={() => actionMutation.mutate('start')} disabled={actionMutation.isPending}>
                <Play className="mr-2 h-4 w-4" />
                스케줄러 시작 (5분 주기)
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => actionMutation.mutate('stop')} disabled={actionMutation.isPending}>
                <Square className="mr-2 h-4 w-4" />
                스케줄러 중지
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground space-y-1 bg-slate-50 p-3 rounded">
            <p>- 스냅샷 수집 주기: 5분 (300초)</p>
            <p>- 데이터 보관 기간: 90일</p>
            <p>- 모든 활성 연결에 대해 자동 수집</p>
            <p>- 오래된 스냅샷 자동 정리 (일 1회)</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
