// ============================================================================
// Octogent - Event Bus for Internal Communication
// ============================================================================

import { EventEmitter } from 'events';
import type { 
  Task, 
  Message, 
  WorkerSlot, 
  ToolCall,
  GatewayEvent,
  GatewayEventType 
} from '../types.js';

// Event types
export interface OctogentEvents {
  // Task events
  'task:created': { task: Task };
  'task:started': { task: Task; workerId: number };
  'task:progress': { taskId: string; iteration: number; message?: string };
  'task:completed': { task: Task; result: string };
  'task:failed': { task: Task; error: string };
  'task:cancelled': { taskId: string };

  // Message events
  'message:created': { message: Message };
  'message:streaming': { sessionId: string; chunk: string };
  'message:complete': { message: Message };

  // Worker events
  'worker:started': { workerId: number };
  'worker:idle': { workerId: number };
  'worker:busy': { workerId: number; taskId: string };
  'worker:error': { workerId: number; error: string };

  // Tool events
  'tool:call:start': { toolCall: ToolCall };
  'tool:call:end': { toolCall: ToolCall };
  'tool:output': { toolCallId: string; output: string };

  // LLM events
  'llm:request': { provider: string; model: string; tokenCount: number };
  'llm:response': { provider: string; model: string; tokenCount: number; durationMs: number };
  'llm:stream:chunk': { sessionId: string; chunk: string };
  'llm:stream:end': { sessionId: string };

  // System events
  'system:ready': { timestamp: number };
  'system:shutdown': { reason: string };
  'system:error': { error: Error };

  // Gateway events (for WebSocket clients)
  'gateway:event': GatewayEvent;
}

type EventHandler<T> = (data: T) => void | Promise<void>;

class TypedEventEmitter {
  private emitter = new EventEmitter();
  private maxListeners = 100;

  constructor() {
    this.emitter.setMaxListeners(this.maxListeners);
  }

  on<K extends keyof OctogentEvents>(
    event: K,
    handler: EventHandler<OctogentEvents[K]>
  ): () => void {
    this.emitter.on(event, handler as (...args: unknown[]) => void);
    return () => this.off(event, handler);
  }

  once<K extends keyof OctogentEvents>(
    event: K,
    handler: EventHandler<OctogentEvents[K]>
  ): void {
    this.emitter.once(event, handler as (...args: unknown[]) => void);
  }

  off<K extends keyof OctogentEvents>(
    event: K,
    handler: EventHandler<OctogentEvents[K]>
  ): void {
    this.emitter.off(event, handler as (...args: unknown[]) => void);
  }

  emit<K extends keyof OctogentEvents>(
    event: K,
    data: OctogentEvents[K]
  ): boolean {
    return this.emitter.emit(event, data);
  }

  // Emit a gateway event for WebSocket clients
  emitGateway(type: GatewayEventType, payload: unknown): void {
    const event: GatewayEvent = {
      type,
      timestamp: new Date().toISOString(),
      payload,
    };
    this.emit('gateway:event', event);
  }

  listenerCount<K extends keyof OctogentEvents>(event: K): number {
    return this.emitter.listenerCount(event);
  }

  removeAllListeners<K extends keyof OctogentEvents>(event?: K): void {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
  }
}

// Global event bus instance
export const eventBus = new TypedEventEmitter();

// Helper to wait for an event with timeout
export function waitForEvent<K extends keyof OctogentEvents>(
  event: K,
  timeoutMs: number = 30000,
  predicate?: (data: OctogentEvents[K]) => boolean
): Promise<OctogentEvents[K]> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      eventBus.off(event, handler);
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeoutMs);

    const handler = (data: OctogentEvents[K]) => {
      if (!predicate || predicate(data)) {
        clearTimeout(timeout);
        eventBus.off(event, handler);
        resolve(data);
      }
    };

    eventBus.on(event, handler);
  });
}

// Helper to collect events into an array
export function collectEvents<K extends keyof OctogentEvents>(
  event: K,
  durationMs: number
): Promise<OctogentEvents[K][]> {
  return new Promise((resolve) => {
    const events: OctogentEvents[K][] = [];
    
    const handler = (data: OctogentEvents[K]) => {
      events.push(data);
    };

    eventBus.on(event, handler);

    setTimeout(() => {
      eventBus.off(event, handler);
      resolve(events);
    }, durationMs);
  });
}

// Event aggregator for batching events
export class EventAggregator<K extends keyof OctogentEvents> {
  private events: OctogentEvents[K][] = [];
  private timer: NodeJS.Timeout | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private eventName: K,
    private batchSize: number,
    private flushIntervalMs: number,
    private onFlush: (events: OctogentEvents[K][]) => void
  ) {}

  start(): void {
    this.unsubscribe = eventBus.on(this.eventName, (data) => {
      this.events.push(data);
      
      if (this.events.length >= this.batchSize) {
        this.flush();
      } else if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), this.flushIntervalMs);
      }
    });
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flush();
  }

  private flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    if (this.events.length > 0) {
      const batch = [...this.events];
      this.events = [];
      this.onFlush(batch);
    }
  }
}
