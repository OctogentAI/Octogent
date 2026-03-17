// ============================================================================
// System Prompt Builder - Construct agent system prompts
// ============================================================================

import fs from 'fs';
import path from 'path';
import { getConfig } from '../config';
import { generateToolPrompt } from '../tools/registry';
import type { AgentConfig, Skill, LLMMessage } from '../../lib/types';

// Default agent configuration
const DEFAULT_AGENT_CONFIG: AgentConfig = {
  name: 'Assistant',
  persona: 'You are a helpful AI assistant that can execute tasks autonomously.',
  skills: [],
  tools: []
};

/**
 * Load agent configuration from file
 */
export function loadAgentConfig(configPath: string): AgentConfig {
  const absolutePath = path.isAbsolute(configPath) 
    ? configPath 
    : path.join(process.cwd(), configPath);
  
  try {
    if (!fs.existsSync(absolutePath)) {
      console.warn(`[prompt-builder] Agent config not found: ${absolutePath}, using defaults`);
      return DEFAULT_AGENT_CONFIG;
    }
    
    const content = fs.readFileSync(absolutePath, 'utf-8');
    
    // Parse markdown frontmatter if present
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (frontmatterMatch) {
      // Simple YAML-like parsing for frontmatter
      const frontmatter = frontmatterMatch[1];
      const config: AgentConfig = { ...DEFAULT_AGENT_CONFIG };
      
      const nameMatch = frontmatter.match(/name:\s*(.+)/);
      if (nameMatch) config.name = nameMatch[1].trim();
      
      const personaMatch = frontmatter.match(/persona:\s*(.+)/);
      if (personaMatch) config.persona = personaMatch[1].trim();
      
      const skillsMatch = frontmatter.match(/skills:\s*\[(.*?)\]/);
      if (skillsMatch) {
        config.skills = skillsMatch[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
      }
      
      const toolsMatch = frontmatter.match(/tools:\s*\[(.*?)\]/);
      if (toolsMatch) {
        config.tools = toolsMatch[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
      }
      
      // The rest of the content (after frontmatter) is additional system prompt
      const restContent = content.slice(frontmatterMatch[0].length).trim();
      if (restContent) {
        config.system_prompt_additions = restContent;
      }
      
      return config;
    }
    
    // If no frontmatter, treat entire content as persona
    return {
      ...DEFAULT_AGENT_CONFIG,
      persona: content.trim()
    };
  } catch (error) {
    console.error(`[prompt-builder] Error loading agent config:`, error);
    return DEFAULT_AGENT_CONFIG;
  }
}

/**
 * Load skill content from file
 */
export function loadSkill(skillPath: string): Skill | null {
  const absolutePath = path.isAbsolute(skillPath)
    ? skillPath
    : path.join(process.cwd(), 'workspace', 'skills', skillPath, 'SKILL.md');
  
  try {
    if (!fs.existsSync(absolutePath)) {
      console.warn(`[prompt-builder] Skill not found: ${absolutePath}`);
      return null;
    }
    
    const content = fs.readFileSync(absolutePath, 'utf-8');
    
    // Extract skill metadata from frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const skill: Skill = {
      id: path.basename(path.dirname(absolutePath)),
      name: path.basename(path.dirname(absolutePath)),
      description: '',
      content: content,
      file_path: absolutePath,
      enabled: true
    };
    
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      
      const nameMatch = frontmatter.match(/name:\s*(.+)/);
      if (nameMatch) skill.name = nameMatch[1].trim();
      
      const descMatch = frontmatter.match(/description:\s*(.+)/);
      if (descMatch) skill.description = descMatch[1].trim();
      
      // Content without frontmatter
      skill.content = content.slice(frontmatterMatch[0].length).trim();
    }
    
    return skill;
  } catch (error) {
    console.error(`[prompt-builder] Error loading skill:`, error);
    return null;
  }
}

/**
 * Build the complete system prompt
 */
export function buildSystemPrompt(options: {
  agentConfigPath?: string;
  additionalSkills?: string[];
  taskContext?: string;
}): string {
  const config = getConfig();
  const agentConfig = loadAgentConfig(options.agentConfigPath || '.agents/default.md');
  
  const parts: string[] = [];
  
  // Base persona
  parts.push(`# Agent: ${agentConfig.name}\n\n${agentConfig.persona}`);
  
  // Current date/time
  parts.push(`\n## Current Context\n\nDate: ${new Date().toISOString()}`);
  
  // Task context if provided
  if (options.taskContext) {
    parts.push(`\n## Task Context\n\n${options.taskContext}`);
  }
  
  // Tools documentation
  const toolPrompt = generateToolPrompt();
  if (toolPrompt) {
    parts.push(`\n${toolPrompt}`);
  }
  
  // Load and inject skills
  const skillIds = [...(agentConfig.skills || []), ...(options.additionalSkills || [])];
  const loadedSkills: Skill[] = [];
  
  for (const skillId of skillIds) {
    const skill = loadSkill(skillId);
    if (skill) {
      loadedSkills.push(skill);
    }
  }
  
  if (loadedSkills.length > 0) {
    parts.push(`\n## Loaded Skills\n`);
    for (const skill of loadedSkills) {
      parts.push(`\n### ${skill.name}\n${skill.description ? `*${skill.description}*\n\n` : ''}${skill.content}`);
    }
  }
  
  // Thinking mode instructions
  if (config.workers.thinking_mode) {
    parts.push(`
## Thinking Process

Before taking any action, wrap your reasoning in <thinking> tags:
<thinking>
Analyze the task, consider options, plan your approach...
</thinking>

Then proceed with tool calls or responses.`);
  }
  
  // Additional instructions
  parts.push(`
## Important Guidelines

1. **Be autonomous**: Complete tasks without asking for clarification unless absolutely necessary.
2. **Use tools effectively**: Leverage the available tools to accomplish your goals.
3. **Think step by step**: Break complex tasks into smaller steps.
4. **Handle errors gracefully**: If a tool fails, try alternative approaches.
5. **Stay focused**: Complete the assigned task before moving on.
6. **Save progress**: Use memory_save to persist important findings.
7. **Delegate when appropriate**: Use spawn_agent for independent subtasks.
8. **Signal completion**: When done, use <TASK_COMPLETE>summary</TASK_COMPLETE>`);
  
  // Agent-specific additions
  if (agentConfig.system_prompt_additions) {
    parts.push(`\n## Additional Instructions\n\n${agentConfig.system_prompt_additions}`);
  }
  
  return parts.join('\n');
}

/**
 * Estimate token count for messages (rough approximation)
 */
export function estimateTokens(messages: LLMMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    // Rough estimate: ~4 characters per token
    total += Math.ceil(msg.content.length / 4);
  }
  return total;
}

/**
 * Prune conversation history to fit within token limit
 */
export function pruneHistory(
  messages: LLMMessage[],
  maxTokens: number
): { pruned: LLMMessage[]; removed: number } {
  if (messages.length === 0) {
    return { pruned: [], removed: 0 };
  }
  
  // Always keep system message if present
  const systemMessage = messages[0].role === 'system' ? messages[0] : null;
  const otherMessages = systemMessage ? messages.slice(1) : [...messages];
  
  // Calculate current tokens
  let currentTokens = estimateTokens(messages);
  
  if (currentTokens <= maxTokens) {
    return { pruned: messages, removed: 0 };
  }
  
  // Remove oldest messages (keeping most recent context)
  const pruned: LLMMessage[] = [];
  let removed = 0;
  
  // Work backwards from most recent
  for (let i = otherMessages.length - 1; i >= 0; i--) {
    const msg = otherMessages[i];
    const msgTokens = estimateTokens([msg]);
    
    if (currentTokens - msgTokens > maxTokens && pruned.length > 0) {
      // Still over limit, skip this message
      currentTokens -= msgTokens;
      removed++;
    } else {
      pruned.unshift(msg);
    }
  }
  
  // Add system message back
  if (systemMessage) {
    pruned.unshift(systemMessage);
  }
  
  // If still over limit, add a summary note
  if (removed > 0) {
    const summaryNote: LLMMessage = {
      role: 'system',
      content: `[Note: ${removed} earlier messages were pruned to fit context limit. The conversation continues from here.]`
    };
    
    // Insert after system message
    const insertIndex = systemMessage ? 1 : 0;
    pruned.splice(insertIndex, 0, summaryNote);
  }
  
  return { pruned, removed };
}
