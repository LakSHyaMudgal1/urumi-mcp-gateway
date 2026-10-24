import { loadWooCommerceConfig } from './config.js';
import { createWooCommerceApp } from './server.js';

async function main() {
  const config = loadWooCommerceConfig();
  const { app } = await createWooCommerceApp(config);

  const server = app.listen(config.PORT, () => {
    console.log(`[WooCommerce MCP] Service listening on http://0.0.0.0:${config.PORT}`);
    console.log(`[WooCommerce MCP] MCP Endpoint: http://0.0.0.0:${config.PORT}/mcp (Streamable HTTP)`);
    console.log(`[WooCommerce MCP] Health Check: http://0.0.0.0:${config.PORT}/health`);
  });

  const shutdown = () => {
    console.log('[WooCommerce MCP] Gracefully shutting down...');
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(err => {
  console.error('[WooCommerce MCP] Fatal startup error:', err);
  process.exit(1);
});
