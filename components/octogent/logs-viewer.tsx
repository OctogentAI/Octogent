'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Search, Filter, ArrowDown } from 'lucide-react';
import type { LogEntry } from '@/lib/types';

interface LogsViewerProps {
  logs: LogEntry[];
  onClear: () => void;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function LogsViewer({ logs, onClear }: LogsViewerProps) {
  const [filter, setFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(log => {
    if (levelFilter !== 'all' && log.level !== levelFilter) return false;
    if (filter && !log.message.toLowerCase().includes(filter.toLowerCase()) && 
        !log.source.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case 'debug': return 'text-muted-foreground';
      case 'info': return 'text-info';
      case 'warn': return 'text-warning';
      case 'error': return 'text-destructive';
      default: return 'text-foreground';
    }
  };

  const getLevelBadge = (level: LogLevel) => {
    const colors: Record<LogLevel, string> = {
      debug: 'bg-muted text-muted-foreground',
      info: 'bg-info/10 text-info',
      warn: 'bg-warning/10 text-warning',
      error: 'bg-destructive/10 text-destructive'
    };

    return (
      <Badge variant="secondary" className={cn('text-xs uppercase w-14 justify-center', colors[level])}>
        {level}
      </Badge>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter logs..."
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-1 border rounded-md p-1">
          {(['all', 'debug', 'info', 'warn', 'error'] as const).map((level) => (
            <Button
              key={level}
              variant={levelFilter === level ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setLevelFilter(level)}
              className="text-xs h-7"
            >
              {level === 'all' ? 'All' : level.toUpperCase()}
            </Button>
          ))}
        </div>

        <Button
          variant={autoScroll ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setAutoScroll(!autoScroll)}
        >
          <ArrowDown className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Logs */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 font-mono text-xs space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {logs.length === 0 ? 'No logs yet' : 'No matching logs'}
            </div>
          ) : (
            filteredLogs.map((log, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-3 py-1 hover:bg-muted/50 rounded px-2 -mx-2',
                  getLevelColor(log.level as LogLevel)
                )}
              >
                <span className="text-muted-foreground shrink-0 w-20">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                {getLevelBadge(log.level as LogLevel)}
                <span className="text-primary shrink-0 w-20 truncate">[{log.source}]</span>
                <span className="flex-1 break-all">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs text-muted-foreground">
        <span>{filteredLogs.length} of {logs.length} entries</span>
        <span>{autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}</span>
      </div>
    </div>
  );
}
