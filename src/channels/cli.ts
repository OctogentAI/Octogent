#!/usr/bin/env node
// ============================================================================
// CLI Channel - Interactive command-line interface for Octogent
// ============================================================================

import * as readline from 'readline';
import WebSocket from 'ws';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://localhost:18789';

interface Message {
  type: string;
  data?: unknown;
  error?: string;
}

class OctogentCLI {
  private ws: WebSocket | null = null;
  private rl: readline.Interface;
  private connected = false;
  private currentTaskId: string | null = null;
  private sessionId: string;

  constructor() {
    this.sessionId = `cli-${Date.now()}`;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    this.connect();
  }

  private connect(): void {
    console.log('\x1b[36m[Octogent]\x1b[0m Connecting to gateway...');

    this.ws = new WebSocket(GATEWAY_URL);

    this.ws.on('open', () => {
      this.connected = true;
      console.log('\x1b[32m[Octogent]\x1b[0m Connected to gateway');
      console.log('\x1b[90mType your task and press Enter. Use /help for commands.\x1b[0m\n');
      this.prompt();
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const msg: Message = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (e) {
        console.error('\x1b[31m[Error]\x1b[0m Failed to parse message');
      }
    });

    this.ws.on('close', () => {
      this.connected = false;
      console.log('\x1b[33m[Octogent]\x1b[0m Disconnected from gateway. Reconnecting...');
      setTimeout(() => this.connect(), 3000);
    });

    this.ws.on('error', (error) => {
      console.error('\x1b[31m[Error]\x1b[0m WebSocket error:', error.message);
    });
  }

  private handleMessage(msg: Message): void {
    switch (msg.type) {
      case 'task_update': {
        const task = msg.data as { id: string; status: string; output?: string; error?: string };
        if (task.id === this.currentTaskId) {
          if (task.status === 'completed') {
            console.log('\n\x1b[32m[Completed]\x1b[0m');
            if (task.output) {
              console.log(task.output);
            }
            this.currentTaskId = null;
            this.prompt();
          } else if (task.status === 'failed') {
            console.log('\n\x1b[31m[Failed]\x1b[0m', task.error || 'Unknown error');
            this.currentTaskId = null;
            this.prompt();
          }
        }
        break;
      }

      case 'message': {
        const message = msg.data as { role: string; content: string; tool_name?: string };
        if (message.role === 'assistant') {
          process.stdout.write('\x1b[36m');
          process.stdout.write(message.content);
          process.stdout.write('\x1b[0m');
        } else if (message.role === 'tool') {
          console.log(`\n\x1b[33m[Tool: ${message.tool_name}]\x1b[0m`);
          console.log(message.content);
        }
        break;
      }

      case 'error':
        console.error('\n\x1b[31m[Error]\x1b[0m', msg.error);
        this.prompt();
        break;

      case 'workers': {
        const workers = msg.data as { id: number; status: string }[];
        const busy = workers.filter(w => w.status === 'busy').length;
        const idle = workers.filter(w => w.status === 'idle').length;
        console.log(`\x1b[90m[Workers] ${idle} idle, ${busy} busy\x1b[0m`);
        break;
      }
    }
  }

  private send(type: string, data?: object): void {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify({ type, ...data }));
    }
  }

  private prompt(): void {
    this.rl.question('\x1b[35moctogent>\x1b[0m ', (input) => {
      this.handleInput(input.trim());
    });
  }

  private handleInput(input: string): void {
    if (!input) {
      this.prompt();
      return;
    }

    // Handle commands
    if (input.startsWith('/')) {
      this.handleCommand(input);
      return;
    }

    // Submit task
    this.currentTaskId = `task-${Date.now()}`;
    console.log('\x1b[90m[Processing...]\x1b[0m\n');
    this.send('submit_task', {
      task: input,
      sessionId: this.sessionId,
      taskId: this.currentTaskId
    });
  }

  private handleCommand(command: string): void {
    const [cmd, ...args] = command.slice(1).split(' ');

    switch (cmd.toLowerCase()) {
      case 'help':
        console.log(`
\x1b[36mOctogent CLI Commands:\x1b[0m
  /help              Show this help message
  /status            Show worker pool status
  /cancel            Cancel current task
  /session [name]    Create new session
  /clear             Clear screen
  /quit, /exit       Exit CLI
        `);
        break;

      case 'status':
        this.send('get_state');
        break;

      case 'cancel':
        if (this.currentTaskId) {
          this.send('cancel_task', { taskId: this.currentTaskId });
          console.log('\x1b[33m[Cancelled]\x1b[0m Task cancelled');
          this.currentTaskId = null;
        } else {
          console.log('\x1b[90mNo active task to cancel\x1b[0m');
        }
        break;

      case 'session':
        this.sessionId = args[0] || `cli-${Date.now()}`;
        console.log(`\x1b[32m[Session]\x1b[0m Switched to session: ${this.sessionId}`);
        break;

      case 'clear':
        console.clear();
        break;

      case 'quit':
      case 'exit':
        console.log('\x1b[36m[Octogent]\x1b[0m Goodbye!');
        this.ws?.close();
        this.rl.close();
        process.exit(0);
        break;

      default:
        console.log(`\x1b[31mUnknown command: ${cmd}\x1b[0m`);
        console.log('Type /help for available commands');
    }

    this.prompt();
  }
}

// Main entry point
console.log(`
\x1b[36m╔═══════════════════════════════════════╗
║                                       ║
║        \x1b[1mOCTOGENT\x1b[0m\x1b[36m - AI Agent CLI        ║
║                                       ║
╚═══════════════════════════════════════╝\x1b[0m
`);

new OctogentCLI();
