'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TableProperties } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function TablesPage() {
  const { selectedConnectionId } = useSelectedDatabase();
  const [tab, setTab] = useState('tables');

  const { data, isLoading } = useQuery({
    queryKey: ['table-stats', selectedConnectionId, tab],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring/tables?connection_id=${selectedConnectionId}&type=${tab}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!selectedConnectionId,
  });

  const rows = data?.data || [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><TableProperties className="h-6 w-6" /> 테이블/인덱스 통계</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="tables">테이블</TabsTrigger>
          <TabsTrigger value="indexes">인덱스</TabsTrigger>
        </TabsList>

        <TabsContent value="tables">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Schema</TableHead>
                      <TableHead>Table</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead className="text-right">Live Tuples</TableHead>
                      <TableHead className="text-right">Dead Tuples</TableHead>
                      <TableHead className="text-right">Bloat %</TableHead>
                      <TableHead className="text-right">Seq Scan</TableHead>
                      <TableHead className="text-right">Idx Scan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8">로딩 중...</TableCell></TableRow>
                    ) : rows.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8">데이터 없음</TableCell></TableRow>
                    ) : (
                      rows.map((r: any) => (
                        <TableRow key={`${r.schema_name}.${r.table_name}`}>
                          <TableCell className="text-xs">{r.schema_name}</TableCell>
                          <TableCell className="font-mono text-xs">{r.table_name}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatBytes(r.table_size)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{r.live_tuples?.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{r.dead_tuples?.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={r.bloat_ratio > 20 ? 'destructive' : r.bloat_ratio > 10 ? 'secondary' : 'outline'} className="text-xs">
                              {r.bloat_ratio}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{r.seq_scan?.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{r.idx_scan?.toLocaleString()}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="indexes">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Schema</TableHead>
                      <TableHead>Table</TableHead>
                      <TableHead>Index</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead className="text-right">Idx Scan</TableHead>
                      <TableHead className="text-right">Idx Tup Read</TableHead>
                      <TableHead>Usage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8">로딩 중...</TableCell></TableRow>
                    ) : rows.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8">데이터 없음</TableCell></TableRow>
                    ) : (
                      rows.map((r: any) => (
                        <TableRow key={`${r.schema_name}.${r.index_name}`}>
                          <TableCell className="text-xs">{r.schema_name}</TableCell>
                          <TableCell className="font-mono text-xs">{r.table_name}</TableCell>
                          <TableCell className="font-mono text-xs">{r.index_name}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatBytes(r.index_size)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{r.idx_scan?.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{r.idx_tup_read?.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={r.idx_scan === 0 ? 'destructive' : 'outline'} className="text-xs">
                              {r.idx_scan === 0 ? 'Unused' : 'Active'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
