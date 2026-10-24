import { loadInventoryConfig } from './config.js';
import { createInventoryApp } from './server.js';

async function main() {
  const config = loadInventoryConfig();
  const { app } = await createInventoryApp(config);

  const server = app.listen(config.PORT, () => {
    console.log(`[Inventory MCP] Service listening on http://0.0.0.0:${config.PORT}`);
    console.log(`[Inventory MCP] Streamable HTTP endpoint: http://0.0.0.0:${config.PORT}/mcp`);
    console.log(`[Inventory MCP] Health check available at http://0.0.0.0:${config.PORT}/health`);
  });

  const shutdown = () => {
    console.log('[Inventory MCP] Gracefully shutting down...');
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(err => {
  console.error('[Inventory MCP] Startup error:', err);
  process.exit(1);
});
