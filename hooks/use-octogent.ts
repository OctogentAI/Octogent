'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  Task,
  Session,
  WorkerStatus,
  AgentMessage,
  SystemConfig,
  Skill,
  LogEntry
} from '@/lib/types';

// WebSocket message types
type WSMessage =
  | { type: 'workers'; data: WorkerStatus[] }
  | { type: 'task_update'; data: Task }
  | { type: 'session_update'; data: Session }
  | { type: 'message'; data: AgentMessage }
  | { type: 'log'; data: LogEntry }
  | { type: 'config'; data: SystemConfig }
  | { type: 'skills'; data: Skill[] }
  | { type: 'error'; error: string };

interface OctogentState {
  connected: boolean;
  workers: WorkerStatus[];
  tasks: Task[];
  sessions: Session[];
  messages: AgentMessage[];
  logs: LogEntry[];
  config: SystemConfig | null;
  skills: Skill[];
  currentSessionId: string | null;
}

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'ws://localhost:18789';

export function useOctogent() {
  const [state, setState] = useState<OctogentState>({
    connected: false,
    workers: [],
    tasks: [],
    sessions: [],
    messages: [],
    logs: [],
    config: null,
    skills: [],
    currentSessionId: null
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttempts = useRef(0);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(GATEWAY_URL);

      ws.onopen = () => {
        console.log('[Octogent] Connected to gateway');
        setState(s => ({ ...s, connected: true }));
        reconnectAttempts.current = 0;

        // Request initial state
        ws.send(JSON.stringify({ type: 'get_state' }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WSMessage;
          handleMessage(msg);
        } catch (e) {
          console.error('[Octogent] Failed to parse message:', e);
        }
      };

      ws.onclose = () => {
        console.log('[Octogent] Disconnected from gateway');
        setState(s => ({ ...s, connected: false }));
        wsRef.current = null;

        // Reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = (error) => {
        console.error('[Octogent] WebSocket error:', error);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[Octogent] Failed to connect:', error);
    }
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback((msg: WSMessage) => {
    switch (msg.type) {
      case 'workers':
        setState(s => ({ ...s, workers: msg.data }));
        break;
      case 'task_update':
        setState(s => ({
          ...s,
          tasks: s.tasks.some(t => t.id === msg.data.id)
            ? s.tasks.map(t => t.id === msg.data.id ? msg.data : t)
            : [...s.tasks, msg.data]
        }));
        break;
      case 'session_update':
        setState(s => ({
          ...s,
          sessions: s.sessions.some(ss => ss.id === msg.data.id)
            ? s.sessions.map(ss => ss.id === msg.data.id ? msg.data : ss)
            : [...s.sessions, msg.data]
        }));
        break;
      case 'message':
        setState(s => ({
          ...s,
          messages: [...s.messages, msg.data].slice(-500) // Keep last 500 messages
        }));
        break;
      case 'log':
        setState(s => ({
          ...s,
          logs: [...s.logs, msg.data].slice(-1000) // Keep last 1000 logs
        }));
        break;
      case 'config':
        setState(s => ({ ...s, config: msg.data }));
        break;
      case 'skills':
        setState(s => ({ ...s, skills: msg.data }));
        break;
      case 'error':
        console.error('[Octogent] Server error:', msg.error);
        break;
    }
  }, []);

  // Send message to server
  const send = useCallback((type: string, data?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...data }));
    }
  }, []);

  // Submit a new task
  const submitTask = useCallback((task: string, sessionId?: string) => {
    const sid = sessionId || state.currentSessionId || `session-${Date.now()}`;
    send('submit_task', { task, sessionId: sid });
    if (!state.currentSessionId) {
      setState(s => ({ ...s, currentSessionId: sid }));
    }
    return sid;
  }, [send, state.currentSessionId]);

  // Cancel a task
  const cancelTask = useCallback((taskId: string) => {
    send('cancel_task', { taskId });
  }, [send]);

  // Create a new session
  const createSession = useCallback((name?: string) => {
    const sessionId = `session-${Date.now()}`;
    send('create_session', { sessionId, name });
    setState(s => ({ ...s, currentSessionId: sessionId }));
    return sessionId;
  }, [send]);

  // Switch to a session
  const switchSession = useCallback((sessionId: string) => {
    setState(s => ({ ...s, currentSessionId: sessionId }));
    send('get_session', { sessionId });
  }, [send]);

  // Update config
  const updateConfig = useCallback((config: Partial<SystemConfig>) => {
    send('update_config', { config });
  }, [send]);

  // Save a skill
  const saveSkill = useCallback((skill: Skill) => {
    send('save_skill', { skill });
  }, [send]);

  // Delete a skill
  const deleteSkill = useCallback((name: string) => {
    send('delete_skill', { name });
  }, [send]);

  // Clear logs
  const clearLogs = useCallback(() => {
    setState(s => ({ ...s, logs: [] }));
  }, []);

  // Clear messages
  const clearMessages = useCallback(() => {
    setState(s => ({ ...s, messages: [] }));
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  // Get messages for current session
  const currentMessages = state.messages.filter(
    m => !state.currentSessionId || m.session_id === state.currentSessionId
  );

  // Get tasks for current session
  const currentTasks = state.tasks.filter(
    t => !state.currentSessionId || t.session_id === state.currentSessionId
  );

  return {
    ...state,
    currentMessages,
    currentTasks,
    submitTask,
    cancelTask,
    createSession,
    switchSession,
    updateConfig,
    saveSkill,
    deleteSkill,
    clearLogs,
    clearMessages
  };
}

// Demo mode hook for when server is not available
export function useOctogentDemo() {
  const [state, setState] = useState<OctogentState>({
    connected: true,
    workers: [
      { id: 0, status: 'idle' },
      { id: 1, status: 'busy', task_id: 'task-1', started_at: Date.now() - 5000 },
      { id: 2, status: 'idle' },
      { id: 3, status: 'busy', task_id: 'task-2', started_at: Date.now() - 12000 },
      { id: 4, status: 'idle' },
      { id: 5, status: 'error', error: 'Connection timeout' },
      { id: 6, status: 'idle' },
      { id: 7, status: 'idle' }
    ],
    tasks: [
      {
        id: 'task-1',
        session_id: 'demo-session',
        input: 'Write a Python script to analyze CSV data',
        status: 'running',
        created_at: Date.now() - 5000,
        started_at: Date.now() - 5000,
        iterations: 3
      },
      {
        id: 'task-2',
        session_id: 'demo-session',
        input: 'Search for recent AI news and summarize',
        status: 'running',
        created_at: Date.now() - 12000,
        started_at: Date.now() - 12000,
        iterations: 7
      },
      {
        id: 'task-3',
        session_id: 'demo-session',
        input: 'Create a Dockerfile for Node.js app',
        status: 'completed',
        created_at: Date.now() - 60000,
        started_at: Date.now() - 60000,
        completed_at: Date.now() - 45000,
        iterations: 5,
        output: 'Created Dockerfile with multi-stage build'
      }
    ],
    sessions: [
      {
        id: 'demo-session',
        name: 'Demo Session',
        created_at: Date.now() - 120000,
        updated_at: Date.now(),
        task_count: 3
      }
    ],
    messages: [
      {
        id: 'msg-1',
        session_id: 'demo-session',
        task_id: 'task-1',
        role: 'user',
        content: 'Write a Python script to analyze CSV data',
        timestamp: Date.now() - 5000
      },
      {
        id: 'msg-2',
        session_id: 'demo-session',
        task_id: 'task-1',
        role: 'assistant',
        content: 'I\'ll create a Python script to analyze CSV data. Let me first check if pandas is available...\n\n<tool name="bash"><command>python -c "import pandas; print(pandas.__version__)"</command></tool>',
        timestamp: Date.now() - 4000
      },
      {
        id: 'msg-3',
        session_id: 'demo-session',
        task_id: 'task-1',
        role: 'tool',
        tool_name: 'bash',
        content: '2.1.0',
        timestamp: Date.now() - 3500
      }
    ],
    logs: [
      { timestamp: Date.now() - 10000, level: 'info', source: 'pool', message: 'Worker pool initialized with 8 slots' },
      { timestamp: Date.now() - 9000, level: 'info', source: 'gateway', message: 'WebSocket server listening on port 18789' },
      { timestamp: Date.now() - 5000, level: 'info', source: 'worker-1', message: 'Starting task: task-1' },
      { timestamp: Date.now() - 4500, level: 'debug', source: 'agent', message: 'Executing tool: bash' },
      { timestamp: Date.now() - 4000, level: 'info', source: 'worker-3', message: 'Starting task: task-2' },
      { timestamp: Date.now() - 2000, level: 'warn', source: 'worker-5', message: 'Connection timeout, retrying...' },
      { timestamp: Date.now() - 1000, level: 'error', source: 'worker-5', message: 'Max retries exceeded' }
    ],
    config: {
      models: {
        primary: 'ollama/llama3:8b',
        fallbacks: ['groq/llama-3.1-8b-instant'],
        ollama_host: 'http://localhost:11434',
        temperature: 0.7,
        max_tokens: 4096
      },
      workers: {
        max_slots: 8,
        max_iterations: 50,
        thinking_mode: true,
        context_limit: 8000,
        prune_threshold: 6000
      },
      gateway: {
        port: 18789,
        host: '127.0.0.1',
        cors_origins: ['http://localhost:3000']
      },
      tools: {
        enabled: ['bash', 'read_file', 'write_file', 'list_dir', 'web_search', 'web_fetch', 'memory_save', 'memory_read', 'spawn_agent', 'check_task'],
        disabled: [],
        bash_timeout: 30000,
        max_file_size: 1048576,
        searxng_url: 'http://localhost:8080'
      },
      cron: []
    },
    skills: [
      { name: 'Coder', description: 'Expert software developer', system_prompt: '', tools: ['bash', 'read_file', 'write_file'] },
      { name: 'Researcher', description: 'Expert researcher', system_prompt: '', tools: ['web_search', 'web_fetch', 'memory_save'] },
      { name: 'Writer', description: 'Expert writer', system_prompt: '', tools: ['read_file', 'write_file'] },
      { name: 'DevOps', description: 'DevOps expert', system_prompt: '', tools: ['bash', 'read_file', 'write_file'] }
    ],
    currentSessionId: 'demo-session'
  });

  const submitTask = useCallback((task: string) => {
    const taskId = `task-${Date.now()}`;
    const message: AgentMessage = {
      id: `msg-${Date.now()}`,
      session_id: state.currentSessionId || 'demo-session',
      task_id: taskId,
      role: 'user',
      content: task,
      timestamp: Date.now()
    };

    setState(s => ({
      ...s,
      messages: [...s.messages, message],
      tasks: [...s.tasks, {
        id: taskId,
        session_id: s.currentSessionId || 'demo-session',
        input: task,
        status: 'pending',
        created_at: Date.now(),
        iterations: 0
      }]
    }));

    // Simulate assistant response after a delay
    setTimeout(() => {
      setState(s => ({
        ...s,
        messages: [...s.messages, {
          id: `msg-${Date.now()}`,
          session_id: s.currentSessionId || 'demo-session',
          task_id: taskId,
          role: 'assistant',
          content: `I'll help you with: "${task}". Let me analyze the request and determine the best approach...`,
          timestamp: Date.now()
        }],
        tasks: s.tasks.map(t => t.id === taskId ? { ...t, status: 'running' as const, started_at: Date.now() } : t),
        workers: s.workers.map((w, i) => i === 0 && w.status === 'idle' ? { ...w, status: 'busy' as const, task_id: taskId, started_at: Date.now() } : w)
      }));
    }, 500);

    return taskId;
  }, [state.currentSessionId]);

  const cancelTask = useCallback((taskId: string) => {
    setState(s => ({
      ...s,
      tasks: s.tasks.map(t => t.id === taskId ? { ...t, status: 'cancelled' as const } : t),
      workers: s.workers.map(w => w.task_id === taskId ? { ...w, status: 'idle' as const, task_id: undefined } : w)
    }));
  }, []);

  const createSession = useCallback((name?: string) => {
    const sessionId = `session-${Date.now()}`;
    setState(s => ({
      ...s,
      sessions: [...s.sessions, { id: sessionId, name: name || 'New Session', created_at: Date.now(), updated_at: Date.now(), task_count: 0 }],
      currentSessionId: sessionId,
      messages: []
    }));
    return sessionId;
  }, []);

  const switchSession = useCallback((sessionId: string) => {
    setState(s => ({ ...s, currentSessionId: sessionId }));
  }, []);

  const updateConfig = useCallback(() => {}, []);
  const saveSkill = useCallback(() => {}, []);
  const deleteSkill = useCallback(() => {}, []);
  const clearLogs = useCallback(() => setState(s => ({ ...s, logs: [] })), []);
  const clearMessages = useCallback(() => setState(s => ({ ...s, messages: [] })), []);

  const currentMessages = state.messages.filter(
    m => !state.currentSessionId || m.session_id === state.currentSessionId
  );

  const currentTasks = state.tasks.filter(
    t => !state.currentSessionId || t.session_id === state.currentSessionId
  );

  return {
    ...state,
    currentMessages,
    currentTasks,
    submitTask,
    cancelTask,
    createSession,
    switchSession,
    updateConfig,
    saveSkill,
    deleteSkill,
    clearLogs,
    clearMessages
  };
}
