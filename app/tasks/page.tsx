'use client';

import { Sidebar } from '@/components/octogent/sidebar';
import { TasksList } from '@/components/octogent/tasks-list';
import { useOctogentDemo } from '@/hooks/use-octogent';

export default function TasksPage() {
  const {
    connected,
    workers,
    tasks,
    cancelTask
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
            <h1 className="text-xl font-semibold">Tasks</h1>
            <p className="text-sm text-muted-foreground">View and manage task execution</p>
          </div>
        </header>
        <div className="flex-1 overflow-hidden">
          <TasksList tasks={tasks} onCancel={cancelTask} />
        </div>
      </main>
    </div>
  );
}
