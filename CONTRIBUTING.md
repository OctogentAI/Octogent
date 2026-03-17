# Contributing to Octogent

Thank you for your interest in contributing to Octogent! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code. Please be respectful and constructive in all interactions.

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- [Ollama](https://ollama.ai/) (for local LLM testing)
- Git

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/Octogent.git
cd Octogent
```

3. Add the upstream remote:

```bash
git remote add upstream https://github.com/OctogentAI/Octogent.git
```

## Development Setup

```bash
# Install dependencies
pnpm install

# Run in development mode (with hot reload)
pnpm dev

# Run tests
pnpm test

# Lint code
pnpm lint

# Type check
pnpm typecheck
```

### Running the Full Stack

```bash
# Start Ollama (separate terminal)
ollama serve

# Pull a model
ollama pull llama3.2:8b

# Start the development server
pnpm dev

# In another terminal, start the CLI
pnpm cli
```

## Making Changes

### Branch Naming

Use descriptive branch names with prefixes:

- `feat/` — New features
- `fix/` — Bug fixes
- `docs/` — Documentation changes
- `refactor/` — Code refactoring
- `test/` — Test additions or changes
- `chore/` — Maintenance tasks

Example: `feat/add-parallel-tool-execution`

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**

- `feat` — New feature
- `fix` — Bug fix
- `docs` — Documentation
- `style` — Formatting (no code change)
- `refactor` — Code restructuring
- `test` — Tests
- `chore` — Maintenance

**Examples:**

```
feat(tools): add git diff tool
fix(agent): handle timeout in bash execution
docs(readme): update installation instructions
refactor(llm): extract common streaming logic
```

### Keep Changes Focused

- One feature/fix per PR
- Keep PRs small and reviewable (< 400 lines ideal)
- If a change is large, consider breaking it into smaller PRs

## Pull Request Process

1. **Update your fork:**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Create a branch:**
   ```bash
   git checkout -b feat/my-feature
   ```

3. **Make changes and test:**
   ```bash
   pnpm test
   pnpm lint
   pnpm typecheck
   ```

4. **Commit and push:**
   ```bash
   git add .
   git commit -m "feat: add my feature"
   git push origin feat/my-feature
   ```

5. **Create a Pull Request** on GitHub

### PR Requirements

- [ ] Tests pass (`pnpm test`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Type check passes (`pnpm typecheck`)
- [ ] Documentation updated (if applicable)
- [ ] Commit messages follow convention
- [ ] PR description explains the change

## Coding Standards

### TypeScript

- Use strict TypeScript (`strict: true`)
- Prefer `type` over `interface` for simple types
- Use explicit return types on exported functions
- Avoid `any` — use `unknown` and narrow types

```typescript
// Good
export function parseResponse(input: string): ParsedResponse {
  // ...
}

// Avoid
export function parseResponse(input: any) {
  // ...
}
```

### Error Handling

- Use typed error classes
- Always handle errors explicitly
- Provide meaningful error messages

```typescript
// Good
try {
  const result = await executeTool(name, args);
  return { success: true, output: result };
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return { success: false, error: message };
}
```

### Async/Await

- Use async/await over raw Promises
- Use `Promise.all` for parallel operations
- Handle rejections properly

### Imports

- Use ES modules (`import`/`export`)
- Group imports: external, internal, types
- Use path aliases (`@/`)

```typescript
// External
import { WebSocket } from 'ws';
import chalk from 'chalk';

// Internal
import { getConfig } from '@/config';
import { executeTool } from '@/tools/registry';

// Types
import type { Task, ToolContext } from '@/types';
```

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage
```

### Writing Tests

- Place tests in `test/` directory
- Use descriptive test names
- Test edge cases and error conditions

```typescript
import { describe, it, expect } from 'vitest';
import { parseToolCalls } from '@/agent/parser';

describe('parseToolCalls', () => {
  it('should parse single tool call', () => {
    const input = '<tool_call>{"name": "bash", "args": {"command": "ls"}}</tool_call>';
    const result = parseToolCalls(input);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('bash');
  });

  it('should handle malformed input gracefully', () => {
    const input = '<tool_call>invalid json</tool_call>';
    const result = parseToolCalls(input);
    expect(result).toHaveLength(0);
  });
});
```

## Documentation

### Code Comments

- Comment **why**, not **what**
- Use JSDoc for exported functions
- Keep comments up to date

```typescript
/**
 * Executes the autonomous agent loop until completion or max iterations.
 * 
 * The loop follows a Think → Act → Observe pattern:
 * 1. LLM generates thoughts and selects tools
 * 2. Tools are executed and results collected
 * 3. Results are fed back to LLM
 * 
 * @param options - Configuration for the agent loop
 * @returns Result object with success status and output
 */
export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  // ...
}
```

### README Updates

When adding features, update:

- Feature list in README
- Usage examples
- Configuration options
- CLI commands (if applicable)

## Adding New Tools

To add a new tool:

1. Create file in `src/tools/<tool-name>.ts`
2. Implement the `ToolDefinition` interface
3. Register in `src/tools/registry.ts`
4. Add tests in `test/tools/<tool-name>.test.ts`
5. Document in README

```typescript
// src/tools/my-tool.ts
import type { ToolDefinition, ToolContext, ToolResult } from '@/types';

export const myTool: ToolDefinition = {
  name: 'my_tool',
  description: 'Description of what this tool does',
  parameters: [
    {
      name: 'input',
      type: 'string',
      description: 'The input to process',
      required: true,
    },
  ],
  execute: async (args, context): Promise<ToolResult> => {
    const { input } = args as { input: string };
    // Implementation
    return { success: true, output: result };
  },
};
```

## Questions?

- Open a [Discussion](https://github.com/OctogentAI/Octogent/discussions)
- Email: [octogent@pm.me](mailto:octogent@pm.me)

Thank you for contributing!
