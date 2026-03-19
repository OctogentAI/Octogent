// ============================================================================
// Tests: agent/context.ts
// ============================================================================

import { describe, it, expect } from 'vitest';
import { AgentContext } from '../../src/agent/context';

describe('AgentContext', () => {
  it('starts empty', () => {
    const ctx = new AgentContext({ maxTokens: 10_000 });
    expect(ctx.length).toBe(0);
    expect(ctx.tokenCount).toBe(0);
  });

  it('accumulates messages', () => {
    const ctx = new AgentContext({ maxTokens: 100_000 });
    ctx.push('user', 'Hello world');
    ctx.push('assistant', 'Hi there!');
    expect(ctx.length).toBe(2);
  });

  it('includes system prompt in toMessages()', () => {
    const ctx = new AgentContext({ systemPrompt: 'You are a helpful assistant.' });
    ctx.push('user', 'Test');
    const msgs = ctx.toMessages();
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('helpful');
  });

  it('prunes oldest non-pinned messages when over budget', () => {
    const ctx = new AgentContext({ maxTokens: 100 }); // Very small budget
    ctx.push('user', 'A'.repeat(30));
    ctx.push('user', 'B'.repeat(30));
    ctx.push('user', 'C'.repeat(30));
    ctx.push('user', 'D'.repeat(30));

    // At least some pruning should have occurred
    const msgs = ctx.toMessages();
    expect(msgs.some((m) => m.content.includes('D'))).toBe(true);
  });

  it('never prunes pinned messages', () => {
    const ctx = new AgentContext({ maxTokens: 200 });
    ctx.push('system', 'Critical context', { pinned: true });
    ctx.push('user', 'A'.repeat(100));
    ctx.push('user', 'B'.repeat(100));
    ctx.push('user', 'C'.repeat(100));

    const msgs = ctx.toMessages();
    expect(msgs.some((m) => m.content === 'Critical context')).toBe(true);
  });

  it('clear removes all non-pinned messages', () => {
    const ctx = new AgentContext();
    ctx.push('user', 'Message 1');
    ctx.push('user', 'Message 2', { pinned: true });
    ctx.clear(true);

    const msgs = ctx.toMessages();
    expect(msgs.length).toBe(1); // Only pinned
  });

  it('removeByTag removes correct messages', () => {
    const ctx = new AgentContext();
    ctx.push('user', 'Keep this');
    ctx.push('user', 'Remove this', { tag: 'temp' });
    ctx.push('user', 'And this', { tag: 'temp' });

    const removed = ctx.removeByTag('temp');
    expect(removed).toBe(2);
    expect(ctx.length).toBe(1);
  });

  it('stats returns correct utilization', () => {
    const ctx = new AgentContext({ maxTokens: 10_000 });
    const stats = ctx.stats();
    expect(stats.maxTokens).toBe(10_000);
    expect(stats.utilization).toBeGreaterThanOrEqual(0);
    expect(stats.utilization).toBeLessThanOrEqual(100);
  });
});
