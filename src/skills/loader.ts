// ============================================================================
// Skills Loader - Loads and manages agent skills from workspace/skills/
// ============================================================================

import fs from 'fs';
import path from 'path';
import type { Skill, AgentConfig } from '../../lib/types';

const SKILLS_DIR = path.join(process.cwd(), 'workspace', 'skills');

// Cache loaded skills
let skillsCache: Map<string, Skill> = new Map();
let lastLoad = 0;
const CACHE_TTL = 5000; // 5 seconds

/**
 * Ensure skills directory exists
 */
export function ensureSkillsDir(): void {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

/**
 * Load a single skill from file
 */
export function loadSkill(skillPath: string): Skill | null {
  try {
    const content = fs.readFileSync(skillPath, 'utf-8');
    const skill = JSON.parse(content) as Skill;
    
    // Validate required fields
    if (!skill.name || !skill.description || !skill.system_prompt) {
      console.error(`[skills] Invalid skill at ${skillPath}: missing required fields`);
      return null;
    }
    
    // Set defaults
    skill.tools = skill.tools || [];
    skill.examples = skill.examples || [];
    skill.trigger_patterns = skill.trigger_patterns || [];
    
    return skill;
  } catch (error) {
    console.error(`[skills] Failed to load skill from ${skillPath}:`, error);
    return null;
  }
}

/**
 * Load all skills from the skills directory
 */
export function loadAllSkills(force = false): Map<string, Skill> {
  const now = Date.now();
  
  if (!force && skillsCache.size > 0 && now - lastLoad < CACHE_TTL) {
    return skillsCache;
  }
  
  ensureSkillsDir();
  skillsCache.clear();
  
  try {
    const files = fs.readdirSync(SKILLS_DIR);
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const skillPath = path.join(SKILLS_DIR, file);
      const skill = loadSkill(skillPath);
      
      if (skill) {
        skillsCache.set(skill.name, skill);
      }
    }
    
    lastLoad = now;
    console.log(`[skills] Loaded ${skillsCache.size} skills`);
  } catch (error) {
    console.error('[skills] Failed to load skills:', error);
  }
  
  return skillsCache;
}

/**
 * Get a skill by name
 */
export function getSkill(name: string): Skill | undefined {
  loadAllSkills();
  return skillsCache.get(name);
}

/**
 * Get all skill names
 */
export function getSkillNames(): string[] {
  loadAllSkills();
  return Array.from(skillsCache.keys());
}

/**
 * Save a skill to file
 */
export function saveSkill(skill: Skill): void {
  ensureSkillsDir();
  
  const filename = `${skill.name.toLowerCase().replace(/\s+/g, '-')}.json`;
  const skillPath = path.join(SKILLS_DIR, filename);
  
  fs.writeFileSync(skillPath, JSON.stringify(skill, null, 2));
  skillsCache.set(skill.name, skill);
  
  console.log(`[skills] Saved skill: ${skill.name}`);
}

/**
 * Delete a skill
 */
export function deleteSkill(name: string): boolean {
  ensureSkillsDir();
  
  const skill = skillsCache.get(name);
  if (!skill) return false;
  
  const filename = `${name.toLowerCase().replace(/\s+/g, '-')}.json`;
  const skillPath = path.join(SKILLS_DIR, filename);
  
  try {
    if (fs.existsSync(skillPath)) {
      fs.unlinkSync(skillPath);
    }
    skillsCache.delete(name);
    return true;
  } catch (error) {
    console.error(`[skills] Failed to delete skill ${name}:`, error);
    return false;
  }
}

/**
 * Match a task to a skill based on trigger patterns
 */
export function matchSkillToTask(task: string): Skill | null {
  loadAllSkills();
  
  for (const skill of skillsCache.values()) {
    if (!skill.trigger_patterns || skill.trigger_patterns.length === 0) continue;
    
    for (const pattern of skill.trigger_patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(task)) {
          return skill;
        }
      } catch {
        // Invalid regex, try simple string match
        if (task.toLowerCase().includes(pattern.toLowerCase())) {
          return skill;
        }
      }
    }
  }
  
  return null;
}

/**
 * Build agent config from a skill
 */
export function buildAgentConfigFromSkill(skill: Skill, baseConfig?: Partial<AgentConfig>): AgentConfig {
  return {
    name: baseConfig?.name || `${skill.name} Agent`,
    role: skill.description,
    system_prompt: skill.system_prompt,
    tools: skill.tools,
    examples: skill.examples,
    model: baseConfig?.model,
    temperature: baseConfig?.temperature,
    max_iterations: baseConfig?.max_iterations
  };
}

/**
 * Get the default agent config
 */
export function getDefaultAgentConfig(): AgentConfig {
  return {
    name: 'Octogent',
    role: 'A helpful AI assistant that can execute tasks, write code, search the web, and manage files.',
    system_prompt: `You are Octogent, an autonomous AI agent capable of completing complex tasks.

## Core Capabilities
- Execute bash commands and scripts
- Read, write, and manage files
- Search the web and fetch content
- Store and retrieve information from memory
- Spawn sub-agents for parallel task execution

## Guidelines
1. Break down complex tasks into smaller steps
2. Use tools to gather information before making decisions
3. Verify your work by reading files after writing
4. Use memory to store important findings
5. Spawn sub-agents for independent subtasks
6. Always provide clear explanations of your actions

## Response Format
Think through each step carefully. Use <tool> tags to invoke tools.
Provide a final <answer> when the task is complete.`,
    tools: [
      'bash',
      'read_file',
      'write_file',
      'list_dir',
      'web_search',
      'web_fetch',
      'memory_save',
      'memory_read',
      'spawn_agent',
      'check_task'
    ]
  };
}
