'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

export default function TuningRegisterPage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const router = useRouter();
  const [form, setForm] = useState({ queryid: '', sql_text: '', priority: 'MEDIUM' });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/tuning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
          queryid: parseInt(form.queryid),
          sql_text: form.sql_text,
          priority: form.priority,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => router.push('/tuning'),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">SQL 등록</h1>
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Query ID</Label>
              <Input type="number" value={form.queryid} onChange={(e) => setForm({ ...form, queryid: e.target.value })} placeholder="pg_stat_statements queryid" />
            </div>
            <div className="space-y-2">
              <Label>우선순위</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HIGH">HIGH</SelectItem>
                  <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                  <SelectItem value="LOW">LOW</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>SQL 텍스트</Label>
            <Textarea value={form.sql_text} onChange={(e) => setForm({ ...form, sql_text: e.target.value })} className="font-mono text-sm min-h-[150px]" placeholder="SELECT ..." />
          </div>
          <Button onClick={() => mutation.mutate()} disabled={!form.queryid || !form.sql_text || mutation.isPending}>
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            등록
          </Button>
          {mutation.isError && <p className="text-red-500 text-sm">{(mutation.error as Error).message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
