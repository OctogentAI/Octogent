// ============================================================================
// WebSocket Server - Real-time communication gateway
// ============================================================================

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { GatewayEvent, GatewayCommand, GatewayEventType } from '../../lib/types';
import { getConfig } from '../config';
import { getWorkerPool } from '../workers/pool';
import { createSession, createTask, getTask, cancelTask, listSessions, getMessagesForSession } from '../db/sessions';

interface Client {
  ws: WebSocket;
  id: string;
  subscriptions: Set<string>;
  connectedAt: Date;
}

export class WebSocketGateway {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Client> = new Map();
  
  /**
   * Start the WebSocket server
   */
  start(port: number, host: string = '127.0.0.1'): void {
    this.wss = new WebSocketServer({
      port,
      host,
      clientTracking: true
    });
    
    this.wss.on('connection', (ws, request) => {
      this.handleConnection(ws, request);
    });
    
    this.wss.on('error', (error) => {
      console.error('[ws] Server error:', error);
    });
    
    // Subscribe to worker pool events
    this.subscribeToWorkerPool();
    
    console.log(`[ws] WebSocket server listening on ws://${host}:${port}`);
  }
  
  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, request: IncomingMessage): void {
    const clientId = crypto.randomUUID();
    
    const client: Client = {
      ws,
      id: clientId,
      subscriptions: new Set(['all']), // Subscribe to all events by default
      connectedAt: new Date()
    };
    
    this.clients.set(clientId, client);
    
    console.log(`[ws] Client connected: ${clientId}`);
    
    // Send connected event
    this.sendToClient(client, {
      type: 'connected',
      timestamp: new Date().toISOString(),
      payload: { clientId }
    });
    
    // Handle messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as GatewayCommand;
        this.handleCommand(client, message);
      } catch (error) {
        this.sendToClient(client, {
          type: 'error',
          timestamp: new Date().toISOString(),
          payload: { error: 'Invalid message format' }
        });
      }
    });
    
    // Handle disconnect
    ws.on('close', () => {
      this.clients.delete(clientId);
      console.log(`[ws] Client disconnected: ${clientId}`);
    });
    
    // Handle errors
    ws.on('error', (error) => {
      console.error(`[ws] Client error (${clientId}):`, error);
    });
  }
  
  /**
   * Handle incoming commands from clients
   */
  private async handleCommand(client: Client, command: GatewayCommand): Promise<void> {
    switch (command.type) {
      case 'create_task':
        await this.handleCreateTask(client, command.payload as { prompt: string; priority?: number });
        break;
        
      case 'cancel_task':
        this.handleCancelTask(client, command.payload as { taskId: string });
        break;
        
      case 'get_status':
        this.handleGetStatus(client);
        break;
        
      case 'get_workers':
        this.handleGetWorkers(client);
        break;
        
      case 'get_sessions':
        this.handleGetSessions(client, command.payload as { limit?: number; offset?: number });
        break;
        
      case 'subscribe':
        this.handleSubscribe(client, command.payload as { events: string[] });
        break;
        
      case 'unsubscribe':
        this.handleUnsubscribe(client, command.payload as { events: string[] });
        break;
        
      default:
        this.sendToClient(client, {
          type: 'error',
          timestamp: new Date().toISOString(),
          payload: { error: `Unknown command: ${command.type}` }
        });
    }
  }
  
  /**
   * Handle create_task command
   */
  private async handleCreateTask(
    client: Client,
    payload: { prompt: string; priority?: number }
  ): Promise<void> {
    const { prompt, priority = 0 } = payload;
    
    if (!prompt?.trim()) {
      this.sendToClient(client, {
        type: 'error',
        timestamp: new Date().toISOString(),
        payload: { error: 'Prompt is required' }
      });
      return;
    }
    
    // Create session and task
    const session = createSession({
      title: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '')
    });
    
    const task = createTask({
      sessionId: session.id,
      prompt,
      priority
    });
    
    // Queue task in worker pool
    const pool = getWorkerPool();
    if (pool) {
      pool.queueTask(task.id);
    }
    
    this.sendToClient(client, {
      type: 'task_created',
      timestamp: new Date().toISOString(),
      payload: {
        taskId: task.id,
        sessionId: session.id,
        status: task.status
      }
    });
  }
  
  /**
   * Handle cancel_task command
   */
  private handleCancelTask(client: Client, payload: { taskId: string }): void {
    const { taskId } = payload;
    
    const pool = getWorkerPool();
    if (pool) {
      const cancelled = pool.cancelTask(taskId);
      
      this.sendToClient(client, {
        type: cancelled ? 'task_cancelled' : 'error',
        timestamp: new Date().toISOString(),
        payload: cancelled 
          ? { taskId }
          : { error: 'Task not found or already completed' }
      });
    }
  }
  
  /**
   * Handle get_status command
   */
  private handleGetStatus(client: Client): void {
    const pool = getWorkerPool();
    const status = pool?.getStatus();
    
    this.sendToClient(client, {
      type: 'worker_update',
      timestamp: new Date().toISOString(),
      payload: status || { slots: [], queueLength: 0 }
    });
  }
  
  /**
   * Handle get_workers command
   */
  private handleGetWorkers(client: Client): void {
    this.handleGetStatus(client);
  }
  
  /**
   * Handle get_sessions command
   */
  private handleGetSessions(client: Client, payload: { limit?: number; offset?: number }): void {
    const { sessions, total } = listSessions({
      limit: payload.limit || 50,
      offset: payload.offset || 0
    });
    
    this.sendToClient(client, {
      type: 'log',
      timestamp: new Date().toISOString(),
      payload: {
        type: 'sessions_list',
        sessions,
        total,
        limit: payload.limit || 50,
        offset: payload.offset || 0
      }
    });
  }
  
  /**
   * Handle subscribe command
   */
  private handleSubscribe(client: Client, payload: { events: string[] }): void {
    for (const event of payload.events) {
      client.subscriptions.add(event);
    }
  }
  
  /**
   * Handle unsubscribe command
   */
  private handleUnsubscribe(client: Client, payload: { events: string[] }): void {
    for (const event of payload.events) {
      client.subscriptions.delete(event);
    }
  }
  
  /**
   * Subscribe to worker pool events
   */
  private subscribeToWorkerPool(): void {
    const pool = getWorkerPool();
    if (!pool) return;
    
    pool.on('task:started', (data) => {
      this.broadcast({
        type: 'task_started',
        timestamp: new Date().toISOString(),
        payload: data
      });
    });
    
    pool.on('task:completed', (data) => {
      this.broadcast({
        type: 'task_completed',
        timestamp: new Date().toISOString(),
        payload: data
      });
    });
    
    pool.on('task:failed', (data) => {
      this.broadcast({
        type: 'task_failed',
        timestamp: new Date().toISOString(),
        payload: data
      });
    });
    
    pool.on('task:cancelled', (data) => {
      this.broadcast({
        type: 'task_cancelled',
        timestamp: new Date().toISOString(),
        payload: data
      });
    });
    
    pool.on('worker:ready', (data) => {
      this.broadcast({
        type: 'worker_update',
        timestamp: new Date().toISOString(),
        payload: { ...data, status: 'idle' }
      });
    });
    
    pool.on('worker:busy', (data) => {
      this.broadcast({
        type: 'worker_update',
        timestamp: new Date().toISOString(),
        payload: { ...data, status: 'busy' }
      });
    });
    
    pool.on('llm:chunk', (data) => {
      this.broadcast({
        type: 'llm_chunk',
        timestamp: new Date().toISOString(),
        payload: data
      }, `task:${data.taskId}`);
    });
    
    pool.on('tool:call', (data) => {
      this.broadcast({
        type: 'tool_call_start',
        timestamp: new Date().toISOString(),
        payload: data
      }, `task:${data.taskId}`);
    });
    
    pool.on('tool:result', (data) => {
      this.broadcast({
        type: 'tool_call_end',
        timestamp: new Date().toISOString(),
        payload: data
      }, `task:${data.taskId}`);
    });
  }
  
  /**
   * Send event to a specific client
   */
  private sendToClient(client: Client, event: GatewayEvent): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(event));
    }
  }
  
  /**
   * Broadcast event to all subscribed clients
   */
  broadcast(event: GatewayEvent, subscription: string = 'all'): void {
    for (const client of this.clients.values()) {
      if (client.subscriptions.has('all') || client.subscriptions.has(subscription)) {
        this.sendToClient(client, event);
      }
    }
  }
  
  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }
  
  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    if (!this.wss) return;
    
    // Close all client connections
    for (const client of this.clients.values()) {
      client.ws.close(1000, 'Server shutting down');
    }
    
    this.clients.clear();
    
    // Close server
    return new Promise((resolve) => {
      this.wss?.close(() => {
        console.log('[ws] WebSocket server stopped');
        resolve();
      });
    });
  }
}

// Singleton instance
let gatewayInstance: WebSocketGateway | null = null;

export function getWebSocketGateway(): WebSocketGateway | null {
  return gatewayInstance;
}

export function createWebSocketGateway(): WebSocketGateway {
  if (!gatewayInstance) {
    gatewayInstance = new WebSocketGateway();
  }
  return gatewayInstance;
}
