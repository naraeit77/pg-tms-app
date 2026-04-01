'use client';

/**
 * Top SQL Summary Table
 * Dashboard용 Top SQL 요약 테이블
 */

interface SqlStatRow {
  queryid: number;
  query: string;
  calls: number;
  total_exec_time: number;
  mean_exec_time: number;
  shared_blks_hit: number;
  shared_blks_read: number;
  rows: number;
}

interface TopSqlTableProps {
  data: SqlStatRow[];
  className?: string;
}

function formatTime(ms: number): string {
  if (ms >= 1000 * 60) return `${(ms / 1000 / 60).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms >= 1) return `${ms.toFixed(1)}ms`;
  return `${(ms * 1000).toFixed(0)}µs`;
}

function truncateQuery(query: string, maxLen: number = 80): string {
  const cleaned = query.replace(/\s+/g, ' ').trim();
  return cleaned.length > maxLen ? cleaned.substring(0, maxLen) + '…' : cleaned;
}

export function TopSqlTable({ data, className }: TopSqlTableProps) {
  if (data.length === 0) {
    return (
      <div className={className}>
        <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
          pg_stat_statements 데이터 없음
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 font-medium text-slate-500 text-xs w-8">#</th>
              <th className="text-left py-2 px-3 font-medium text-slate-500 text-xs">SQL</th>
              <th className="text-right py-2 px-3 font-medium text-slate-500 text-xs whitespace-nowrap">Calls</th>
              <th className="text-right py-2 px-3 font-medium text-slate-500 text-xs whitespace-nowrap">Total Time</th>
              <th className="text-right py-2 px-3 font-medium text-slate-500 text-xs whitespace-nowrap">Avg Time</th>
              <th className="text-right py-2 px-3 font-medium text-slate-500 text-xs whitespace-nowrap">Rows</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              // 성능 등급 색상 (mean_exec_time 기준)
              const avgMs = row.mean_exec_time;
              const gradeColor =
                avgMs > 1000 ? 'text-red-600' :
                avgMs > 100 ? 'text-amber-600' :
                avgMs > 10 ? 'text-blue-600' :
                'text-emerald-600';

              return (
                <tr
                  key={row.queryid}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                >
                  <td className="py-2 px-3 text-xs text-slate-400">{i + 1}</td>
                  <td className="py-2 px-3 max-w-[400px]">
                    <div className="font-mono text-xs text-slate-700 truncate" title={row.query}>
                      {truncateQuery(row.query)}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right text-xs font-medium text-slate-700">
                    {row.calls.toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-right text-xs font-medium text-slate-700">
                    {formatTime(row.total_exec_time)}
                  </td>
                  <td className={`py-2 px-3 text-right text-xs font-semibold ${gradeColor}`}>
                    {formatTime(avgMs)}
                  </td>
                  <td className="py-2 px-3 text-right text-xs text-slate-600">
                    {row.rows.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
