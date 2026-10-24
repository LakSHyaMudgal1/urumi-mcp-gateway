import { loadShippingConfig } from './config.js';
import { createShippingApp } from './server.js';

const config = loadShippingConfig();
const app = createShippingApp(config);

const server = app.listen(config.PORT, () => {
  console.log(`[Shipping MCP] Service listening on http://0.0.0.0:${config.PORT}`);
  console.log(`[Shipping MCP] Health check available at http://0.0.0.0:${config.PORT}/health`);
});

const shutdown = () => {
  console.log('[Shipping MCP] Gracefully shutting down...');
  server.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
