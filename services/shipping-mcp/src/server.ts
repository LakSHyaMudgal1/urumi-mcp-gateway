import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { ShippingConfig } from './config.js';

export function createShippingApp(config: ShippingConfig): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // 1. Liveness Probe
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'shipping-mcp' });
  });

  // 2. Readiness Probe
  app.get('/readyz', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ready',
      service: 'shipping-mcp',
      database: 'in-memory-carrier-store'
    });
  });

  // 3. Health Summary
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      service: 'shipping-mcp',
      status: 'healthy',
      uptime: process.uptime(),
      tools: [
        'shipping_calculate_rates',
        'shipping_create_shipment',
        'shipping_get_tracking'
      ],
      version: '1.0.0'
    });
  });

  return app;
}
