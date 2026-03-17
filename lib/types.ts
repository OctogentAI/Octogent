// ============================================================================
// Autonomous Multi-Agent AI System - Shared TypeScript Types
// ============================================================================

// Session & Messages
export interface Session {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  status: SessionStatus;
  agent_config: string; // Path to agent config file
  metadata: Record<string, unknown>;
}

export type SessionStatus = 'active' | 'completed' | 'failed' | 'cancelled';

export interface Message {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  tool_calls?: ToolCall[];
  metadata: Record<string, unknown>;
}

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

// Tool System
export interface ToolCall {
  id: string;
  message_id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: ToolCallStatus;
  started_at: string;
  completed_at?: string;
  error?: string;
}

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
}

export interface ToolContext {
  sessionId: string;
  taskId: string;
  workspaceDir: string;
  abortSignal?: AbortSignal;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// Memory System
export interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
  session_id?: string; // null for global memory
  metadata: Record<string, unknown>;
}

// Task Management
export interface Task {
  id: string;
  session_id: string;
  parent_task_id?: string; // For sub-agents
  prompt: string;
  status: TaskStatus;
  worker_slot?: number;
  priority: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  result?: string;
  error?: string;
  iterations: number;
  metadata: Record<string, unknown>;
}

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

// Worker Pool
export interface WorkerSlot {
  id: number;
  status: WorkerStatus;
  task_id?: string;
  started_at?: string;
  iterations: number;
  last_activity?: string;
}

export type WorkerStatus = 'idle' | 'busy' | 'error';

export interface WorkerMessage {
  type: WorkerMessageType;
  taskId?: string;
  payload?: unknown;
}

export type WorkerMessageType =
  | 'start_task'
  | 'cancel_task'
  | 'task_update'
  | 'task_complete'
  | 'task_failed'
  | 'tool_call'
  | 'tool_result'
  | 'llm_chunk'
  | 'shutdown';

// LLM Backend
export interface LLMConfig {
  provider: 'ollama' | 'groq';
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMStreamChunk {
  content: string;
  done: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: string;
}

// Gateway Events (WebSocket)
export interface GatewayEvent {
  type: GatewayEventType;
  timestamp: string;
  payload: unknown;
}

export type GatewayEventType =
  | 'connected'
  | 'task_created'
  | 'task_started'
  | 'task_update'
  | 'task_completed'
  | 'task_failed'
  | 'task_cancelled'
  | 'worker_update'
  | 'llm_chunk'
  | 'tool_call_start'
  | 'tool_call_end'
  | 'log'
  | 'error';

// Gateway Commands (WebSocket)
export interface GatewayCommand {
  type: GatewayCommandType;
  payload: unknown;
}

export type GatewayCommandType =
  | 'create_task'
  | 'cancel_task'
  | 'get_status'
  | 'get_workers'
  | 'get_sessions'
  | 'get_config'
  | 'update_config'
  | 'subscribe'
  | 'unsubscribe';

// Configuration
export interface SystemConfig {
  models: ModelsConfig;
  workers: WorkersConfig;
  gateway: GatewayConfig;
  tools: ToolsConfig;
  cron: CronJob[];
}

export interface ModelsConfig {
  primary: string; // e.g., "ollama/llama3:8b"
  fallbacks: string[];
  ollama_host: string;
  groq_api_key?: string;
  temperature: number;
  max_tokens: number;
}

export interface WorkersConfig {
  max_slots: number;
  max_iterations: number;
  thinking_mode: boolean;
  context_limit: number;
  prune_threshold: number;
}

export interface GatewayConfig {
  port: number;
  host: string;
  cors_origins: string[];
}

export interface ToolsConfig {
  enabled: string[];
  disabled: string[];
  bash_timeout: number;
  max_file_size: number;
  searxng_url?: string;
}

export interface CronJob {
  id: string;
  schedule: string; // cron expression
  prompt: string;
  enabled: boolean;
}

// Skills
export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  file_path: string;
  enabled: boolean;
}

// Agent Configuration
export interface AgentConfig {
  name: string;
  persona: string;
  skills: string[];
  tools: string[];
  system_prompt_additions?: string;
}

// API Request/Response Types
export interface CreateTaskRequest {
  prompt: string;
  priority?: number;
  agent_config?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateTaskResponse {
  task_id: string;
  session_id: string;
  status: TaskStatus;
}

export interface TaskStatusResponse {
  task: Task;
  session: Session;
  messages: Message[];
  worker_slot?: WorkerSlot;
}

export interface WorkersStatusResponse {
  slots: WorkerSlot[];
  queue_length: number;
}

export interface SessionsListResponse {
  sessions: Session[];
  total: number;
  page: number;
  per_page: number;
}

// Logging
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  data?: Record<string, unknown>;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Nullable<T> = T | null;
