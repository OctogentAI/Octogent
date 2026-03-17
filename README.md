<div align="center">

# Octogent

**Autonomous Multi-Agent AI System**

An agentic coding assistant that runs on your device.
Execute parallel tasks with local LLMs through an 8-slot worker pool.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Quick Start](#quick-start) |
[Installation](#installation) |
[Configuration](#configuration) |
[Architecture](#architecture) |
[Contributing](#contributing)

</div>

---

## What is Octogent?

Octogent is a **local-first autonomous AI agent** that executes complex tasks using an agentic loop with tool use. It connects to local LLMs via Ollama (or Groq as a cloud fallback) and provides:

- **8-slot parallel worker pool** — Execute multiple tasks simultaneously
- **Autonomous agent loop** — Think → Act → Observe cycle with automatic tool selection
- **10+ built-in tools** — File operations, bash execution, web search, memory persistence
- **Skills system** — Specialized agent configurations for coding, research, writing, devops
- **Session persistence** — SQLite-backed storage for conversations and memory

Think of it as your personal coding assistant that can read files, write code, run commands, search the web, and spawn sub-agents to parallelize work — all running on your machine.

## Quick Start

**Requirements:** Node.js 22+, [Ollama](https://ollama.ai/)

```bash
# Install globally
npm install -g octogent

# Initialize (downloads model, creates config)
octogent init

# Start the agent server
octogent start

# Chat interactively
octogent chat
```

Or run directly without installing:

```bash
npx octogent@latest init
npx octogent start
```

## Installation

### npm (Recommended)

```bash
npm install -g octogent
```

### From Source

```bash
git clone https://github.com/OctogentAI/Octogent.git
cd Octogent
pnpm install
pnpm build
```

### Docker

```bash
# Start all services (Octogent, Ollama, SearXNG, Redis)
docker-compose up -d

# View logs
docker-compose logs -f octogent
```

## Usage

### CLI Commands

```bash
# Initialize Octogent (first-time setup)
octogent init

# Configure settings
octogent config --model llama3.2:8b --threads 8

# Start the server
octogent start

# Interactive chat mode
octogent chat

# Submit a task
octogent task "Refactor the authentication module to use JWT"

# Check worker status
octogent workers

# View active tasks
octogent tasks list

# Run as system daemon
octogent daemon --enable

# Health check
octogent doctor
```

### Programmatic Usage

```typescript
import { startServer, submitTask } from 'octogent';

// Start the server
await startServer();

// Submit a task
const result = await submitTask({
  prompt: 'Write unit tests for the user service',
  priority: 1,
});

console.log(result);
```

## Configuration

Octogent uses `octogent.config.json` for configuration:

```json
{
  "models": {
    "primary": "ollama/llama3.2:8b",
    "fallbacks": ["groq/llama-3.3-70b-versatile"],
    "temperature": 0.7,
    "max_tokens": 4096
  },
  "workers": {
    "max_slots": 8,
    "max_iterations": 50,
    "context_limit": 8000
  },
  "tools": {
    "enabled": ["bash", "read_file", "write_file", "web_search"],
    "bash_timeout": 30000
  }
}
```

### Environment Variables

```bash
# LLM Providers
OLLAMA_HOST=http://localhost:11434
GROQ_API_KEY=your-api-key

# Server
OCTOGENT_PORT=18789
OCTOGENT_HOST=127.0.0.1

# Search
SEARXNG_URL=http://localhost:8080
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        CLI                              │
│              octogent chat / task / ...                 │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                     Gateway                             │
│              WebSocket + REST API                       │
│            ws://127.0.0.1:18789                         │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   Worker Pool                           │
│           8 parallel worker_threads                     │
├─────────┬─────────┬─────────┬─────────┬────────────────┤
│ Worker  │ Worker  │ Worker  │ Worker  │      ...       │
│   #1    │   #2    │   #3    │   #4    │                │
└────┬────┴────┬────┴────┬────┴────┬────┴────────────────┘
     │         │         │         │
     └─────────┴─────────┴─────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│                   Agent Loop                            │
│            Think → Act → Observe                        │
├───────────────────┬─────────────────────────────────────┤
│                   │                                     │
│    ┌──────────────┴──────────────┐                      │
│    ▼                             ▼                      │
│ ┌───────────┐              ┌───────────┐                │
│ │   LLM     │              │   Tools   │                │
│ │  Router   │              │  Registry │                │
│ └─────┬─────┘              └─────┬─────┘                │
│       │                          │                      │
│   ┌───┴───┐                  ┌───┴───┐                  │
│   ▼       ▼                  ▼       ▼                  │
│ Ollama  Groq              bash   read_file             │
│ (local) (cloud)           write  web_search            │
│                           spawn  memory                 │
└─────────────────────────────────────────────────────────┘
```

### Core Components

| Component | Description |
|-----------|-------------|
| **Gateway** | WebSocket + REST API for external communication |
| **Worker Pool** | 8 parallel worker_threads for task execution |
| **Agent Loop** | Autonomous think-act-observe cycle |
| **LLM Router** | Routes to Ollama (local) or Groq (cloud fallback) |
| **Tool Registry** | Manages 10+ built-in tools |
| **Session Store** | SQLite-backed persistence |

## Tools

Octogent includes 10 built-in tools:

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands with timeout and sandboxing |
| `read_file` | Read files with optional line range |
| `write_file` | Write/create files with auto directory creation |
| `list_dir` | List directory contents with metadata |
| `web_search` | Search the web via SearXNG |
| `web_fetch` | Fetch and parse web pages |
| `memory_save` | Save to persistent memory |
| `memory_read` | Query persistent memory |
| `spawn_agent` | Spawn sub-agents for parallel work |
| `check_task` | Check status of spawned tasks |

## Skills

Skills are specialized agent configurations:

```json
{
  "name": "coder",
  "persona": "Expert software developer",
  "tools": ["bash", "read_file", "write_file", "list_dir"],
  "system_prompt_additions": "Focus on clean, maintainable code..."
}
```

Built-in skills:

- **Coder** — Software development, debugging, refactoring
- **Researcher** — Web research, data gathering, analysis
- **Writer** — Documentation, technical writing, content
- **DevOps** — Infrastructure, CI/CD, deployment

Create custom skills in `workspace/skills/<name>.json`.

## Security

- **Sandbox Mode** — Bash commands run with configurable restrictions
- **Tool Allowlists** — Control which tools are available
- **Memory Isolation** — Sessions have isolated memory namespaces
- **Rate Limiting** — Configurable limits on API and tool usage

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Run tests
pnpm test

# Lint
pnpm lint

# Type check
pnpm typecheck

# Build
pnpm build
```

### Project Structure

```
src/
├── index.ts           # Server entry point
├── config.ts          # Configuration loader
├── types.ts           # TypeScript type definitions
├── agent/
│   ├── loop.ts        # Main agent loop
│   ├── parser.ts      # Response parser
│   └── prompt-builder.ts
├── channels/
│   ├── cli.ts         # CLI interface
│   └── cron.ts        # Scheduled tasks
├── db/
│   ├── schema.ts      # Database schema
│   ├── sessions.ts    # Session management
│   └── memory.ts      # Memory persistence
├── gateway/
│   ├── rest.ts        # REST API
│   └── websocket.ts   # WebSocket server
├── llm/
│   ├── router.ts      # LLM provider router
│   ├── ollama.ts      # Ollama client
│   └── groq.ts        # Groq client
├── tools/
│   ├── registry.ts    # Tool registration
│   ├── bash.ts
│   ├── read-file.ts
│   └── ...
└── workers/
    ├── pool.ts        # Worker pool manager
    └── worker.ts      # Worker thread
```

## Troubleshooting

Run the doctor command to diagnose issues:

```bash
octogent doctor
```

**Common issues:**

- **Ollama not running** — Start with `ollama serve`
- **Model not found** — Pull with `octogent models pull llama3.2:8b`
- **Port in use** — Change port with `--port` flag
- **Memory issues** — Reduce `workers.max_slots` or use smaller model

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/Octogent.git

# Create branch
git checkout -b feature/my-feature

# Make changes, test, commit
pnpm test
git commit -m "feat: add my feature"

# Push and create PR
git push origin feature/my-feature
```

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built by [Octogent Labs](mailto:octogent@pm.me)**

[Report Bug](https://github.com/OctogentAI/Octogent/issues) |
[Request Feature](https://github.com/OctogentAI/Octogent/issues) |
[Discussions](https://github.com/OctogentAI/Octogent/discussions)

</div>
