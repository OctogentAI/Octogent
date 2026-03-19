// ============================================================================
// Agent Evaluator — score and critique agent outputs
// ============================================================================

import type { ToolResult } from '../types.js';
import { simpleCompletion } from './loop.js';

export interface EvaluationResult {
  score: number;          // 0.0 – 1.0
  passed: boolean;
  feedback: string;
  suggestions: string[];
  metadata?: Record<string, unknown>;
}

export interface EvaluationCriteria {
  rubric?: string;          // Free-form rubric for the evaluator to use
  expectedOutput?: string;  // Exact or semantic expected result
  minScore?: number;        // Passing threshold (default 0.7)
  strict?: boolean;         // If true, score < 1.0 = fail
}

const EVALUATOR_SYSTEM = `You are an objective, expert evaluator for AI agent outputs.
Assess the provided output against the given criteria and return a JSON response.

Response format (return ONLY valid JSON, no markdown fences):
{
  "score": <float 0.0–1.0>,
  "passed": <boolean>,
  "feedback": "<concise explanation>",
  "suggestions": ["<improvement 1>", "<improvement 2>"]
}

Scoring guide:
  1.0 — Perfect, meets all criteria exactly.
  0.8 — Good, minor issues only.
  0.6 — Acceptable but notable gaps.
  0.4 — Significant issues, partial completion.
  0.2 — Poor, mostly incorrect.
  0.0 — Completely wrong or empty.`;

/**
 * Evaluate an agent output against a set of criteria using an LLM judge.
 */
export async function evaluateOutput(
  output: string,
  goal: string,
  criteria: EvaluationCriteria = {}
): Promise<EvaluationResult> {
  const {
    rubric,
    expectedOutput,
    minScore = 0.7,
    strict = false,
  } = criteria;

  const userPrompt = [
    `Goal: ${goal}`,
    rubric ? `Rubric:\n${rubric}` : '',
    expectedOutput ? `Expected output:\n${expectedOutput}` : '',
    '',
    `Actual output:\n${output}`,
    '',
    strict
      ? 'Apply strict scoring: anything less than perfect (1.0) should fail.'
      : `Passing threshold: ${minScore}`,
  ]
    .filter(Boolean)
    .join('\n');

  const { content, error } = await simpleCompletion(userPrompt, EVALUATOR_SYSTEM);

  if (error) {
    return {
      score: 0,
      passed: false,
      feedback: `Evaluator error: ${error}`,
      suggestions: [],
    };
  }

  try {
    // Strip optional markdown fences
    const cleaned = content.replace(/```json\n?|```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as {
      score: number;
      passed?: boolean;
      feedback: string;
      suggestions: string[];
    };

    const score = Math.max(0, Math.min(1, parsed.score));
    return {
      score,
      passed: strict ? score >= 1.0 : score >= minScore,
      feedback: parsed.feedback ?? '',
      suggestions: parsed.suggestions ?? [],
    };
  } catch {
    return {
      score: 0,
      passed: false,
      feedback: `Failed to parse evaluator response: ${content}`,
      suggestions: [],
    };
  }
}

/**
 * Grade a tool call result.
 */
export function gradeToolResult(result: ToolResult, expectSuccess = true): EvaluationResult {
  if (result.success !== expectSuccess) {
    return {
      score: 0,
      passed: false,
      feedback: result.success
        ? 'Tool succeeded but was expected to fail.'
        : `Tool failed: ${result.error}`,
      suggestions: ['Review tool arguments and context.'],
    };
  }

  const hasOutput = typeof result.output === 'string' && result.output.length > 0;
  return {
    score: hasOutput ? 1.0 : 0.8,
    passed: true,
    feedback: hasOutput ? 'Tool returned expected result.' : 'Tool succeeded but produced no output.',
    suggestions: [],
  };
}

/**
 * Self-consistency check: run the same prompt N times and compare results.
 * Returns average score and variance.
 */
export async function selfConsistencyCheck(
  output: string,
  goal: string,
  criteria: EvaluationCriteria = {},
  rounds = 3
): Promise<{
  averageScore: number;
  variance: number;
  passed: boolean;
  evaluations: EvaluationResult[];
}> {
  const evaluations: EvaluationResult[] = [];

  for (let i = 0; i < rounds; i++) {
    evaluations.push(await evaluateOutput(output, goal, criteria));
  }

  const scores = evaluations.map((e) => e.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - avg) ** 2, 0) / scores.length;
  const passThreshold = criteria.minScore ?? 0.7;

  return {
    averageScore: Math.round(avg * 1000) / 1000,
    variance: Math.round(variance * 1000) / 1000,
    passed: avg >= passThreshold,
    evaluations,
  };
}
