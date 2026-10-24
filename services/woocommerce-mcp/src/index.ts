import { loadWooCommerceConfig } from './config.js';
import { createWooCommerceApp } from './server.js';

const config = loadWooCommerceConfig();
const app = createWooCommerceApp(config);

const server = app.listen(config.PORT, () => {
  console.log(`[WooCommerce MCP] Service listening on http://0.0.0.0:${config.PORT}`);
  console.log(`[WooCommerce MCP] Health check available at http://0.0.0.0:${config.PORT}/health`);
});

const shutdown = () => {
  console.log('[WooCommerce MCP] Gracefully shutting down...');
  server.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
