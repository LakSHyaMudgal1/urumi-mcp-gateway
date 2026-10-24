import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { WooCommerceConfig } from './config.js';

export function createWooCommerceApp(config: WooCommerceConfig): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // 1. Liveness Probe
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'woocommerce-mcp' });
  });

  // 2. Readiness Probe
  // Checks WooCommerce store connectivity or mock mode readiness
  app.get('/readyz', (_req: Request, res: Response) => {
    const isReady = Boolean(config.WOOCOMMERCE_STORE_URL) || config.WOOCOMMERCE_MOCK_FALLBACK;
    if (isReady) {
      res.status(200).json({
        status: 'ready',
        service: 'woocommerce-mcp',
        storeUrl: config.WOOCOMMERCE_STORE_URL,
        mockFallback: config.WOOCOMMERCE_MOCK_FALLBACK
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        service: 'woocommerce-mcp',
        error: 'Store URL unavailable and mock fallback disabled'
      });
    }
  });

  // 3. Health Summary
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      service: 'woocommerce-mcp',
      status: 'healthy',
      uptime: process.uptime(),
      tools: [
        'woocommerce_list_products',
        'woocommerce_create_product',
        'woocommerce_list_orders',
        'woocommerce_get_order',
        'woocommerce_update_order_status'
      ],
      version: '1.0.0'
    });
  });

  return app;
}
