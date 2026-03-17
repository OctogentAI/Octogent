#!/usr/bin/env node
// ============================================================================
// Octogent CLI - Interactive command-line interface
// ============================================================================

import * as readline from 'readline';
import { createServer } from './index';
import { getConfig, loadConfigFile } from './config';
import { WorkerPool } from './workers/pool';
import { AgentLoop } from './agent/loop';

const VERSION = '1.0.0';

// ANSI Colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

function printBanner(): void {
  console.log(`
${colors.cyan}${colors.bold}
   ____       _                         _   
  / __ \\  ___| |_ ___   __ _  ___ _ __ | |_ 
 / / _\` |/ __| __/ _ \\ / _\` |/ _ \\ '_ \\| __|
| | (_| | (__| || (_) | (_| |  __/ | | | |_ 
 \\ \\__,_|\\___|\\ __\\___/ \\__, |\\___|_| |_|\\__|
  \\____/               |___/                 
${colors.reset}
  ${colors.green}Autonomous Multi-Agent AI System${colors.reset}
  ${colors.dim}Version ${VERSION}${colors.reset}
  `);
}

function printHelp(): void {
  console.log(`
${colors.cyan}${colors.bold}Octogent CLI Commands:${colors.reset}

  ${colors.yellow}/help${colors.reset}              Show this help message
  ${colors.yellow}/status${colors.reset}            Show worker pool status
  ${colors.yellow}/workers${colors.reset}           List all workers and their states
  ${colors.yellow}/config${colors.reset}            Show current configuration
  ${colors.yellow}/model <name>${colors.reset}      Switch to a different model
  ${colors.yellow}/clear${colors.reset}             Clear the screen
  ${colors.yellow}/exit${colors.reset}              Exit the CLI

${colors.cyan}${colors.bold}Tips:${colors.reset}
  - Just type your task and press Enter to get started
  - The agent will use tools autonomously to complete tasks
  - Multi-line input: end with \\ to continue on next line
  `);
}

interface CLIOptions {
  model?: string;
  threads?: number;
  workspace?: string;
  verbose?: boolean;
}

async function main(options: CLIOptions = {}): Promise<void> {
  printBanner();

  // Load configuration
  await loadConfigFile();
  const config = getConfig();

  // Apply CLI options
  if (options.model) {
    config.llm.model = options.model;
  }
  if (options.threads) {
    config.workers.max = options.threads;
  }
  if (options.workspace) {
    config.workspace = options.workspace;
  }

  console.log(`${colors.dim}Model: ${config.llm.model}${colors.reset}`);
  console.log(`${colors.dim}Workers: ${config.workers.max}${colors.reset}`);
  console.log(`${colors.dim}Workspace: ${config.workspace}${colors.reset}`);
  console.log();

  // Initialize worker pool
  const pool = new WorkerPool(config.workers.max);
  await pool.start();

  console.log(`${colors.green}[Ready]${colors.reset} Type your task or ${colors.yellow}/help${colors.reset} for commands\n`);

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${colors.magenta}octogent>${colors.reset} `,
  });

  let multilineBuffer = '';
  let currentAgent: AgentLoop | null = null;
  let isProcessing = false;

  const handleInput = async (line: string): Promise<void> => {
    // Handle multiline input
    if (line.endsWith('\\')) {
      multilineBuffer += line.slice(0, -1) + '\n';
      process.stdout.write(`${colors.dim}...${colors.reset} `);
      return;
    }

    const input = (multilineBuffer + line).trim();
    multilineBuffer = '';

    if (!input) {
      rl.prompt();
      return;
    }

    // Handle commands
    if (input.startsWith('/')) {
      await handleCommand(input.slice(1), config, pool);
      rl.prompt();
      return;
    }

    // Process task
    if (isProcessing) {
      console.log(`${colors.yellow}[Busy]${colors.reset} Please wait for the current task to complete`);
      rl.prompt();
      return;
    }

    isProcessing = true;
    console.log(`${colors.dim}[Processing...]${colors.reset}\n`);

    try {
      // Create agent loop
      currentAgent = new AgentLoop({
        goal: input,
        sessionId: `cli-${Date.now()}`,
        workspace: config.workspace,
        onMessage: (message) => {
          if (message.role === 'assistant') {
            process.stdout.write(`${colors.cyan}${message.content}${colors.reset}`);
          } else if (message.role === 'tool') {
            console.log(`\n${colors.yellow}[Tool: ${message.tool_name}]${colors.reset}`);
            if (message.content) {
              const preview = message.content.length > 500 
                ? message.content.slice(0, 500) + '...'
                : message.content;
              console.log(`${colors.dim}${preview}${colors.reset}`);
            }
          }
        },
        onComplete: (result) => {
          console.log(`\n\n${colors.green}[Completed]${colors.reset}`);
          if (result) {
            console.log(result);
          }
          isProcessing = false;
          currentAgent = null;
          console.log();
          rl.prompt();
        },
        onError: (error) => {
          console.log(`\n${colors.red}[Error]${colors.reset} ${error}`);
          isProcessing = false;
          currentAgent = null;
          rl.prompt();
        },
      });

      await currentAgent.run();
    } catch (error) {
      console.log(`\n${colors.red}[Error]${colors.reset} ${error instanceof Error ? error.message : error}`);
      isProcessing = false;
      currentAgent = null;
      rl.prompt();
    }
  };

  const handleCommand = async (
    command: string,
    config: ReturnType<typeof getConfig>,
    pool: WorkerPool
  ): Promise<void> => {
    const [cmd, ...args] = command.split(' ');

    switch (cmd.toLowerCase()) {
      case 'help':
        printHelp();
        break;

      case 'status':
        const stats = pool.getStats();
        console.log(`
${colors.cyan}Worker Pool Status:${colors.reset}
  Total: ${stats.total}
  Idle: ${colors.green}${stats.idle}${colors.reset}
  Busy: ${colors.yellow}${stats.busy}${colors.reset}
  Tasks Processed: ${stats.tasksProcessed}
        `);
        break;

      case 'workers':
        const workers = pool.getWorkers();
        console.log(`\n${colors.cyan}Workers:${colors.reset}`);
        workers.forEach((w, i) => {
          const status = w.status === 'idle' 
            ? `${colors.green}idle${colors.reset}`
            : `${colors.yellow}busy${colors.reset}`;
          console.log(`  ${i + 1}. Worker ${w.id}: ${status}`);
        });
        console.log();
        break;

      case 'config':
        console.log(`\n${colors.cyan}Current Configuration:${colors.reset}`);
        console.log(`  Model: ${config.llm.model}`);
        console.log(`  Provider: ${config.llm.provider}`);
        console.log(`  Max Workers: ${config.workers.max}`);
        console.log(`  Workspace: ${config.workspace}`);
        console.log(`  Skills Directory: ${config.skills.directory}`);
        console.log();
        break;

      case 'model':
        if (args[0]) {
          config.llm.model = args[0];
          console.log(`${colors.green}[Updated]${colors.reset} Model set to: ${args[0]}`);
        } else {
          console.log(`${colors.yellow}Usage:${colors.reset} /model <model-name>`);
          console.log(`${colors.dim}Example: /model llama3.2:70b${colors.reset}`);
        }
        break;

      case 'clear':
        console.clear();
        printBanner();
        break;

      case 'exit':
      case 'quit':
        console.log(`\n${colors.cyan}Goodbye!${colors.reset}\n`);
        await pool.shutdown();
        process.exit(0);
        break;

      default:
        console.log(`${colors.red}Unknown command:${colors.reset} ${cmd}`);
        console.log(`Type ${colors.yellow}/help${colors.reset} for available commands`);
    }
  };

  // Handle input
  rl.on('line', handleInput);

  // Handle Ctrl+C gracefully
  rl.on('SIGINT', async () => {
    if (isProcessing && currentAgent) {
      console.log(`\n${colors.yellow}[Cancelled]${colors.reset} Stopping current task...`);
      currentAgent.cancel();
      isProcessing = false;
      currentAgent = null;
      rl.prompt();
    } else {
      console.log(`\n${colors.cyan}Goodbye!${colors.reset}\n`);
      await pool.shutdown();
      process.exit(0);
    }
  });

  rl.prompt();
}

// Parse CLI arguments
const args = process.argv.slice(2);
const options: CLIOptions = {};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--model':
    case '-m':
      options.model = args[++i];
      break;
    case '--threads':
    case '-t':
      options.threads = parseInt(args[++i], 10);
      break;
    case '--workspace':
    case '-w':
      options.workspace = args[++i];
      break;
    case '--verbose':
    case '-v':
      options.verbose = true;
      break;
    case '--help':
    case '-h':
      printBanner();
      console.log(`
Usage: octogent [options]

Options:
  -m, --model <name>      LLM model to use (default: llama3.2:8b)
  -t, --threads <n>       Number of worker threads (default: 8)
  -w, --workspace <path>  Working directory for file operations
  -v, --verbose           Enable verbose logging
  -h, --help              Show this help message

Examples:
  octogent
  octogent --model codellama:13b
  octogent -t 4 -w ~/projects/myapp
      `);
      process.exit(0);
      break;
    case '--version':
      console.log(`Octogent v${VERSION}`);
      process.exit(0);
      break;
  }
}

// Run
main(options).catch((error) => {
  console.error(`${colors.red}[Fatal Error]${colors.reset}`, error);
  process.exit(1);
});
