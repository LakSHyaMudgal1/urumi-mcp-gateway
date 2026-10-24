import { loadInventoryConfig } from './config.js';
import { createInventoryApp } from './server.js';

const config = loadInventoryConfig();
const app = createInventoryApp(config);

const server = app.listen(config.PORT, () => {
  console.log(`[Inventory MCP] Service listening on http://0.0.0.0:${config.PORT}`);
  console.log(`[Inventory MCP] Health check available at http://0.0.0.0:${config.PORT}/health`);
});

const shutdown = () => {
  console.log('[Inventory MCP] Gracefully shutting down...');
  server.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
