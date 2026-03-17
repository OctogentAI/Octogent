// ============================================================================
// Session & Message Database Operations
// ============================================================================

import { db, generateId } from './schema';
import type { Session, Message, Task, ToolCall, SessionStatus, TaskStatus, MessageRole, ToolCallStatus } from '../../lib/types';

// ============================================================================
// Sessions
// ============================================================================

export function createSession(options: {
  title?: string;
  agentConfig?: string;
  metadata?: Record<string, unknown>;
} = {}): Session {
  const id = generateId();
  const stmt = db.prepare(`
    INSERT INTO sessions (id, title, agent_config, metadata)
    VALUES (?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    options.title || 'New Session',
    options.agentConfig || '.agents/default.md',
    JSON.stringify(options.metadata || {})
  );
  
  return getSession(id)!;
}

export function getSession(id: string): Session | null {
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  const row = stmt.get(id) as Record<string, unknown> | undefined;
  
  if (!row) return null;
  
  return {
    ...row,
    metadata: JSON.parse(row.metadata as string)
  } as Session;
}

export function updateSession(id: string, updates: Partial<Session>): Session | null {
  const allowedFields = ['title', 'status', 'agent_config', 'metadata'];
  const setClause: string[] = [];
  const values: unknown[] = [];
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClause.push(`${key} = ?`);
      values.push(key === 'metadata' ? JSON.stringify(value) : value);
    }
  }
  
  if (setClause.length === 0) return getSession(id);
  
  values.push(id);
  const stmt = db.prepare(`UPDATE sessions SET ${setClause.join(', ')} WHERE id = ?`);
  stmt.run(...values);
  
  return getSession(id);
}

export function listSessions(options: {
  status?: SessionStatus;
  limit?: number;
  offset?: number;
} = {}): { sessions: Session[]; total: number } {
  const { status, limit = 50, offset = 0 } = options;
  
  let countQuery = 'SELECT COUNT(*) as count FROM sessions';
  let selectQuery = 'SELECT * FROM sessions';
  const params: unknown[] = [];
  
  if (status) {
    countQuery += ' WHERE status = ?';
    selectQuery += ' WHERE status = ?';
    params.push(status);
  }
  
  selectQuery += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  
  const countStmt = db.prepare(countQuery);
  const total = (countStmt.get(...params) as { count: number }).count;
  
  const selectStmt = db.prepare(selectQuery);
  const rows = selectStmt.all(...params, limit, offset) as Record<string, unknown>[];
  
  const sessions = rows.map(row => ({
    ...row,
    metadata: JSON.parse(row.metadata as string)
  })) as Session[];
  
  return { sessions, total };
}

export function deleteSession(id: string): boolean {
  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// ============================================================================
// Messages
// ============================================================================

export function createMessage(options: {
  sessionId: string;
  role: MessageRole;
  content: string;
  metadata?: Record<string, unknown>;
}): Message {
  const id = generateId();
  const stmt = db.prepare(`
    INSERT INTO messages (id, session_id, role, content, metadata)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    options.sessionId,
    options.role,
    options.content,
    JSON.stringify(options.metadata || {})
  );
  
  return getMessage(id)!;
}

export function getMessage(id: string): Message | null {
  const stmt = db.prepare('SELECT * FROM messages WHERE id = ?');
  const row = stmt.get(id) as Record<string, unknown> | undefined;
  
  if (!row) return null;
  
  // Get tool calls for this message
  const toolCalls = getToolCallsForMessage(id);
  
  return {
    ...row,
    metadata: JSON.parse(row.metadata as string),
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined
  } as Message;
}

export function getMessagesForSession(sessionId: string, limit?: number): Message[] {
  let query = 'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC';
  const params: unknown[] = [sessionId];
  
  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }
  
  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Record<string, unknown>[];
  
  return rows.map(row => {
    const toolCalls = getToolCallsForMessage(row.id as string);
    return {
      ...row,
      metadata: JSON.parse(row.metadata as string),
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }) as Message[];
}

export function deleteMessagesAfter(sessionId: string, messageId: string): number {
  const stmt = db.prepare(`
    DELETE FROM messages 
    WHERE session_id = ? 
    AND created_at > (SELECT created_at FROM messages WHERE id = ?)
  `);
  const result = stmt.run(sessionId, messageId);
  return result.changes;
}

// ============================================================================
// Tool Calls
// ============================================================================

export function createToolCall(options: {
  messageId: string;
  name: string;
  args: Record<string, unknown>;
}): ToolCall {
  const id = generateId();
  const stmt = db.prepare(`
    INSERT INTO tool_calls (id, message_id, name, args)
    VALUES (?, ?, ?, ?)
  `);
  
  stmt.run(id, options.messageId, options.name, JSON.stringify(options.args));
  
  return getToolCall(id)!;
}

export function getToolCall(id: string): ToolCall | null {
  const stmt = db.prepare('SELECT * FROM tool_calls WHERE id = ?');
  const row = stmt.get(id) as Record<string, unknown> | undefined;
  
  if (!row) return null;
  
  return {
    ...row,
    args: JSON.parse(row.args as string)
  } as ToolCall;
}

export function getToolCallsForMessage(messageId: string): ToolCall[] {
  const stmt = db.prepare('SELECT * FROM tool_calls WHERE message_id = ? ORDER BY started_at ASC');
  const rows = stmt.all(messageId) as Record<string, unknown>[];
  
  return rows.map(row => ({
    ...row,
    args: JSON.parse(row.args as string)
  })) as ToolCall[];
}

export function updateToolCall(id: string, updates: {
  status?: ToolCallStatus;
  result?: string;
  error?: string;
  completedAt?: string;
}): ToolCall | null {
  const setClause: string[] = [];
  const values: unknown[] = [];
  
  if (updates.status) {
    setClause.push('status = ?');
    values.push(updates.status);
  }
  if (updates.result !== undefined) {
    setClause.push('result = ?');
    values.push(updates.result);
  }
  if (updates.error !== undefined) {
    setClause.push('error = ?');
    values.push(updates.error);
  }
  if (updates.completedAt) {
    setClause.push('completed_at = ?');
    values.push(updates.completedAt);
  }
  
  if (setClause.length === 0) return getToolCall(id);
  
  values.push(id);
  const stmt = db.prepare(`UPDATE tool_calls SET ${setClause.join(', ')} WHERE id = ?`);
  stmt.run(...values);
  
  return getToolCall(id);
}

// ============================================================================
// Tasks
// ============================================================================

export function createTask(options: {
  sessionId: string;
  prompt: string;
  parentTaskId?: string;
  priority?: number;
  metadata?: Record<string, unknown>;
}): Task {
  const id = generateId();
  const stmt = db.prepare(`
    INSERT INTO tasks (id, session_id, parent_task_id, prompt, priority, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    options.sessionId,
    options.parentTaskId || null,
    options.prompt,
    options.priority || 0,
    JSON.stringify(options.metadata || {})
  );
  
  return getTask(id)!;
}

export function getTask(id: string): Task | null {
  const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
  const row = stmt.get(id) as Record<string, unknown> | undefined;
  
  if (!row) return null;
  
  return {
    ...row,
    metadata: JSON.parse(row.metadata as string)
  } as Task;
}

export function updateTask(id: string, updates: Partial<Task>): Task | null {
  const allowedFields = ['status', 'worker_slot', 'started_at', 'completed_at', 'result', 'error', 'iterations', 'metadata'];
  const setClause: string[] = [];
  const values: unknown[] = [];
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClause.push(`${key} = ?`);
      values.push(key === 'metadata' ? JSON.stringify(value) : value);
    }
  }
  
  if (setClause.length === 0) return getTask(id);
  
  values.push(id);
  const stmt = db.prepare(`UPDATE tasks SET ${setClause.join(', ')} WHERE id = ?`);
  stmt.run(...values);
  
  return getTask(id);
}

export function getQueuedTasks(limit: number = 10): Task[] {
  const stmt = db.prepare(`
    SELECT * FROM tasks 
    WHERE status = 'queued' 
    ORDER BY priority DESC, created_at ASC 
    LIMIT ?
  `);
  const rows = stmt.all(limit) as Record<string, unknown>[];
  
  return rows.map(row => ({
    ...row,
    metadata: JSON.parse(row.metadata as string)
  })) as Task[];
}

export function getRunningTasks(): Task[] {
  const stmt = db.prepare("SELECT * FROM tasks WHERE status = 'running'");
  const rows = stmt.all() as Record<string, unknown>[];
  
  return rows.map(row => ({
    ...row,
    metadata: JSON.parse(row.metadata as string)
  })) as Task[];
}

export function getTasksForSession(sessionId: string): Task[] {
  const stmt = db.prepare('SELECT * FROM tasks WHERE session_id = ? ORDER BY created_at ASC');
  const rows = stmt.all(sessionId) as Record<string, unknown>[];
  
  return rows.map(row => ({
    ...row,
    metadata: JSON.parse(row.metadata as string)
  })) as Task[];
}

export function cancelTask(id: string): Task | null {
  return updateTask(id, {
    status: 'cancelled',
    completed_at: new Date().toISOString()
  });
}
