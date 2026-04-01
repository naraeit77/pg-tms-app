'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export interface TimeRange {
  start: Date;
  end: Date;
}

interface TimeRangeSelectorProps {
  isLive: boolean;
  onLiveToggle: (live: boolean) => void;
  timeRange?: TimeRange;
  onTimeRangeChange?: (range: TimeRange) => void;
  refreshInterval?: number;
  className?: string;
}

export function TimeRangeSelector({
  isLive,
  onLiveToggle,
  timeRange,
  onTimeRangeChange,
  className,
}: TimeRangeSelectorProps) {
  const handlePrev = useCallback(() => {
    if (!timeRange || !onTimeRangeChange) return;
    const duration = timeRange.end.getTime() - timeRange.start.getTime();
    onTimeRangeChange({
      start: new Date(timeRange.start.getTime() - duration),
      end: new Date(timeRange.end.getTime() - duration),
    });
  }, [timeRange, onTimeRangeChange]);

  const handleNext = useCallback(() => {
    if (!timeRange || !onTimeRangeChange) return;
    const duration = timeRange.end.getTime() - timeRange.start.getTime();
    const newEnd = new Date(timeRange.end.getTime() + duration);
    if (newEnd > new Date()) return;
    onTimeRangeChange({
      start: new Date(timeRange.start.getTime() + duration),
      end: newEnd,
    });
  }, [timeRange, onTimeRangeChange]);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Live/Pause Toggle */}
      <Button
        variant={isLive ? 'default' : 'outline'}
        size="sm"
        onClick={() => onLiveToggle(!isLive)}
        className={cn(
          'gap-1.5 font-medium min-w-[80px]',
          isLive && 'bg-emerald-600 hover:bg-emerald-700 text-white'
        )}
      >
        {isLive ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            Live
          </>
        ) : (
          <>
            <Pause className="h-3.5 w-3.5" />
            정지
          </>
        )}
      </Button>

      {/* Time Navigation */}
      {!isLive && timeRange && (
        <>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 font-mono text-xs min-w-[260px] justify-center"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(timeRange.start, 'yyyy-MM-dd HH:mm', { locale: ko })}
                {' ~ '}
                {format(timeRange.end, 'HH:mm', { locale: ko })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="center">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-12">시작</span>
                  <Input
                    type="datetime-local"
                    className="h-8 text-xs font-mono"
                    value={format(timeRange.start, "yyyy-MM-dd'T'HH:mm")}
                    onChange={(e) => {
                      if (e.target.value && onTimeRangeChange) {
                        const newStart = new Date(e.target.value);
                        const duration = timeRange.end.getTime() - timeRange.start.getTime();
                        onTimeRangeChange({
                          start: newStart,
                          end: new Date(newStart.getTime() + duration),
                        });
                      }
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-12">종료</span>
                  <Input
                    type="datetime-local"
                    className="h-8 text-xs font-mono"
                    value={format(timeRange.end, "yyyy-MM-dd'T'HH:mm")}
                    onChange={(e) => {
                      if (e.target.value && onTimeRangeChange) {
                        onTimeRangeChange({
                          start: timeRange.start,
                          end: new Date(e.target.value),
                        });
                      }
                    }}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}
