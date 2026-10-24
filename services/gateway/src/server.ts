import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { DatabaseAdapter } from './db/adapter.js';
import { UpstreamRepository } from './db/repositories.js';
import { GatewayConfig } from './config.js';

export function createApp(db: DatabaseAdapter, config: GatewayConfig): Express {
  const app = express();
  const upstreamRepo = new UpstreamRepository(db);

  app.use(cors());
  app.use(express.json());

  // 1. Kubernetes Liveness Probe: Process is alive
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'urumi-gateway' });
  });

  // 2. Kubernetes Readiness Probe: Checks critical dependencies (Database)
  // Per requirements: Do not mark a service healthy if its critical dependency is unavailable.
  app.get('/readyz', async (_req: Request, res: Response) => {
    try {
      const dbHealthy = await db.healthCheck();
      if (!dbHealthy) {
        return res.status(503).json({
          status: 'not_ready',
          service: 'urumi-gateway',
          dependency: 'database',
          error: 'Database health check failed'
        });
      }
      return res.status(200).json({
        status: 'ready',
        service: 'urumi-gateway',
        database: 'connected'
      });
    } catch (err: any) {
      return res.status(503).json({
        status: 'not_ready',
        service: 'urumi-gateway',
        dependency: 'database',
        error: err.message
      });
    }
  });

  // 3. Detailed Health Summary
  app.get('/health', async (_req: Request, res: Response) => {
    let dbHealthy = false;
    let upstreamsTotal = 0;
    let upstreamsEnabled = 0;

    try {
      dbHealthy = await db.healthCheck();
      if (dbHealthy) {
        const upstreams = await upstreamRepo.listAll();
        upstreamsTotal = upstreams.length;
        upstreamsEnabled = upstreams.filter(u => u.enabled).length;
      }
    } catch {
      dbHealthy = false;
    }

    const statusCode = dbHealthy ? 200 : 503;
    res.status(statusCode).json({
      service: 'urumi-gateway',
      status: dbHealthy ? 'healthy' : 'unhealthy',
      uptime: process.uptime(),
      database: dbHealthy ? 'connected' : 'disconnected',
      upstreams: {
        total: upstreamsTotal,
        enabled: upstreamsEnabled
      },
      version: '1.0.0'
    });
  });

  return app;
}
