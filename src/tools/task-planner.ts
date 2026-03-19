// ============================================================================
// Tool: task_planner — breaks a high-level goal into an ordered plan
// ============================================================================

import type { ToolDefinition, ToolContext, ToolResult } from '../types.js';
import { simpleCompletion } from '../agent/loop.js';

export interface TaskPlannerArgs {
  goal: string;
  max_steps?: number;
  format?: 'markdown' | 'json';
  context?: string;
}

const PLANNER_SYSTEM = `You are an expert project planner for an autonomous AI coding agent.
Given a high-level goal, produce a concrete, ordered action plan.

Rules:
- Each step must be atomic and actionable.
- Steps must be ordered by dependency (earlier steps unblock later ones).
- Each step should describe WHAT to do, not HOW to do it internally.
- Be specific — name files, functions, or commands where applicable.
- Do not invent requirements not stated in the goal.
- Output ONLY the plan in the requested format.`;

async function executeTaskPlanner(
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<ToolResult> {
  const {
    goal,
    max_steps = 10,
    format = 'markdown',
    context: extraContext = '',
  } = args as TaskPlannerArgs;

  if (!goal || typeof goal !== 'string') {
    return { success: false, output: '', error: 'goal is required' };
  }

  const userPrompt = [
    `Goal: ${goal}`,
    extraContext ? `Additional context: ${extraContext}` : '',
    `Max steps: ${max_steps}`,
    '',
    format === 'json'
      ? 'Return a JSON array of step objects with fields: { step: number, title: string, description: string, tools: string[] }.'
      : 'Return a numbered markdown list. Each item: bold title + one-sentence description.',
  ]
    .filter(Boolean)
    .join('\n');

  const { content, error } = await simpleCompletion(userPrompt, PLANNER_SYSTEM);

  if (error) {
    return { success: false, output: '', error };
  }

  return {
    success: true,
    output: content,
    metadata: { goal, format, steps: max_steps },
  };
}

export const taskPlannerTool: ToolDefinition = {
  name: 'task_planner',
  description:
    'Break a complex high-level goal into an ordered, concrete action plan. ' +
    'Useful at the start of a task to decide what to do next.',
  parameters: [
    {
      name: 'goal',
      type: 'string',
      description: 'The high-level goal or task to plan.',
      required: true,
    },
    {
      name: 'max_steps',
      type: 'number',
      description: 'Maximum number of steps in the plan. Default: 10.',
      required: false,
      default: 10,
    },
    {
      name: 'format',
      type: 'string',
      description: 'Output format: "markdown" (default) or "json".',
      required: false,
      default: 'markdown',
    },
    {
      name: 'context',
      type: 'string',
      description: 'Optional extra context (e.g. tech stack, constraints).',
      required: false,
    },
  ],
  execute: executeTaskPlanner,
};
