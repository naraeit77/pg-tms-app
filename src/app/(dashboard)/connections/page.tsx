'use client';

/**
 * PG 연결 관리 페이지
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function ConnectionsPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    host: 'localhost',
    port: '5432',
    database: '',
    username: '',
    password: '',
    sslMode: 'prefer',
  });

  const { data: connections, isLoading } = useQuery({
    queryKey: ['pg-connections'],
    queryFn: async () => {
      const res = await fetch('/api/pg/connections');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const [createError, setCreateError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/pg/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pg-connections'] });
      queryClient.invalidateQueries({ queryKey: ['database-selector-connections'] });
      setIsDialogOpen(false);
      setCreateError(null);
      resetForm();
    },
    onError: (error: Error) => {
      setCreateError(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/pg/connections/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pg-connections'] });
      queryClient.invalidateQueries({ queryKey: ['database-selector-connections'] });
    },
  });

  const resetForm = () => {
    setForm({ name: '', description: '', host: 'localhost', port: '5432', database: '', username: '', password: '', sslMode: 'prefer' });
    setTestResult(null);
    setCreateError(null);
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/pg/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: form.host,
          port: parseInt(form.port),
          database: form.database,
          username: form.username,
          password: form.password,
          sslMode: form.sslMode,
        }),
      });
      const data = await res.json();
      setTestResult(data.data);
    } catch (err: any) {
      setTestResult({ isHealthy: false, error: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = () => {
    createMutation.mutate({
      ...form,
      port: parseInt(form.port),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">DB 연결 관리</h1>
          <p className="text-muted-foreground">PostgreSQL 대상 데이터베이스 연결을 관리합니다</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              새 연결 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>PostgreSQL 연결 추가</DialogTitle>
              <DialogDescription>대상 PostgreSQL 데이터베이스 연결 정보를 입력하세요</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">연결 이름 *</Label>
                  <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="운영DB" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sslMode">SSL 모드</Label>
                  <Select value={form.sslMode} onValueChange={(v) => setForm({ ...form, sslMode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="disable">disable</SelectItem>
                      <SelectItem value="prefer">prefer</SelectItem>
                      <SelectItem value="require">require</SelectItem>
                      <SelectItem value="verify-full">verify-full</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-3 space-y-2">
                  <Label htmlFor="host">호스트 *</Label>
                  <Input id="host" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="localhost" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port">포트</Label>
                  <Input id="port" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="5432" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="database">데이터베이스 *</Label>
                <Input id="database" value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} placeholder="mydb" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">사용자명 *</Label>
                  <Input id="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="postgres" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">비밀번호 *</Label>
                  <Input id="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">설명</Label>
                <Input id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="운영 환경 PostgreSQL" />
              </div>

              {testResult && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${testResult.isHealthy ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {testResult.isHealthy ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {testResult.isHealthy
                    ? `연결 성공! PostgreSQL ${testResult.version} (${testResult.responseTimeMs}ms) | pg_stat_statements: ${testResult.pgStatStatementsEnabled ? '활성' : '비활성'}`
                    : `연결 실패: ${testResult.error}`
                  }
                </div>
              )}

              {createError && (
                <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span>연결 추가 실패: {createError}</span>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleTest} disabled={isTesting || !form.host || !form.database || !form.username || !form.password}>
                {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                연결 테스트
              </Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || !form.name || !form.host || !form.database || !form.username || !form.password}>
                {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                추가
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !connections || connections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Database className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">등록된 연결이 없습니다</h3>
            <p className="text-muted-foreground mb-4">&quot;새 연결 추가&quot; 버튼을 클릭하여 PostgreSQL 연결을 추가하세요</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {connections.map((conn: any) => (
            <Card key={conn.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                <div className="space-y-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    {conn.name}
                    <Badge variant={conn.health_status === 'HEALTHY' ? 'default' : 'outline'} className={conn.health_status === 'HEALTHY' ? 'bg-green-500 text-white text-xs' : 'text-xs'}>
                      {conn.health_status || 'UNKNOWN'}
                    </Badge>
                    {conn.is_default && <Badge variant="secondary" className="text-xs">기본</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {conn.host}:{conn.port}/{conn.database} ({conn.username})
                    {conn.pg_version && ` | PostgreSQL ${conn.pg_version}`}
                    {conn.pg_stat_statements_enabled && ' | pg_stat_statements'}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => { if (confirm(`"${conn.name}" 연결을 삭제하시겠습니까?`)) deleteMutation.mutate(conn.id); }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardHeader>
              {conn.description && (
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">{conn.description}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
