// ============================================================================
// Agent Reflection — self-critique and course-correct
// ============================================================================

import type { LLMMessage } from '../types.js';
import { simpleCompletion } from './loop.js';

export interface ReflectionResult {
  critique: string;
  shouldContinue: boolean;
  revisedApproach?: string;
  flaggedIssues: string[];
}

const REFLECTION_SYSTEM = `You are an expert AI agent reviewer.
Critically analyze the conversation history and current progress toward the stated goal.

Return ONLY valid JSON (no markdown fences):
{
  "critique": "<honest assessment of progress and any mistakes made>",
  "shouldContinue": <boolean — false only if the goal was clearly completed or is impossible>,
  "revisedApproach": "<optional: describe a better approach if the current one is flawed>",
  "flaggedIssues": ["<issue 1>", "<issue 2>"]
}`;

/**
 * Ask the LLM to reflect on a conversation and determine if the approach is correct.
 */
export async function reflect(
  goal: string,
  history: LLMMessage[],
  currentIteration: number
): Promise<ReflectionResult> {
  // Build a compact summary of what has happened
  const historyText = history
    .filter((m) => m.role !== 'system')
    .slice(-20) // Use last 20 messages for reflection
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content.slice(0, 500)}`)
    .join('\n---\n');

  const prompt = [
    `Goal: ${goal}`,
    `Iteration: ${currentIteration}`,
    '',
    'Conversation history (last 20 messages):',
    historyText,
    '',
    'Provide your reflection.',
  ].join('\n');

  const { content, error } = await simpleCompletion(prompt, REFLECTION_SYSTEM);

  if (error) {
    return {
      critique: `Reflection failed: ${error}`,
      shouldContinue: true,
      flaggedIssues: [],
    };
  }

  try {
    const cleaned = content.replace(/```json\n?|```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as ReflectionResult;
    return {
      critique: parsed.critique ?? '',
      shouldContinue: parsed.shouldContinue ?? true,
      revisedApproach: parsed.revisedApproach,
      flaggedIssues: parsed.flaggedIssues ?? [],
    };
  } catch {
    return {
      critique: content,
      shouldContinue: true,
      flaggedIssues: [],
    };
  }
}

/**
 * Check if the agent is stuck in a loop (repeating the same tool calls).
 */
export function detectLoop(
  recentToolCalls: Array<{ name: string; args: Record<string, unknown> }>,
  windowSize = 6
): { isLooping: boolean; pattern?: string } {
  if (recentToolCalls.length < windowSize) {
    return { isLooping: false };
  }

  const window = recentToolCalls.slice(-windowSize);
  const signatures = window.map((tc) =>
    `${tc.name}:${JSON.stringify(tc.args)}`
  );

  // Check if the same call appears 3+ times in the window
  const counts = new Map<string, number>();
  for (const sig of signatures) {
    counts.set(sig, (counts.get(sig) ?? 0) + 1);
  }

  for (const [sig, count] of counts.entries()) {
    if (count >= 3) {
      return { isLooping: true, pattern: sig.slice(0, 100) };
    }
  }

  // Check for alternating pair pattern (A, B, A, B, ...)
  if (windowSize >= 4) {
    const half = windowSize / 2;
    const first = signatures.slice(0, half).join(',');
    const second = signatures.slice(half).join(',');
    if (first === second) {
      return { isLooping: true, pattern: `Repeating pattern: ${first.slice(0, 100)}` };
    }
  }

  return { isLooping: false };
}
