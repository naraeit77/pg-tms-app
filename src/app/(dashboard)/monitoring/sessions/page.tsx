'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

const stateColors: Record<string, string> = {
  active: 'bg-green-500',
  idle: 'bg-slate-400',
  'idle in transaction': 'bg-yellow-500',
  'idle in transaction (aborted)': 'bg-red-500',
  'fastpath function call': 'bg-blue-500',
  disabled: 'bg-slate-300',
};

export default function SessionsPage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['sessions', selectedConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring/sessions?connection_id=${selectedConnectionId}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedConnectionId,
    refetchInterval: 10000,
  });

  const killMutation = useMutation({
    mutationFn: async (pid: number) => {
      const res = await fetch('/api/monitoring/sessions/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: selectedConnectionId, pid }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', selectedConnectionId] });
    },
  });

  const rows = data?.data || [];
  const activeCount = rows.filter((r: any) => r.state === 'active').length;
  const idleInTxCount = rows.filter((r: any) => r.state === 'idle in transaction').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6" /> 활성 세션</h1>
          <p className="text-muted-foreground">
            총 {rows.length}개 세션 | Active: {activeCount} | Idle in Tx: {idleInTxCount}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PID</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>Wait Event</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="max-w-[300px]">Query</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8">로딩 중...</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8">세션이 없습니다</TableCell></TableRow>
                ) : (
                  rows.map((row: any) => (
                    <TableRow key={row.pid}>
                      <TableCell className="font-mono text-xs">{row.pid}</TableCell>
                      <TableCell>
                        <Badge className={`${stateColors[row.state] || 'bg-slate-400'} text-white text-xs`}>
                          {row.state}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{row.usename}</TableCell>
                      <TableCell className="text-xs truncate max-w-[100px]">{row.application_name}</TableCell>
                      <TableCell className="text-xs">
                        {row.wait_event_type && (
                          <span className="text-orange-600">{row.wait_event_type}: {row.wait_event}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.query_duration_ms != null ? `${(row.query_duration_ms / 1000).toFixed(1)}s` : '-'}
                      </TableCell>
                      <TableCell className="max-w-[300px]">
                        <div className="font-mono text-xs truncate" title={row.query}>{row.query}</div>
                      </TableCell>
                      <TableCell className="text-xs">{row.client_addr}</TableCell>
                      <TableCell>
                        {row.state === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 h-6 w-6 p-0"
                            onClick={() => {
                              if (confirm(`PID ${row.pid} 세션을 종료하시겠습니까?`)) {
                                killMutation.mutate(row.pid);
                              }
                            }}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
