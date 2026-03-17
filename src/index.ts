// ============================================================================
// Octogent - Autonomous Multi-Agent AI System
// Server Entry Point
// ============================================================================

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { initializeSchema } from './db/schema.js';
import { loadConfig, getConfig } from './config.js';
import { createWorkerPool } from './workers/pool.js';
import { createWebSocketGateway } from './gateway/websocket.js';
import { createRestApi } from './gateway/rest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE = path.join(process.cwd(), 'workspace');

const BANNER = `
\x1b[36m╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██████╗  ██████╗████████╗ ██████╗  ██████╗ ███████╗███╗   ██╗████████╗   ║
║  ██╔═══██╗██╔════╝╚══██╔══╝██╔═══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝   ║
║  ██║   ██║██║        ██║   ██║   ██║██║  ███╗█████╗  ██╔██╗ ██║   ██║      ║
║  ██║   ██║██║        ██║   ██║   ██║██║   ██║██╔══╝  ██║╚██╗██║   ██║      ║
║  ╚██████╔╝╚██████╗   ██║   ╚██████╔╝╚██████╔╝███████╗██║ ╚████║   ██║      ║
║   ╚═════╝  ╚═════╝   ╚═╝    ╚═════╝  ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝      ║
║                                                               ║
║             Autonomous Multi-Agent AI System                  ║
╚═══════════════════════════════════════════════════════════════╝\x1b[0m
`;

/**
 * Initialize and start the Octogent server
 */
export async function startServer(): Promise<void> {
  console.log(BANNER);

  // Load configuration
  console.log('\x1b[90m[server]\x1b[0m Loading configuration...');
  const config = loadConfig();

  // Ensure workspace directory exists
  const workspaceDir = process.env.WORKSPACE_DIR || DEFAULT_WORKSPACE;
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
    console.log(`\x1b[90m[server]\x1b[0m Created workspace: ${workspaceDir}`);
  }

  // Ensure data directory exists
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`\x1b[90m[server]\x1b[0m Created data directory: ${dataDir}`);
  }

  // Initialize database
  console.log('\x1b[90m[server]\x1b[0m Initializing database...');
  initializeSchema();

  // Start worker pool
  console.log(
    `\x1b[90m[server]\x1b[0m Starting worker pool (${config.workers.max_slots} slots)...`
  );
  const pool = await createWorkerPool(workspaceDir);

  // Start WebSocket gateway
  console.log(
    `\x1b[90m[server]\x1b[0m Starting WebSocket gateway on port ${config.gateway.port}...`
  );
  const wsGateway = createWebSocketGateway();
  wsGateway.start(config.gateway.port, config.gateway.host);

  // Start REST API (on port + 1)
  const restPort = config.gateway.port + 1;
  console.log(`\x1b[90m[server]\x1b[0m Starting REST API on port ${restPort}...`);
  const restApi = createRestApi();
  restApi.start(restPort, config.gateway.host);

  // Print server info
  console.log('');
  console.log('\x1b[32m┌────────────────────────────────────────────┐\x1b[0m');
  console.log('\x1b[32m│\x1b[0m  Server Ready                              \x1b[32m│\x1b[0m');
  console.log('\x1b[32m├────────────────────────────────────────────┤\x1b[0m');
  console.log(
    `\x1b[32m│\x1b[0m  WebSocket: \x1b[36mws://${config.gateway.host}:${config.gateway.port}\x1b[0m`
  );
  console.log(`\x1b[32m│\x1b[0m  REST API:  \x1b[36mhttp://${config.gateway.host}:${restPort}\x1b[0m`);
  console.log(`\x1b[32m│\x1b[0m  Workspace: \x1b[33m${workspaceDir}\x1b[0m`);
  console.log(`\x1b[32m│\x1b[0m  Workers:   \x1b[33m${config.workers.max_slots} slots\x1b[0m`);
  console.log(`\x1b[32m│\x1b[0m  Model:     \x1b[33m${config.models.primary}\x1b[0m`);
  console.log('\x1b[32m└────────────────────────────────────────────┘\x1b[0m');
  console.log('');

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n\x1b[33m[server]\x1b[0m Received ${signal}, shutting down...`);

    // Stop accepting new connections
    await restApi.stop();
    await wsGateway.stop();

    // Shutdown workers
    await pool.shutdown();

    console.log('\x1b[32m[server]\x1b[0m Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('\x1b[31m[server]\x1b[0m Uncaught exception:', error);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('\x1b[31m[server]\x1b[0m Unhandled rejection:', reason);
  });
}

// Run if executed directly
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith('index.ts') ||
    process.argv[1].endsWith('index.js') ||
    process.argv[1].includes('octogent'));

if (isMainModule) {
  startServer().catch((error) => {
    console.error('\x1b[31m[server]\x1b[0m Fatal error:', error);
    process.exit(1);
  });
}
