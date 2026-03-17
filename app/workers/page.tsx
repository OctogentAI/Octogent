'use client';

import { Sidebar } from '@/components/octogent/sidebar';
import { WorkersGrid } from '@/components/octogent/workers-grid';
import { useOctogentDemo } from '@/hooks/use-octogent';

export default function WorkersPage() {
  const {
    connected,
    workers,
    tasks
  } = useOctogentDemo();

  const workerStats = {
    total: workers.length,
    busy: workers.filter(w => w.status === 'busy').length,
    idle: workers.filter(w => w.status === 'idle').length,
    error: workers.filter(w => w.status === 'error').length
  };

  return (
    <div className="flex h-screen">
      <Sidebar connected={connected} workerStats={workerStats} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h1 className="text-xl font-semibold">Workers</h1>
            <p className="text-sm text-muted-foreground">Monitor parallel worker pool status</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-success">{workerStats.idle} idle</span>
            <span className="text-info">{workerStats.busy} busy</span>
            <span className="text-destructive">{workerStats.error} error</span>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6">
          <WorkersGrid workers={workers} tasks={tasks} />
        </div>
      </main>
    </div>
  );
}
