'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Maximize2,
  Minimize2,
  MoreVertical,
  Download,
  Settings2,
  X,
} from 'lucide-react';

interface WidgetCardProps {
  title: string;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  onCsvExport?: () => void;
  onSettingsClick?: () => void;
  onRemove?: () => void;
  /** Extra element shown right of title (e.g. metric badge) */
  titleExtra?: ReactNode;
  /** Whether the card supports fullscreen toggle */
  fullscreenable?: boolean;
  /** Drag handle class for react-grid-layout */
  dragHandleClass?: string;
  noPadding?: boolean;
}

export function WidgetCard({
  title,
  children,
  className,
  headerClassName,
  contentClassName,
  onCsvExport,
  onSettingsClick,
  onRemove,
  titleExtra,
  fullscreenable = true,
  dragHandleClass = 'widget-drag-handle',
  noPadding = false,
}: WidgetCardProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <Card
      className={cn(
        'border-border/50 bg-card overflow-hidden flex flex-col',
        isFullscreen && 'fixed inset-4 z-50 rounded-lg shadow-2xl',
        className
      )}
    >
      <CardHeader
        className={cn(
          'flex flex-row items-center justify-between gap-2 py-2 px-3 border-b border-border/50',
          dragHandleClass,
          'cursor-grab active:cursor-grabbing',
          headerClassName
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-medium text-foreground truncate">
            {title}
          </h3>
          {titleExtra}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {fullscreenable && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </Button>
          )}

          {(onCsvExport || onSettingsClick || onRemove) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onCsvExport && (
                  <DropdownMenuItem onClick={onCsvExport}>
                    <Download className="h-4 w-4 mr-2" />
                    CSV 내보내기
                  </DropdownMenuItem>
                )}
                {onSettingsClick && (
                  <DropdownMenuItem onClick={onSettingsClick}>
                    <Settings2 className="h-4 w-4 mr-2" />
                    메트릭 변경
                  </DropdownMenuItem>
                )}
                {onRemove && (
                  <DropdownMenuItem
                    onClick={onRemove}
                    className="text-destructive"
                  >
                    <X className="h-4 w-4 mr-2" />
                    위젯 삭제
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>

      <CardContent
        className={cn(
          'flex-1 min-h-0',
          noPadding ? 'p-0' : 'p-3',
          contentClassName
        )}
      >
        {children}
      </CardContent>

      {/* Fullscreen backdrop */}
      {isFullscreen && (
        <div
          className="fixed inset-0 bg-black/60 z-40"
          onClick={() => setIsFullscreen(false)}
        />
      )}
    </Card>
  );
}
