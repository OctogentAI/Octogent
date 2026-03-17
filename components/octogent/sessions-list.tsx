'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, MessageSquare, Clock, FolderOpen } from 'lucide-react';
import type { Session } from '@/lib/types';

interface SessionsListProps {
  sessions: Session[];
  currentSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onCreate: () => void;
}

export function SessionsList({ sessions, currentSessionId, onSelect, onCreate }: SessionsListProps) {
  const sortedSessions = [...sessions].sort((a, b) => b.updated_at - a.updated_at);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Sessions</h2>
          <p className="text-muted-foreground">View and manage your chat sessions</p>
        </div>
        <Button onClick={onCreate}>
          <Plus className="w-4 h-4 mr-2" />
          New Session
        </Button>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <FolderOpen className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">No sessions yet</h3>
          <p className="text-muted-foreground max-w-md mb-4">
            Create a new session to start chatting with Octogent.
          </p>
          <Button onClick={onCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Create Session
          </Button>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sortedSessions.map((session) => (
              <Card
                key={session.id}
                className={cn(
                  'cursor-pointer transition-all hover:border-primary/50',
                  currentSessionId === session.id && 'border-primary ring-1 ring-primary/20'
                )}
                onClick={() => onSelect(session.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base line-clamp-1">
                      {session.name || `Session ${session.id.slice(-6)}`}
                    </CardTitle>
                    {currentSessionId === session.id && (
                      <span className="text-xs text-primary font-medium">Active</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <MessageSquare className="w-4 h-4" />
                      <span>{session.task_count || 0} tasks</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{formatDate(session.updated_at)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
