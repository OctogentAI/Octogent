// ============================================================================
// Tests: middleware/telemetry.ts
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  startSpan,
  endSpan,
  incrementCounter,
  recordHistogram,
  recordAgentRun,
  getMetricsSnapshot,
  resetTelemetry,
  formatMetrics,
} from '../../src/middleware/telemetry';
import type { AgentRunMetrics } from '../../src/middleware/telemetry';

beforeEach(() => {
  resetTelemetry();
});

describe('Telemetry', () => {
  it('records span duration', () => {
    const span = startSpan('test.op', { model: 'gpt-4o' });
    endSpan(span, 'ok');

    expect(span.durationMs).toBeGreaterThanOrEqual(0);
    expect(span.status).toBe('ok');

    const snapshot = getMetricsSnapshot();
    expect(snapshot.histogramStats['span.test.op.duration_ms']).toBeDefined();
  });

  it('increments counters', () => {
    incrementCounter('agent.runs.total', 3);
    const snapshot = getMetricsSnapshot();
    expect(snapshot.counters['agent.runs.total']).toBe(3);
  });

  it('records histogram stats', () => {
    recordHistogram('latency_ms', 100);
    recordHistogram('latency_ms', 200);
    recordHistogram('latency_ms', 300);

    const snapshot = getMetricsSnapshot();
    const stats = snapshot.histogramStats['latency_ms'];
    expect(stats.count).toBe(3);
    expect(stats.min).toBe(100);
    expect(stats.max).toBe(300);
    expect(stats.mean).toBe(200);
  });

  it('records agent run metrics', () => {
    const metrics: AgentRunMetrics = {
      taskId: 'task-1',
      sessionId: 'session-1',
      model: 'gpt-5.2-pro',
      provider: 'openai',
      startTime: Date.now(),
      iterations: 4,
      toolCalls: 7,
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      estimatedCostUsd: 0.045,
      success: true,
    };

    recordAgentRun(metrics);

    const snapshot = getMetricsSnapshot();
    expect(snapshot.counters['agent.runs.total']).toBe(1);
    expect(snapshot.counters['agent.runs.succeeded']).toBe(1);
    expect(snapshot.counters['agent.tool_calls.total']).toBe(7);
    expect(snapshot.recentRuns).toHaveLength(1);
  });

  it('formatMetrics returns a non-empty string', () => {
    incrementCounter('foo.bar', 5);
    const output = formatMetrics();
    expect(output).toContain('foo.bar');
    expect(output.length).toBeGreaterThan(10);
  });
});
