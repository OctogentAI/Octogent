# Octogent - Autonomous Multi-Agent AI System

<p align="center">
  <img src="assets/octogent-logo.png" alt="Octogent" width="200" />
</p>

<p align="center">
  <strong>Your Personal AI Assistant with Parallel Task Execution</strong>
</p>

<p align="center">
  <a href="#install">Install</a> -
  <a href="#quick-start">Quick Start</a> -
  <a href="#features">Features</a> -
  <a href="#architecture">Architecture</a> -
  <a href="https://www.octogent.com/">Website</a> -
  <a href="mailto:Octogent@pm.me">Contact</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-87.8%25-3178c6?style=flat-square" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Swift-7.9%25-f05138?style=flat-square" alt="Swift" />
  <img src="https://img.shields.io/badge/Kotlin-1.8%25-7f52ff?style=flat-square" alt="Kotlin" />
  <img src="https://img.shields.io/badge/Shell-1.1%25-89e051?style=flat-square" alt="Shell" />
  <img src="https://img.shields.io/badge/JavaScript-0.6%25-f7df1e?style=flat-square" alt="JavaScript" />
  <img src="https://img.shields.io/badge/CSS-0.4%25-563d7c?style=flat-square" alt="CSS" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License" />
</p>

---

Octogent is an autonomous multi-agent AI system you run on your own devices. It executes tasks in parallel across 8 worker slots, connects to multiple LLM backends (Ollama local, Groq cloud), and provides CLI-based control for monitoring and management. The Gateway is the control plane - the product is the assistant.

If you want a personal, multi-agent assistant that feels local, fast, and always-on with parallel task execution, this is it.

**Website:** [https://www.octogent.com/](https://www.octogent.com/)

**Contact:** [Octogent@pm.me](mailto:Octogent@pm.me)

---

## Install

### Step 1 - Initialize

```bash
npx octogent@latest init
```
> Downloads core agent, prompts for model selection

### Step 2 - Configure

```bash
octogent config --model llama3.2:8b --threads 8
```
> Set model and parallel task limit (1-8)

### Step 3 - Launch

```bash
octogent start
```
> Agent is now running at localhost:8888

### Optional - Run as Background Service

```bash
octogent daemon --enable
```
> Runs on system startup, persists across reboots

> **Note:** First run downloads the selected model (~4-8GB depending on choice). Supported models include `llama3.2`, `mistral`, `codellama`, and `deepseek-coder`. Run `octogent models list` for full catalog.

---

## Quick Start

**Runtime:** Node >= 22

```bash
# Initialize and configure
npx octogent@latest init
octogent config --model llama3.2:8b --threads 8

# Start the agent
octogent start

# Send a task via CLI
octogent task "Build a REST API for user management"

# Check worker status
octogent workers

# View active tasks
octogent tasks list
```

---

## Features

### Core Platform

- **8-Slot Parallel Worker Pool** - Execute up to 8 tasks simultaneously using Node.js worker_threads
- **Multi-LLM Backend** - Ollama (local, free) with Groq (cloud) fallback
- **Autonomous Agent Loop** - Think -> Act -> Observe cycle with automatic tool selection
- **Skills System** - JSON-based skill definitions (Coder, Researcher, Writer, DevOps)
- **Memory Persistence** - SQLite-backed long-term memory across sessions

### Tools (10 Built-in)

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands with timeout and sandboxing |
| `read_file` | Read files with line range support |
| `write_file` | Write/create files with directory creation |
| `list_dir` | List directory contents with metadata |
| `web_search` | Search the web via SearXNG |
| `web_fetch` | Fetch and parse web pages |
| `memory_save` | Save information to persistent memory |
| `memory_read` | Query persistent memory |
| `spawn_agent` | Spawn sub-agents for parallel work |
| `check_task` | Check status of spawned tasks |

### Channels

- **CLI** - Interactive terminal interface
- **Webhook** - HTTP endpoint for external integrations
- **Cron** - Scheduled task execution
- **WebSocket** - Real-time bidirectional communication

### Native SDKs

- **iOS/macOS** - Swift SDK with SwiftUI components
- **Android** - Kotlin SDK with Jetpack Compose support

---

## Architecture

```
CLI / Webhook / Cron
        |
        v
+-------------------------------+
|           Gateway             |
|      (WebSocket + REST)       |
|     ws://127.0.0.1:18789      |
+---------------+---------------+
                |
                v
+-------------------------------+
|         Worker Pool           |
|    (8 parallel worker_threads)|
+---------------+---------------+
                |
    +-----------+-----------+
    v           v           v
+-------+   +-------+   +-------+
|Worker |   |Worker |   |Worker | ...
|  #1   |   |  #2   |   |  #3   |
+---+---+   +---+---+   +---+---+
    |           |           |
    v           v           v
+-------------------------------+
|         Agent Loop            |
|  (Think -> Act -> Observe)    |
+---------------+---------------+
                |
    +-----------+-----------+
    v           v           v
+-------+   +-------+   +-------+
|Ollama |   | Groq  |   | Tools |
|(local)|   |(cloud)|   | (10+) |
+-------+   +-------+   +-------+
```

---

## Configuration

Minimal `octogent.config.json`:

```json
{
  "llm": {
    "primary": {
      "provider": "ollama",
      "model": "llama3.2:8b-instruct-q8_0",
      "baseUrl": "http://localhost:11434"
    },
    "fallback": {
      "provider": "groq",
      "model": "llama-3.3-70b-versatile"
    }
  },
  "workers": {
    "poolSize": 8,
    "maxIterations": 25
  }
}
```

Full configuration reference in `octogent.config.json`.

---

## Docker Setup

```bash
# Start all services (Octogent, Redis, Ollama, SearXNG)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

Services:
- **Octogent Server** - Port 18789 (WebSocket + REST)
- **Redis** - Port 6379 (task queue, caching)
- **Ollama** - Port 11434 (local LLM inference)
- **SearXNG** - Port 8080 (web search)

---

## Development

### From Source

```bash
git clone https://github.com/OctogentAI/Octogent.git
cd Octogent

pnpm install
pnpm build

# Run the server
pnpm server

# Run CLI
pnpm cli
```

### Language Breakdown

| Language | Percentage |
|----------|------------|
| TypeScript | 87.8% |
| Swift | 7.9% |
| Kotlin | 1.8% |
| Shell | 1.1% |
| JavaScript | 0.6% |
| CSS | 0.4% |
| Other | 0.4% |

---

## Skills

Octogent comes with 4 built-in skills:

### Coder
Expert software developer for writing, debugging, and refactoring code.

### Researcher
Information gathering specialist for web research and data analysis.

### Writer
Technical and creative writing expert for documentation and content.

### DevOps
Infrastructure and deployment specialist for CI/CD and system administration.

Create custom skills in `workspace/skills/<skill-name>.json`.

---

## Security

- **Sandbox Mode** - Bash commands run with configurable restrictions
- **Allowlists** - Control which tools are available per session
- **Memory Isolation** - Sessions have isolated memory namespaces
- **Rate Limiting** - Configurable limits on API calls and tool usage

---

## CLI Commands

```bash
# Initialize Octogent
octogent init

# Configure settings
octogent config --model <model> --threads <1-8>

# Start the agent
octogent start

# Run as daemon
octogent daemon --enable|--disable

# Task management
octogent task "<prompt>"
octogent tasks list
octogent tasks cancel <id>

# Worker status
octogent workers

# Model management
octogent models list
octogent models pull <model>

# Health check
octogent doctor
```

---

## Environment Variables

```bash
# LLM Providers
OLLAMA_BASE_URL=http://localhost:11434
GROQ_API_KEY=your-groq-api-key

# Server
OCTOGENT_PORT=18789
OCTOGENT_HOST=127.0.0.1

# Database
DATABASE_PATH=./data/octogent.db

# Search
SEARXNG_URL=http://localhost:8080

# Redis (optional)
REDIS_URL=redis://localhost:6379
```

---

## Troubleshooting

Run the doctor command to diagnose issues:

```bash
octogent doctor
```

Common issues:
- **Ollama not running** - Start Ollama with `ollama serve`
- **Model not found** - Pull the model with `octogent models pull llama3.2:8b`
- **Port in use** - Change the port in config or use `--port` flag
- **Memory issues** - Reduce `workers.poolSize` or use a smaller model

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Contact

For questions, feedback, or support:

**Website:** [https://www.octogent.com/](https://www.octogent.com/)

**Email:** [Octogent@pm.me](mailto:Octogent@pm.me)

**GitHub:** [github.com/OctogentAI/Octogent](https://github.com/OctogentAI/Octogent)

---

<p align="center">
  <img src="assets/octogent-logo.png" alt="Octogent" width="80" />
</p>

<p align="center">
  <strong>Built by Octogent Labs</strong>
</p>

<p align="center">
  <a href="https://www.octogent.com/">www.octogent.com</a>
</p>
