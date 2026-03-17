'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  ListTodo,
  Grid3X3,
  History,
  Settings,
  Zap,
  ScrollText,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const navigation = [
  { name: 'Chat', href: '/', icon: MessageSquare },
  { name: 'Tasks', href: '/tasks', icon: ListTodo },
  { name: 'Workers', href: '/workers', icon: Grid3X3 },
  { name: 'Sessions', href: '/sessions', icon: History },
  { name: 'Skills', href: '/skills', icon: Zap },
  { name: 'Logs', href: '/logs', icon: ScrollText },
  { name: 'Config', href: '/config', icon: Settings }
];

interface SidebarProps {
  connected: boolean;
  workerStats: {
    total: number;
    busy: number;
    idle: number;
    error: number;
  };
}

export function Sidebar({ connected, workerStats }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 p-4 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          O
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="font-semibold text-sidebar-foreground">Octogent</span>
            <span className="text-xs text-muted-foreground">AI Agent System</span>
          </div>
        )}
      </div>

      {/* Connection Status */}
      <div className={cn('flex items-center gap-2 px-4 py-2 border-b border-sidebar-border', collapsed && 'justify-center')}>
        <div
          className={cn(
            'w-2 h-2 rounded-full',
            connected ? 'bg-success animate-pulse-dot' : 'bg-destructive'
          )}
        />
        {!collapsed && (
          <span className="text-xs text-muted-foreground">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                collapsed && 'justify-center'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Worker Stats */}
      {!collapsed && (
        <div className="p-4 border-t border-sidebar-border">
          <div className="text-xs font-medium text-muted-foreground mb-2">Workers</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded bg-sidebar-accent">
              <div className="text-lg font-semibold text-success">{workerStats.idle}</div>
              <div className="text-xs text-muted-foreground">Idle</div>
            </div>
            <div className="p-2 rounded bg-sidebar-accent">
              <div className="text-lg font-semibold text-info">{workerStats.busy}</div>
              <div className="text-xs text-muted-foreground">Busy</div>
            </div>
            <div className="p-2 rounded bg-sidebar-accent">
              <div className="text-lg font-semibold text-destructive">{workerStats.error}</div>
              <div className="text-xs text-muted-foreground">Error</div>
            </div>
          </div>
        </div>
      )}

      {/* Collapse Button */}
      <div className="p-2 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>
    </aside>
  );
}
