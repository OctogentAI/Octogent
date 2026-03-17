'use client';

import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/octogent/sidebar';
import { SessionsList } from '@/components/octogent/sessions-list';
import { useOctogentDemo } from '@/hooks/use-octogent';

export default function SessionsPage() {
  const router = useRouter();
  const {
    connected,
    workers,
    sessions,
    currentSessionId,
    switchSession,
    createSession
  } = useOctogentDemo();

  const workerStats = {
    total: workers.length,
    busy: workers.filter(w => w.status === 'busy').length,
    idle: workers.filter(w => w.status === 'idle').length,
    error: workers.filter(w => w.status === 'error').length
  };

  const handleSelect = (sessionId: string) => {
    switchSession(sessionId);
    router.push('/');
  };

  const handleCreate = () => {
    createSession();
    router.push('/');
  };

  return (
    <div className="flex h-screen">
      <Sidebar connected={connected} workerStats={workerStats} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <SessionsList
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelect={handleSelect}
          onCreate={handleCreate}
        />
      </main>
    </div>
  );
}
