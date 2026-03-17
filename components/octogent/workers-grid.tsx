'use client';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Cpu, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { WorkerStatus, Task } from '@/lib/types';

interface WorkersGridProps {
  workers: WorkerStatus[];
  tasks: Task[];
}

export function WorkersGrid({ workers, tasks }: WorkersGridProps) {
  const getTaskForWorker = (worker: WorkerStatus) => {
    if (!worker.task_id) return null;
    return tasks.find(t => t.id === worker.task_id);
  };

  const getElapsedTime = (startedAt?: number) => {
    if (!startedAt) return '0s';
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    if (elapsed < 60) return `${elapsed}s`;
    if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
    return `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {workers.map((worker) => {
        const task = getTaskForWorker(worker);
        const elapsed = worker.started_at ? getElapsedTime(worker.started_at) : null;
        const progress = task?.iterations ? Math.min((task.iterations / 50) * 100, 100) : 0;

        return (
          <Card
            key={worker.id}
            className={cn(
              'relative overflow-hidden transition-all',
              worker.status === 'busy' && 'ring-1 ring-info/50',
              worker.status === 'error' && 'ring-1 ring-destructive/50'
            )}
          >
            {/* Status indicator bar */}
            <div
              className={cn(
                'absolute top-0 left-0 right-0 h-1',
                worker.status === 'idle' && 'bg-success',
                worker.status === 'busy' && 'bg-info',
                worker.status === 'error' && 'bg-destructive'
              )}
            />

            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-muted-foreground" />
                  <span>Worker {worker.id}</span>
                </div>
                <StatusBadge status={worker.status} />
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {worker.status === 'busy' && task && (
                <>
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {task.input}
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="text-foreground">{task.iterations || 0} iterations</span>
                    </div>
                    <Progress value={progress} className="h-1" />
                  </div>
                  {elapsed && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{elapsed}</span>
                    </div>
                  )}
                </>
              )}

              {worker.status === 'idle' && (
                <div className="text-xs text-muted-foreground text-center py-4">
                  Ready for tasks
                </div>
              )}

              {worker.status === 'error' && (
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{worker.error || 'Unknown error'}</span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: WorkerStatus['status'] }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        status === 'idle' && 'bg-success/10 text-success',
        status === 'busy' && 'bg-info/10 text-info',
        status === 'error' && 'bg-destructive/10 text-destructive'
      )}
    >
      {status === 'idle' && <CheckCircle2 className="w-3 h-3" />}
      {status === 'busy' && <div className="w-2 h-2 rounded-full bg-info animate-pulse-dot" />}
      {status === 'error' && <AlertCircle className="w-3 h-3" />}
      <span className="capitalize">{status}</span>
    </div>
  );
}
