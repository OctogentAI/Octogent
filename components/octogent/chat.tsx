'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, StopCircle, User, Bot, Wrench } from 'lucide-react';
import type { AgentMessage, Task } from '@/lib/types';

interface ChatProps {
  messages: AgentMessage[];
  tasks: Task[];
  onSubmit: (message: string) => void;
  onCancel: (taskId: string) => void;
}

export function Chat({ messages, tasks, onSubmit, onCancel }: ChatProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSubmit(input.trim());
    setInput('');
  };

  const runningTasks = tasks.filter(t => t.status === 'running' || t.status === 'pending');

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Welcome to Octogent</h3>
              <p className="text-muted-foreground max-w-md">
                Send a message to start a task. I can write code, search the web, manage files, and spawn sub-agents for parallel work.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Running Tasks Indicator */}
      {runningTasks.length > 0 && (
        <div className="border-t border-border px-4 py-2 bg-muted/30">
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-info animate-pulse-dot" />
              <span className="text-sm text-muted-foreground">
                {runningTasks.length} task{runningTasks.length > 1 ? 's' : ''} running
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => runningTasks.forEach(t => onCancel(t.id))}
              className="text-destructive hover:text-destructive"
            >
              <StopCircle className="w-4 h-4 mr-1" />
              Stop All
            </Button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border p-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Send a message to Octogent..."
              className="flex-1 bg-input"
            />
            <Button type="submit" disabled={!input.trim()}>
              <Send className="w-4 h-4" />
              <span className="sr-only">Send</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: AgentMessage }) {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';

  return (
    <div
      className={cn(
        'flex gap-3',
        isUser && 'flex-row-reverse'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-full shrink-0',
          isUser ? 'bg-primary text-primary-foreground' : isTool ? 'bg-warning/20 text-warning' : 'bg-muted text-muted-foreground'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4" />
        ) : isTool ? (
          <Wrench className="w-4 h-4" />
        ) : (
          <Bot className="w-4 h-4" />
        )}
      </div>

      {/* Content */}
      <div
        className={cn(
          'flex-1 max-w-[80%] rounded-lg p-3',
          isUser ? 'bg-primary text-primary-foreground' : isTool ? 'bg-warning/10 border border-warning/20' : 'bg-card border border-border'
        )}
      >
        {isTool && message.tool_name && (
          <div className="text-xs font-medium text-warning mb-1">
            Tool: {message.tool_name}
          </div>
        )}
        <div className="text-sm whitespace-pre-wrap break-words">
          <MessageContent content={message.content} />
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  // Parse tool calls in the content
  const parts = content.split(/(<tool[^>]*>[\s\S]*?<\/tool>)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('<tool')) {
          // Extract tool info
          const nameMatch = part.match(/name="([^"]+)"/);
          const toolName = nameMatch ? nameMatch[1] : 'unknown';
          const innerContent = part.replace(/<tool[^>]*>/, '').replace(/<\/tool>/, '');

          return (
            <div key={i} className="my-2 p-2 rounded bg-muted/50 border border-border font-mono text-xs">
              <div className="flex items-center gap-1 text-warning mb-1">
                <Wrench className="w-3 h-3" />
                <span>{toolName}</span>
              </div>
              <pre className="whitespace-pre-wrap text-muted-foreground">{innerContent.trim()}</pre>
            </div>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
