// ============================================================================
// Telemetry — structured metrics collection for agent runs
// ============================================================================

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

export interface Span {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  attributes: SpanAttributes;
  status: 'running' | 'ok' | 'error';
  error?: string;
  children: Span[];
}

export interface AgentRunMetrics {
  taskId: string;
  sessionId: string;
  model: string;
  provider: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  iterations: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  success: boolean;
  error?: string;
}

let _spans: Span[] = [];
let _metrics: AgentRunMetrics[] = [];
const _counters = new Map<string, number>();
const _histograms = new Map<string, number[]>();

/**
 * Start a new span (timing block).
 */
export function startSpan(name: string, attributes: SpanAttributes = {}): Span {
  const span: Span = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    startTime: Date.now(),
    attributes,
    status: 'running',
    children: [],
  };
  _spans.push(span);
  return span;
}

/**
 * End a span and record its duration.
 */
export function endSpan(span: Span, status: 'ok' | 'error' = 'ok', error?: string): void {
  span.endTime = Date.now();
  span.durationMs = span.endTime - span.startTime;
  span.status = status;
  if (error) span.error = error;

  // Record in histogram
  recordHistogram(`span.${span.name}.duration_ms`, span.durationMs);
}

/**
 * Increment a counter.
 */
export function incrementCounter(name: string, delta = 1): void {
  _counters.set(name, (_counters.get(name) ?? 0) + delta);
}

/**
 * Record a value in a histogram.
 */
export function recordHistogram(name: string, value: number): void {
  if (!_histograms.has(name)) _histograms.set(name, []);
  _histograms.get(name)!.push(value);
}

/**
 * Record metrics for a completed agent run.
 */
export function recordAgentRun(metrics: AgentRunMetrics): void {
  _metrics.push(metrics);

  // Update counters
  incrementCounter('agent.runs.total');
  if (metrics.success) incrementCounter('agent.runs.succeeded');
  else incrementCounter('agent.runs.failed');
  incrementCounter('agent.tool_calls.total', metrics.toolCalls);
  incrementCounter('agent.tokens.input', metrics.inputTokens);
  incrementCounter('agent.tokens.output', metrics.outputTokens);

  // Update histograms
  if (metrics.durationMs !== undefined) {
    recordHistogram('agent.run.duration_ms', metrics.durationMs);
  }
  recordHistogram('agent.run.iterations', metrics.iterations);
}

/**
 * Get a snapshot of all metrics.
 */
export function getMetricsSnapshot(): {
  counters: Record<string, number>;
  histogramStats: Record<string, { count: number; min: number; max: number; mean: number; p95: number }>;
  recentRuns: AgentRunMetrics[];
} {
  const counters: Record<string, number> = {};
  for (const [k, v] of _counters.entries()) counters[k] = v;

  const histogramStats: Record<string, ReturnType<typeof computeStats>> = {};
  for (const [k, v] of _histograms.entries()) {
    histogramStats[k] = computeStats(v);
  }

  return {
    counters,
    histogramStats,
    recentRuns: _metrics.slice(-100), // Last 100 runs
  };
}

function computeStats(values: number[]) {
  if (values.length === 0) return { count: 0, min: 0, max: 0, mean: 0, p95: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Math.round(sum / sorted.length),
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1],
  };
}

/**
 * Reset all telemetry data (useful for testing).
 */
export function resetTelemetry(): void {
  _spans = [];
  _metrics = [];
  _counters.clear();
  _histograms.clear();
}

/**
 * Format metrics as a human-readable string.
 */
export function formatMetrics(): string {
  const snapshot = getMetricsSnapshot();
  const lines: string[] = ['=== Octogent Telemetry ===', ''];

  lines.push('Counters:');
  for (const [k, v] of Object.entries(snapshot.counters)) {
    lines.push(`  ${k}: ${v}`);
  }

  lines.push('');
  lines.push('Histograms:');
  for (const [k, v] of Object.entries(snapshot.histogramStats)) {
    lines.push(
      `  ${k}: count=${v.count} min=${v.min} mean=${v.mean} p95=${v.p95} max=${v.max}`
    );
  }

  return lines.join('\n');
}
