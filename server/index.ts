// ============================================================================
// Server Entry Point - Gateway startup and orchestration
// ============================================================================

import path from 'path';
import fs from 'fs';
import { initializeSchema } from './db/schema';
import { loadConfig, getConfig } from './config';
import { createWorkerPool, getWorkerPool } from './workers/pool';
import { createWebSocketGateway, getWebSocketGateway } from './gateway/websocket';
import { createRestApi, getRestApi } from './gateway/rest';

// Default workspace directory
const DEFAULT_WORKSPACE = path.join(process.cwd(), 'workspace');

/**
 * Initialize and start the gateway server
 */
async function main(): Promise<void> {
  console.log('========================================');
  console.log('  Octogent - Autonomous Multi-Agent AI');
  console.log('  Deployed by Octogent Labs');
  console.log('========================================\n');
  
  // Load configuration
  console.log('[server] Loading configuration...');
  const config = loadConfig();
  
  // Ensure workspace directory exists
  const workspaceDir = process.env.WORKSPACE_DIR || DEFAULT_WORKSPACE;
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
    console.log(`[server] Created workspace directory: ${workspaceDir}`);
  }
  
  // Ensure data directory exists
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`[server] Created data directory: ${dataDir}`);
  }
  
  // Initialize database
  console.log('[server] Initializing database...');
  initializeSchema();
  
  // Start worker pool
  console.log(`[server] Starting worker pool (${config.workers.max_slots} slots)...`);
  const pool = await createWorkerPool(workspaceDir);
  
  // Start WebSocket gateway
  console.log(`[server] Starting WebSocket gateway on port ${config.gateway.port}...`);
  const wsGateway = createWebSocketGateway();
  wsGateway.start(config.gateway.port, config.gateway.host);
  
  // Start REST API (on port + 1)
  const restPort = config.gateway.port + 1;
  console.log(`[server] Starting REST API on port ${restPort}...`);
  const restApi = createRestApi();
  restApi.start(restPort, config.gateway.host);
  
  console.log('\n========================================');
  console.log('  Server Ready!');
  console.log('========================================');
  console.log(`  WebSocket: ws://${config.gateway.host}:${config.gateway.port}`);
  console.log(`  REST API:  http://${config.gateway.host}:${restPort}`);
  console.log(`  Workspace: ${workspaceDir}`);
  console.log(`  Workers:   ${config.workers.max_slots} slots`);
  console.log(`  Primary:   ${config.models.primary}`);
  console.log('========================================\n');
  
  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[server] Received ${signal}, shutting down...`);
    
    // Stop accepting new connections
    await restApi.stop();
    await wsGateway.stop();
    
    // Shutdown workers
    await pool.shutdown();
    
    console.log('[server] Shutdown complete');
    process.exit(0);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('[server] Uncaught exception:', error);
  });
  
  process.on('unhandledRejection', (reason) => {
    console.error('[server] Unhandled rejection:', reason);
  });
}

// Export for programmatic usage
export { main as startServer };

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('[server] Fatal error:', error);
    process.exit(1);
  });
}
