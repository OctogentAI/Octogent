'use client';

import { Sidebar } from '@/components/octogent/sidebar';
import { ConfigEditor } from '@/components/octogent/config-editor';
import { useOctogentDemo } from '@/hooks/use-octogent';

export default function ConfigPage() {
  const {
    connected,
    workers,
    config,
    updateConfig
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
        <div className="flex-1 overflow-auto">
          <ConfigEditor config={config} onSave={updateConfig} />
        </div>
      </main>
    </div>
  );
}
