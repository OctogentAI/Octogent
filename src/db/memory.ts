// ============================================================================
// Memory Store Database Operations
// ============================================================================

import { db, generateId } from './schema';
import type { MemoryEntry } from '../../lib/types';

// ============================================================================
// Memory Operations
// ============================================================================

/**
 * Save or update a memory entry
 * If sessionId is null, it's a global memory entry
 */
export function saveMemory(options: {
  key: string;
  value: string;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
}): MemoryEntry {
  const { key, value, sessionId = null, metadata = {} } = options;
  
  // Check if entry exists
  const existing = getMemory(key, sessionId);
  
  if (existing) {
    // Update existing entry
    const stmt = db.prepare(`
      UPDATE memory 
      SET value = ?, metadata = ?
      WHERE key = ? AND (session_id = ? OR (session_id IS NULL AND ? IS NULL))
    `);
    stmt.run(value, JSON.stringify(metadata), key, sessionId, sessionId);
    return getMemory(key, sessionId)!;
  } else {
    // Create new entry
    const id = generateId();
    const stmt = db.prepare(`
      INSERT INTO memory (id, key, value, session_id, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, key, value, sessionId, JSON.stringify(metadata));
    return getMemoryById(id)!;
  }
}

/**
 * Get a memory entry by key
 */
export function getMemory(key: string, sessionId?: string | null): MemoryEntry | null {
  const stmt = db.prepare(`
    SELECT * FROM memory 
    WHERE key = ? AND (session_id = ? OR (session_id IS NULL AND ? IS NULL))
  `);
  const row = stmt.get(key, sessionId ?? null, sessionId ?? null) as Record<string, unknown> | undefined;
  
  if (!row) return null;
  
  return {
    ...row,
    metadata: JSON.parse(row.metadata as string)
  } as MemoryEntry;
}

/**
 * Get a memory entry by ID
 */
export function getMemoryById(id: string): MemoryEntry | null {
  const stmt = db.prepare('SELECT * FROM memory WHERE id = ?');
  const row = stmt.get(id) as Record<string, unknown> | undefined;
  
  if (!row) return null;
  
  return {
    ...row,
    metadata: JSON.parse(row.metadata as string)
  } as MemoryEntry;
}

/**
 * List all memory entries for a session (or global if sessionId is null)
 */
export function listMemory(options: {
  sessionId?: string | null;
  prefix?: string;
  limit?: number;
  offset?: number;
} = {}): { entries: MemoryEntry[]; total: number } {
  const { sessionId = null, prefix, limit = 100, offset = 0 } = options;
  
  let whereClause = 'WHERE (session_id = ? OR (session_id IS NULL AND ? IS NULL))';
  const params: unknown[] = [sessionId, sessionId];
  
  if (prefix) {
    whereClause += ' AND key LIKE ?';
    params.push(`${prefix}%`);
  }
  
  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM memory ${whereClause}`);
  const total = (countStmt.get(...params) as { count: number }).count;
  
  const selectStmt = db.prepare(`
    SELECT * FROM memory 
    ${whereClause}
    ORDER BY updated_at DESC 
    LIMIT ? OFFSET ?
  `);
  const rows = selectStmt.all(...params, limit, offset) as Record<string, unknown>[];
  
  const entries = rows.map(row => ({
    ...row,
    metadata: JSON.parse(row.metadata as string)
  })) as MemoryEntry[];
  
  return { entries, total };
}

/**
 * Search memory entries by value content
 */
export function searchMemory(options: {
  query: string;
  sessionId?: string | null;
  limit?: number;
}): MemoryEntry[] {
  const { query, sessionId = null, limit = 50 } = options;
  
  const stmt = db.prepare(`
    SELECT * FROM memory 
    WHERE (value LIKE ? OR key LIKE ?)
    AND (session_id = ? OR (session_id IS NULL AND ? IS NULL) OR session_id IS NOT NULL)
    ORDER BY updated_at DESC 
    LIMIT ?
  `);
  
  const searchPattern = `%${query}%`;
  const rows = stmt.all(searchPattern, searchPattern, sessionId, sessionId, limit) as Record<string, unknown>[];
  
  return rows.map(row => ({
    ...row,
    metadata: JSON.parse(row.metadata as string)
  })) as MemoryEntry[];
}

/**
 * Delete a memory entry
 */
export function deleteMemory(key: string, sessionId?: string | null): boolean {
  const stmt = db.prepare(`
    DELETE FROM memory 
    WHERE key = ? AND (session_id = ? OR (session_id IS NULL AND ? IS NULL))
  `);
  const result = stmt.run(key, sessionId ?? null, sessionId ?? null);
  return result.changes > 0;
}

/**
 * Delete all memory entries for a session
 */
export function clearSessionMemory(sessionId: string): number {
  const stmt = db.prepare('DELETE FROM memory WHERE session_id = ?');
  const result = stmt.run(sessionId);
  return result.changes;
}

/**
 * Delete all global memory entries
 */
export function clearGlobalMemory(): number {
  const stmt = db.prepare('DELETE FROM memory WHERE session_id IS NULL');
  const result = stmt.run();
  return result.changes;
}

/**
 * Get memory stats
 */
export function getMemoryStats(): {
  globalCount: number;
  sessionCount: number;
  totalSize: number;
} {
  const globalStmt = db.prepare('SELECT COUNT(*) as count FROM memory WHERE session_id IS NULL');
  const sessionStmt = db.prepare('SELECT COUNT(*) as count FROM memory WHERE session_id IS NOT NULL');
  const sizeStmt = db.prepare('SELECT SUM(LENGTH(value)) as size FROM memory');
  
  const globalCount = (globalStmt.get() as { count: number }).count;
  const sessionCount = (sessionStmt.get() as { count: number }).count;
  const totalSize = (sizeStmt.get() as { size: number | null }).size || 0;
  
  return { globalCount, sessionCount, totalSize };
}
