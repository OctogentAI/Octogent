# AGENTS.md

This file provides instructions for AI agents (Claude, GPT, Copilot, etc.) working with the Octogent codebase.

## Project Overview

Octogent is an autonomous multi-agent AI system written in TypeScript. It runs locally, connects to Ollama for LLM inference, and executes tasks through an 8-slot parallel worker pool.

## Directory Structure

```
src/                    # Main source code
├── index.ts            # Server entry point
├── config.ts           # Configuration management
├── types.ts            # TypeScript type definitions
├── agent/              # Agent loop and parsing
├── channels/           # CLI, cron interfaces
├── db/                 # SQLite database layer
├── gateway/            # WebSocket + REST API
├── llm/                # LLM provider clients
├── tools/              # Built-in tools (bash, file ops, etc.)
└── workers/            # Worker pool implementation

bin/                    # CLI entry point (bash wrapper)
workspace/skills/       # Skill definitions (JSON)
test/                   # Test files
```

## Key Architectural Concepts

### Agent Loop

The core agent loop (`src/agent/loop.ts`) follows Think → Act → Observe:

1. **Think** — LLM receives prompt + history, generates response with tool calls
2. **Act** — Tool calls are parsed and executed
3. **Observe** — Results fed back to LLM
4. **Repeat** until task completion or max iterations

### Worker Pool

8 parallel workers (`src/workers/`) using Node.js worker_threads. Each worker runs an independent agent loop. Tasks are queued and distributed.

### Tool System

Tools are defined in `src/tools/` with the `ToolDefinition` interface:

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}
```

### LLM Routing

`src/llm/router.ts` routes to Ollama (local) with Groq as cloud fallback. Streaming is the default.

## Common Tasks

### Adding a New Tool

1. Create `src/tools/<name>.ts`
2. Implement `ToolDefinition`
3. Register in `src/tools/registry.ts`
4. Add to enabled tools in config

### Modifying the Agent Prompt

Edit `src/agent/prompt-builder.ts`. The system prompt includes:
- Base instructions
- Available tools with descriptions
- Skill-specific additions

### Adding CLI Commands

Edit `bin/octogent` (bash script) or `src/channels/cli.ts` (TypeScript CLI).

### Database Schema Changes

1. Edit `src/db/schema.ts`
2. Run migrations or reinitialize

## Code Style

- **TypeScript strict mode** — No `any`, explicit types
- **ES modules** — `import`/`export` syntax
- **Async/await** — Prefer over raw Promises
- **Error handling** — Always typed, meaningful messages

## Testing

```bash
pnpm test           # Run all tests
pnpm test:watch     # Watch mode
pnpm test:coverage  # Coverage report
```

Tests use Vitest. Place tests in `test/` mirroring `src/` structure.

## Building

```bash
pnpm build          # Build with tsup
pnpm dev            # Development with tsx watch
```

## Important Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Server startup, orchestration |
| `src/agent/loop.ts` | Core autonomous loop |
| `src/tools/registry.ts` | Tool registration and execution |
| `src/llm/router.ts` | LLM provider routing |
| `src/config.ts` | Configuration loading |
| `src/types.ts` | All TypeScript types |

## Conventions

### Imports

```typescript
// External packages
import { WebSocket } from 'ws';

// Internal modules
import { getConfig } from '@/config';

// Types (use type-only imports)
import type { Task, ToolContext } from '@/types';
```

### Error Handling

```typescript
try {
  const result = await operation();
  return { success: true, output: result };
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return { success: false, error: message };
}
```

### Logging

Use prefixes for context:

```typescript
console.log('[server] Starting gateway...');
console.log('[agent] Iteration 3 complete');
console.log('[tool:bash] Executing command');
console.error('[worker:2] Task failed:', error);
```

## Environment Variables

```bash
OLLAMA_HOST         # Ollama API URL (default: http://localhost:11434)
GROQ_API_KEY        # Groq API key for cloud fallback
OCTOGENT_PORT       # Server port (default: 18789)
SEARXNG_URL         # SearXNG URL for web search
```

## Do Not

- Modify `pnpm-lock.yaml` manually
- Use `require()` — use ES imports
- Add `console.log` for debugging (use proper logging)
- Commit with failing tests
- Skip type annotations on public APIs

## Do

- Run `pnpm lint` before commits
- Write tests for new features
- Update types when changing interfaces
- Document complex logic with comments
- Keep functions focused and small

## Quick Reference

```bash
# Development
pnpm dev              # Start dev server
pnpm cli              # Run CLI
pnpm test             # Run tests

# Quality
pnpm lint             # Lint code
pnpm typecheck        # Type check
pnpm format           # Format code

# Build
pnpm build            # Production build
pnpm clean            # Clean build artifacts
```
