// ============================================================================
// Tests: agent/reflection.ts — loop detection only (no LLM calls)
// ============================================================================

import { describe, it, expect } from 'vitest';
import { detectLoop } from '../../src/agent/reflection';

describe('detectLoop', () => {
  it('returns false when not enough history', () => {
    const calls = [
      { name: 'bash', args: { command: 'ls' } },
      { name: 'read_file', args: { path: 'README.md' } },
    ];
    expect(detectLoop(calls).isLooping).toBe(false);
  });

  it('detects repeated identical tool calls', () => {
    const call = { name: 'bash', args: { command: 'ls -la' } };
    const calls = [call, call, call, call, call, call];
    const result = detectLoop(calls);
    expect(result.isLooping).toBe(true);
    expect(result.pattern).toContain('bash');
  });

  it('detects A-B-A-B pattern', () => {
    const a = { name: 'read_file', args: { path: 'foo.ts' } };
    const b = { name: 'write_file', args: { path: 'foo.ts', content: 'x' } };
    const calls = [a, b, a, b, a, b];
    const result = detectLoop(calls, 6);
    expect(result.isLooping).toBe(true);
  });

  it('does not flag varied tool calls as a loop', () => {
    const calls = [
      { name: 'bash', args: { command: 'ls' } },
      { name: 'read_file', args: { path: 'a.ts' } },
      { name: 'bash', args: { command: 'pwd' } },
      { name: 'write_file', args: { path: 'b.ts', content: 'hi' } },
      { name: 'web_search', args: { query: 'test' } },
      { name: 'memory_save', args: { key: 'k', value: 'v' } },
    ];
    expect(detectLoop(calls).isLooping).toBe(false);
  });
});
