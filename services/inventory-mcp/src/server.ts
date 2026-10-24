import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { InventoryConfig } from './config.js';

export function createInventoryApp(config: InventoryConfig): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // 1. Liveness Probe
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'inventory-mcp' });
  });

  // 2. Readiness Probe
  app.get('/readyz', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ready',
      service: 'inventory-mcp',
      database: 'in-memory-sample-store'
    });
  });

  // 3. Health Summary
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      service: 'inventory-mcp',
      status: 'healthy',
      uptime: process.uptime(),
      tools: [
        'inventory_check_stock',
        'inventory_reserve_stock',
        'inventory_restock',
        'inventory_list_low_stock'
      ],
      version: '1.0.0'
    });
  });

  return app;
}
