'use client';

import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CsvExportButtonProps {
  data: Record<string, unknown>[];
  filename?: string;
  columns?: { key: string; label: string }[];
  className?: string;
}

export function CsvExportButton({
  data,
  filename = 'export',
  columns,
  className,
}: CsvExportButtonProps) {
  const handleExport = () => {
    if (data.length === 0) return;

    const cols = columns ?? Object.keys(data[0]).map((key) => ({ key, label: key }));

    const header = cols.map((c) => c.label).join(',');
    const rows = data.map((row) =>
      cols
        .map((c) => {
          const val = row[c.key];
          const str = val === null || val === undefined ? '' : String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(',')
    );

    const bom = '\uFEFF';
    const csv = bom + [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={data.length === 0}
      className={cn('gap-1.5', className)}
    >
      <Download className="h-3.5 w-3.5" />
      CSV
    </Button>
  );
}
