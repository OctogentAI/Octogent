'use client';

import { Sidebar } from '@/components/octogent/sidebar';
import { SkillsManager } from '@/components/octogent/skills-manager';
import { useOctogentDemo } from '@/hooks/use-octogent';

export default function SkillsPage() {
  const {
    connected,
    workers,
    skills,
    saveSkill,
    deleteSkill
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
        <SkillsManager
          skills={skills}
          onSave={saveSkill}
          onDelete={deleteSkill}
        />
      </main>
    </div>
  );
}
