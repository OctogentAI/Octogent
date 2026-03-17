'use client';

import { Sidebar } from '@/components/octogent/sidebar';
import { Chat } from '@/components/octogent/chat';
import { useOctogentDemo } from '@/hooks/use-octogent';

export default function Home() {
  const {
    connected,
    workers,
    currentMessages,
    currentTasks,
    submitTask,
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
            <h1 className="text-xl font-semibold">Chat</h1>
            <p className="text-sm text-muted-foreground">Send tasks to Octogent agents</p>
          </div>
        </header>
        <div className="flex-1 overflow-hidden">
          <Chat
            messages={currentMessages}
            tasks={currentTasks}
            onSubmit={submitTask}
            onCancel={cancelTask}
          />
        </div>
      </main>
    </div>
  );
}
