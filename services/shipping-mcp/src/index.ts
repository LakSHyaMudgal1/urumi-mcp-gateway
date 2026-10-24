import { loadShippingConfig } from './config.js';
import { createShippingApp } from './server.js';

async function main() {
  const config = loadShippingConfig();
  const { app } = await createShippingApp(config);

  const server = app.listen(config.PORT, () => {
    console.log(`[Shipping MCP] Service listening on http://0.0.0.0:${config.PORT}`);
    console.log(`[Shipping MCP] Streamable HTTP endpoint: http://0.0.0.0:${config.PORT}/mcp`);
    console.log(`[Shipping MCP] Health check available at http://0.0.0.0:${config.PORT}/health`);
  });

  const shutdown = () => {
    console.log('[Shipping MCP] Gracefully shutting down...');
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(err => {
  console.error('[Shipping MCP] Startup error:', err);
  process.exit(1);
});
