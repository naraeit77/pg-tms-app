'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, Gauge, Users, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

export default function RealtimePage() {
  const { selectedConnectionId } = useSelectedDatabase();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['realtime', selectedConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring/realtime?connection_id=${selectedConnectionId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.error || 'Failed');
        (err as any).code = body.code;
        throw err;
      }
      return res.json();
    },
    enabled: !!selectedConnectionId,
    refetchInterval: (query) => {
      if (query.state.error && (query.state.error as any).code === 'CONNECTION_ERROR') {
        return false;
      }
      return 5000;
    },
    retry: (failureCount, err) => {
      if ((err as any).code === 'CONNECTION_ERROR') return false;
      return failureCount < 2;
    },
  });

  const rt = data?.data;
  const global = rt?.global;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="h-6 w-6" /> 실시간 모니터링
          <Badge className="bg-green-500 text-white text-xs animate-pulse">LIVE</Badge>
        </h1>
        <p className="text-muted-foreground">5초 간격 자동 갱신</p>
      </div>

      {!selectedConnectionId ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">DB를 선택해주세요</CardContent></Card>
      ) : isError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-2">모니터링 데이터 조회 실패</h3>
            <p className="text-muted-foreground text-center max-w-md">
              {(error as any)?.code === 'CONNECTION_ERROR'
                ? '대상 데이터베이스에 연결할 수 없습니다. DB 연결 정보를 확인해주세요.'
                : error?.message || '데이터를 가져오는 중 오류가 발생했습니다.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cache Hit Ratio</CardTitle>
                <Gauge className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{isLoading ? '-' : `${global?.cache_hit_ratio ?? 0}%`}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Backends</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{isLoading ? '-' : rt?.activeSessionCount ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  Idle in Tx: {rt?.idleInTxCount ?? 0} / Total: {rt?.totalSessionCount ?? 0}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Transactions</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{isLoading ? '-' : (global?.tx_committed ?? 0).toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Rollback: {(global?.tx_rolled_back ?? 0).toLocaleString()}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Deadlocks</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{isLoading ? '-' : global?.deadlocks ?? 0}</div>
              </CardContent>
            </Card>
          </div>

          {/* Top Wait Events */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Wait Events</CardTitle>
            </CardHeader>
            <CardContent>
              {!rt?.topWaitEvents?.length ? (
                <p className="text-muted-foreground text-sm">대기 이벤트 없음</p>
              ) : (
                <div className="space-y-2">
                  {rt.topWaitEvents.map((w: any) => (
                    <div key={`${w.wait_event_type}-${w.wait_event}`} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{w.wait_event_type}</Badge>
                        <span className="text-sm font-mono">{w.wait_event}</span>
                      </div>
                      <span className="font-mono text-sm font-bold">{w.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-right">
            Last update: {rt?.timestamp ? new Date(rt.timestamp).toLocaleTimeString('ko-KR') : '-'}
          </p>
        </>
      )}
    </div>
  );
}
