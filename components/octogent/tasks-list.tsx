'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  PlayCircle,
  StopCircle,
  RotateCcw
} from 'lucide-react';
import type { Task } from '@/lib/types';

interface TasksListProps {
  tasks: Task[];
  onCancel: (taskId: string) => void;
  onRetry?: (taskId: string) => void;
}

export function TasksList({ tasks, onCancel, onRetry }: TasksListProps) {
  const sortedTasks = [...tasks].sort((a, b) => b.created_at - a.created_at);

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-muted-foreground" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-info animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'cancelled':
        return <StopCircle className="w-4 h-4 text-muted-foreground" />;
      default:
        return <PlayCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: Task['status']) => {
    const variants: Record<Task['status'], string> = {
      pending: 'bg-muted text-muted-foreground',
      running: 'bg-info/10 text-info',
      completed: 'bg-success/10 text-success',
      failed: 'bg-destructive/10 text-destructive',
      cancelled: 'bg-muted text-muted-foreground'
    };

    return (
      <Badge variant="secondary" className={cn('capitalize', variants[status])}>
        {status}
      </Badge>
    );
  };

  const formatDuration = (task: Task) => {
    if (!task.started_at) return '-';
    const end = task.completed_at || Date.now();
    const duration = Math.floor((end - task.started_at) / 1000);
    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  };

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <PlayCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">No tasks yet</h3>
        <p className="text-muted-foreground max-w-md">
          Submit a task from the chat to get started.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-4">
        {sortedTasks.map((task) => (
          <Card key={task.id} className="overflow-hidden">
            <CardHeader className="py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  {getStatusIcon(task.status)}
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-medium line-clamp-2">
                      {task.input}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{new Date(task.created_at).toLocaleString()}</span>
                      <span>-</span>
                      <span>{formatDuration(task)}</span>
                      {task.iterations !== undefined && (
                        <>
                          <span>-</span>
                          <span>{task.iterations} iterations</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {getStatusBadge(task.status)}
                  {(task.status === 'pending' || task.status === 'running') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onCancel(task.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <StopCircle className="w-4 h-4" />
                    </Button>
                  )}
                  {task.status === 'failed' && onRetry && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRetry(task.id)}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            {(task.output || task.error) && (
              <CardContent className="pt-0 pb-3">
                {task.output && (
                  <div className="text-sm text-muted-foreground bg-muted/50 rounded p-2 font-mono text-xs">
                    {task.output}
                  </div>
                )}
                {task.error && (
                  <div className="text-sm text-destructive bg-destructive/10 rounded p-2 font-mono text-xs">
                    {task.error}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}
