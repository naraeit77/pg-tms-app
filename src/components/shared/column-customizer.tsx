'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Columns3, GripVertical, RotateCcw, Search } from 'lucide-react';

export interface ColumnDef {
  key: string;
  label: string;
  visible: boolean;
  width?: number;
}

interface ColumnCustomizerProps {
  columns: ColumnDef[];
  onColumnsChange: (columns: ColumnDef[]) => void;
  className?: string;
}

export function ColumnCustomizer({
  columns,
  onColumnsChange,
  className,
}: ColumnCustomizerProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [localColumns, setLocalColumns] = useState<ColumnDef[]>(columns);

  const filtered = localColumns.filter((col) =>
    col.label.toLowerCase().includes(search.toLowerCase()) ||
    col.key.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggle = (key: string) => {
    setLocalColumns((prev) =>
      prev.map((col) =>
        col.key === key ? { ...col, visible: !col.visible } : col
      )
    );
  };

  const handleReset = () => {
    setLocalColumns(columns.map((col) => ({ ...col, visible: true })));
  };

  const handleApply = () => {
    onColumnsChange(localColumns);
    setOpen(false);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (sourceIndex === targetIndex) return;

    const newColumns = [...localColumns];
    const [removed] = newColumns.splice(sourceIndex, 1);
    newColumns.splice(targetIndex, 0, removed);
    setLocalColumns(newColumns);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setLocalColumns(columns); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={cn('gap-1.5', className)}>
          <Columns3 className="h-3.5 w-3.5" />
          컬럼
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>컬럼 설정</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="컬럼 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto space-y-0.5">
          {filtered.map((col, index) => (
            <div
              key={col.key}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, index)}
            >
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0 cursor-grab" />
              <Checkbox
                checked={col.visible}
                onCheckedChange={() => handleToggle(col.key)}
              />
              <span className="text-sm truncate">{col.label}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            초기화
          </Button>
          <Button size="sm" onClick={handleApply}>
            적용
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
