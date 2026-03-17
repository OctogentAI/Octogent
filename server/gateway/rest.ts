// ============================================================================
// REST API Server - HTTP endpoints for task management
// ============================================================================

import { createServer, IncomingMessage, ServerResponse } from 'http';
import type { Task, Session, SystemConfig, Skill } from '../../lib/types';
import { getConfig, updateConfig, validateConfig, reloadConfig } from '../config';
import { getWorkerPool } from '../workers/pool';
import {
  createSession, createTask, getSession, getTask, listSessions,
  getMessagesForSession, cancelTask, updateSession, deleteSession
} from '../db/sessions';
import { listMemory, getMemoryStats } from '../db/memory';
import { getAllToolSchemas } from '../tools/registry';
import { getStatus as getLLMStatus } from '../llm/router';

export class RestApiServer {
  private server: ReturnType<typeof createServer> | null = null;
  private corsOrigins: string[];
  
  constructor() {
    this.corsOrigins = getConfig().gateway.cors_origins;
  }
  
  /**
   * Start the REST API server
   */
  start(port: number, host: string = '127.0.0.1'): void {
    this.server = createServer((req, res) => {
      this.handleRequest(req, res);
    });
    
    this.server.listen(port, host, () => {
      console.log(`[rest] REST API server listening on http://${host}:${port}`);
    });
  }
  
  /**
   * Handle incoming HTTP request
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS headers
    const origin = req.headers.origin;
    if (origin && this.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;
    
    try {
      // Parse body for POST/PUT
      let body: unknown = null;
      if (req.method === 'POST' || req.method === 'PUT') {
        body = await this.parseBody(req);
      }
      
      // Route request
      if (path === '/api/health') {
        this.handleHealth(req, res);
      } else if (path === '/api/tasks' && req.method === 'POST') {
        await this.handleCreateTask(body as Record<string, unknown>, res);
      } else if (path.startsWith('/api/tasks/') && req.method === 'GET') {
        const taskId = path.split('/')[3];
        this.handleGetTask(taskId, res);
      } else if (path.startsWith('/api/tasks/') && path.endsWith('/cancel') && req.method === 'POST') {
        const taskId = path.split('/')[3];
        this.handleCancelTask(taskId, res);
      } else if (path === '/api/sessions' && req.method === 'GET') {
        this.handleListSessions(url.searchParams, res);
      } else if (path.startsWith('/api/sessions/') && req.method === 'GET') {
        const sessionId = path.split('/')[3];
        this.handleGetSession(sessionId, url.searchParams, res);
      } else if (path.startsWith('/api/sessions/') && req.method === 'DELETE') {
        const sessionId = path.split('/')[3];
        this.handleDeleteSession(sessionId, res);
      } else if (path === '/api/workers' && req.method === 'GET') {
        this.handleGetWorkers(res);
      } else if (path === '/api/config' && req.method === 'GET') {
        this.handleGetConfig(res);
      } else if (path === '/api/config' && req.method === 'PUT') {
        this.handleUpdateConfig(body as Record<string, unknown>, res);
      } else if (path === '/api/tools' && req.method === 'GET') {
        this.handleGetTools(res);
      } else if (path === '/api/memory' && req.method === 'GET') {
        this.handleGetMemory(url.searchParams, res);
      } else if (path === '/api/llm/status' && req.method === 'GET') {
        await this.handleLLMStatus(res);
      } else if (path === '/webhook' && req.method === 'POST') {
        await this.handleWebhook(body as Record<string, unknown>, res);
      } else {
        this.sendJson(res, 404, { error: 'Not found' });
      }
    } catch (error) {
      console.error('[rest] Request error:', error);
      this.sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }
  
  /**
   * Parse request body as JSON
   */
  private parseBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : null);
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }
  
  /**
   * Send JSON response
   */
  private sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
  
  // Route handlers
  
  private handleHealth(req: IncomingMessage, res: ServerResponse): void {
    const pool = getWorkerPool();
    const status = pool?.getStatus();
    
    this.sendJson(res, 200, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      workers: {
        active: status?.slots.filter(s => s.status === 'busy').length || 0,
        idle: status?.slots.filter(s => s.status === 'idle').length || 0,
        queueLength: status?.queueLength || 0
      }
    });
  }
  
  private async handleCreateTask(body: Record<string, unknown>, res: ServerResponse): Promise<void> {
    const prompt = body?.prompt as string;
    
    if (!prompt?.trim()) {
      this.sendJson(res, 400, { error: 'Prompt is required' });
      return;
    }
    
    const session = createSession({
      title: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
      metadata: body?.metadata as Record<string, unknown>
    });
    
    const task = createTask({
      sessionId: session.id,
      prompt,
      priority: (body?.priority as number) || 0,
      metadata: body?.metadata as Record<string, unknown>
    });
    
    const pool = getWorkerPool();
    if (pool) {
      pool.queueTask(task.id);
    }
    
    this.sendJson(res, 201, {
      task_id: task.id,
      session_id: session.id,
      status: task.status
    });
  }
  
  private handleGetTask(taskId: string, res: ServerResponse): void {
    const task = getTask(taskId);
    
    if (!task) {
      this.sendJson(res, 404, { error: 'Task not found' });
      return;
    }
    
    const session = getSession(task.session_id);
    const messages = getMessagesForSession(task.session_id);
    
    this.sendJson(res, 200, {
      task,
      session,
      messages
    });
  }
  
  private handleCancelTask(taskId: string, res: ServerResponse): void {
    const pool = getWorkerPool();
    
    if (pool?.cancelTask(taskId)) {
      this.sendJson(res, 200, { success: true, taskId });
    } else {
      const task = getTask(taskId);
      if (task) {
        cancelTask(taskId);
        this.sendJson(res, 200, { success: true, taskId });
      } else {
        this.sendJson(res, 404, { error: 'Task not found' });
      }
    }
  }
  
  private handleListSessions(params: URLSearchParams, res: ServerResponse): void {
    const limit = parseInt(params.get('limit') || '50');
    const offset = parseInt(params.get('offset') || '0');
    const status = params.get('status') as 'active' | 'completed' | 'failed' | 'cancelled' | null;
    
    const result = listSessions({
      status: status || undefined,
      limit,
      offset
    });
    
    this.sendJson(res, 200, {
      sessions: result.sessions,
      total: result.total,
      page: Math.floor(offset / limit) + 1,
      per_page: limit
    });
  }
  
  private handleGetSession(sessionId: string, params: URLSearchParams, res: ServerResponse): void {
    const session = getSession(sessionId);
    
    if (!session) {
      this.sendJson(res, 404, { error: 'Session not found' });
      return;
    }
    
    const includeMessages = params.get('messages') !== 'false';
    const messages = includeMessages ? getMessagesForSession(sessionId) : [];
    
    this.sendJson(res, 200, {
      session,
      messages
    });
  }
  
  private handleDeleteSession(sessionId: string, res: ServerResponse): void {
    const deleted = deleteSession(sessionId);
    
    if (deleted) {
      this.sendJson(res, 200, { success: true });
    } else {
      this.sendJson(res, 404, { error: 'Session not found' });
    }
  }
  
  private handleGetWorkers(res: ServerResponse): void {
    const pool = getWorkerPool();
    const status = pool?.getStatus();
    
    this.sendJson(res, 200, status || { slots: [], queueLength: 0 });
  }
  
  private handleGetConfig(res: ServerResponse): void {
    const config = getConfig();
    
    // Remove sensitive data
    const safeConfig = {
      ...config,
      models: {
        ...config.models,
        groq_api_key: config.models.groq_api_key ? '***' : undefined
      }
    };
    
    this.sendJson(res, 200, safeConfig);
  }
  
  private handleUpdateConfig(body: Record<string, unknown>, res: ServerResponse): void {
    const validation = validateConfig(body);
    
    if (!validation.valid) {
      this.sendJson(res, 400, { error: 'Invalid configuration', details: validation.errors });
      return;
    }
    
    try {
      const updated = updateConfig(body);
      this.sendJson(res, 200, {
        success: true,
        config: {
          ...updated,
          models: {
            ...updated.models,
            groq_api_key: updated.models.groq_api_key ? '***' : undefined
          }
        }
      });
    } catch (error) {
      this.sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Failed to update config'
      });
    }
  }
  
  private handleGetTools(res: ServerResponse): void {
    const tools = getAllToolSchemas();
    this.sendJson(res, 200, { tools });
  }
  
  private handleGetMemory(params: URLSearchParams, res: ServerResponse): void {
    const sessionId = params.get('session_id');
    const prefix = params.get('prefix') || undefined;
    const limit = parseInt(params.get('limit') || '100');
    
    const { entries, total } = listMemory({
      sessionId: sessionId || undefined,
      prefix,
      limit
    });
    
    const stats = getMemoryStats();
    
    this.sendJson(res, 200, {
      entries,
      total,
      stats
    });
  }
  
  private async handleLLMStatus(res: ServerResponse): Promise<void> {
    try {
      const status = await getLLMStatus();
      this.sendJson(res, 200, status);
    } catch (error) {
      this.sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Failed to get LLM status'
      });
    }
  }
  
  private async handleWebhook(body: Record<string, unknown>, res: ServerResponse): Promise<void> {
    const prompt = body?.prompt as string;
    
    if (!prompt?.trim()) {
      this.sendJson(res, 400, { error: 'Prompt is required' });
      return;
    }
    
    // Create session and task (same as create_task but for webhooks)
    const session = createSession({
      title: `Webhook: ${prompt.substring(0, 40)}...`,
      metadata: {
        source: 'webhook',
        ...(body?.metadata as Record<string, unknown>)
      }
    });
    
    const task = createTask({
      sessionId: session.id,
      prompt,
      priority: (body?.priority as number) || 0,
      metadata: {
        source: 'webhook',
        ...(body?.metadata as Record<string, unknown>)
      }
    });
    
    const pool = getWorkerPool();
    if (pool) {
      pool.queueTask(task.id);
    }
    
    this.sendJson(res, 202, {
      accepted: true,
      task_id: task.id,
      session_id: session.id
    });
  }
  
  /**
   * Stop the REST API server
   */
  async stop(): Promise<void> {
    if (!this.server) return;
    
    return new Promise((resolve) => {
      this.server?.close(() => {
        console.log('[rest] REST API server stopped');
        resolve();
      });
    });
  }
}

// Singleton instance
let restInstance: RestApiServer | null = null;

export function getRestApi(): RestApiServer | null {
  return restInstance;
}

export function createRestApi(): RestApiServer {
  if (!restInstance) {
    restInstance = new RestApiServer();
  }
  return restInstance;
}
