'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Database, ChevronDown } from 'lucide-react';
import { useState } from 'react';

export interface InstanceOption {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  status?: 'normal' | 'warning' | 'critical' | 'inactive';
}

interface InstanceSelectorProps {
  instances: InstanceOption[];
  selected: string[];
  onSelectionChange: (ids: string[]) => void;
  multiple?: boolean;
  className?: string;
}

const statusDot: Record<string, string> = {
  normal: 'bg-blue-500',
  warning: 'bg-orange-500',
  critical: 'bg-red-500',
  inactive: 'bg-slate-500',
};

export function InstanceSelector({
  instances,
  selected,
  onSelectionChange,
  multiple = false,
  className,
}: InstanceSelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedNames = instances
    .filter((i) => selected.includes(i.id))
    .map((i) => i.name);

  const displayText =
    selectedNames.length === 0
      ? '인스턴스 선택'
      : selectedNames.length === 1
        ? selectedNames[0]
        : `${selectedNames[0]} 외 ${selectedNames.length - 1}개`;

  const handleSelect = (id: string) => {
    if (multiple) {
      const next = selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id];
      onSelectionChange(next);
    } else {
      onSelectionChange([id]);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1.5 min-w-[160px] justify-between', className)}
        >
          <span className="flex items-center gap-1.5 truncate">
            <Database className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{displayText}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-1" align="start">
        {multiple && (
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/50 mb-1">
            <span className="text-xs text-muted-foreground">
              {selected.length}개 선택됨
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => onSelectionChange(instances.map((i) => i.id))}
            >
              전체 선택
            </Button>
          </div>
        )}
        <div className="max-h-[240px] overflow-y-auto">
          {instances.map((inst) => (
            <div
              key={inst.id}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-muted/50',
                selected.includes(inst.id) && 'bg-muted/70'
              )}
              onClick={() => handleSelect(inst.id)}
            >
              {multiple && (
                <Checkbox
                  checked={selected.includes(inst.id)}
                  className="pointer-events-none"
                />
              )}
              <span
                className={cn(
                  'h-2 w-2 rounded-full shrink-0',
                  statusDot[inst.status ?? 'inactive']
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{inst.name}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">
                  {inst.host}:{inst.port}/{inst.database}
                </div>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
