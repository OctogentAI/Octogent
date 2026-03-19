// ============================================================================
// Agent Context — manages a sliding context window for a single agent session
// ============================================================================

import type { LLMMessage } from '../types.js';
import { estimateTokens } from './prompt-builder.js';

export interface ContextEntry {
  role: LLMMessage['role'];
  content: string;
  tokenCount: number;
  timestamp: number;
  pinned?: boolean;  // Pinned messages are never pruned
  tag?: string;      // Optional label for selective pruning
}

export interface ContextOptions {
  maxTokens?: number;
  systemPrompt?: string;
  pinSystemPrompt?: boolean;
}

/**
 * Maintains a token-aware sliding context window.
 * Automatically prunes oldest non-pinned messages when the window fills up.
 */
export class AgentContext {
  private entries: ContextEntry[] = [];
  private maxTokens: number;
  private systemPrompt: string | null;
  private currentTokens = 0;

  constructor(opts: ContextOptions = {}) {
    this.maxTokens = opts.maxTokens ?? 120_000;
    this.systemPrompt = opts.systemPrompt ?? null;
  }

  /** Add the system prompt (replaces any existing one) */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  /** Add a message to the context */
  push(role: LLMMessage['role'], content: string, opts: { pinned?: boolean; tag?: string } = {}): void {
    const tokenCount = estimateTokens(content);
    this.entries.push({
      role,
      content,
      tokenCount,
      timestamp: Date.now(),
      pinned: opts.pinned,
      tag: opts.tag,
    });
    this.currentTokens += tokenCount;
    this.prune();
  }

  /** Remove all messages with a given tag */
  removeByTag(tag: string): number {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => {
      if (e.tag === tag) {
        this.currentTokens -= e.tokenCount;
        return false;
      }
      return true;
    });
    return before - this.entries.length;
  }

  /** Get the current messages as LLMMessage[] (for sending to LLM) */
  toMessages(): LLMMessage[] {
    const msgs: LLMMessage[] = [];

    if (this.systemPrompt) {
      msgs.push({ role: 'system', content: this.systemPrompt });
    }

    for (const entry of this.entries) {
      msgs.push({ role: entry.role, content: entry.content });
    }

    return msgs;
  }

  /** Current token usage */
  get tokenCount(): number {
    return this.currentTokens + (this.systemPrompt ? estimateTokens(this.systemPrompt) : 0);
  }

  /** Number of messages in context (excluding system) */
  get length(): number {
    return this.entries.length;
  }

  /** Percentage of context window used (0-100) */
  get utilization(): number {
    return Math.round((this.tokenCount / this.maxTokens) * 100);
  }

  /** Clear all non-pinned messages */
  clear(keepPinned = true): void {
    if (keepPinned) {
      this.entries = this.entries.filter((e) => e.pinned);
      this.currentTokens = this.entries.reduce((sum, e) => sum + e.tokenCount, 0);
    } else {
      this.entries = [];
      this.currentTokens = 0;
    }
  }

  /** Internal: prune oldest non-pinned messages until under budget */
  private prune(): void {
    const systemTokens = this.systemPrompt ? estimateTokens(this.systemPrompt) : 0;
    const budget = this.maxTokens - systemTokens - 500; // 500-token safety margin

    while (this.currentTokens > budget) {
      // Find the oldest non-pinned entry
      const idx = this.entries.findIndex((e) => !e.pinned);
      if (idx === -1) break; // All remaining are pinned

      const removed = this.entries.splice(idx, 1)[0];
      this.currentTokens -= removed.tokenCount;
    }
  }

  /** Summarize context stats for debugging */
  stats(): {
    messages: number;
    tokens: number;
    utilization: number;
    maxTokens: number;
    pinned: number;
  } {
    return {
      messages: this.entries.length,
      tokens: this.tokenCount,
      utilization: this.utilization,
      maxTokens: this.maxTokens,
      pinned: this.entries.filter((e) => e.pinned).length,
    };
  }
}
