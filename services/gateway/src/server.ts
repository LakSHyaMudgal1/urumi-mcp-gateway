import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { DatabaseAdapter } from './db/adapter.js';
import {
  UserRepository,
  APIKeyRepository,
  UpstreamRepository,
  AuditRepository
} from './db/repositories.js';
import { GatewayConfig } from './config.js';
import { UpstreamManager } from './mcp/upstreamManager.js';
import { GatewayMcpServer } from './mcp/gatewayServer.js';
import {
  validateUpstreamUrl,
  CreateUpstreamServerSchema,
  UpdateUpstreamServerSchema,
  CreateAPIKeySchema,
  CreateUserSchema
} from '@urumi/shared';

export interface GatewayServices {
  db: DatabaseAdapter;
  config: GatewayConfig;
  userRepo: UserRepository;
  apiKeyRepo: APIKeyRepository;
  upstreamRepo: UpstreamRepository;
  auditRepo: AuditRepository;
  upstreamManager: UpstreamManager;
  gatewayMcpServer: GatewayMcpServer;
}

export function createApp(db: DatabaseAdapter, config: GatewayConfig): Express {
  const app = express();

  const userRepo = new UserRepository(db);
  const apiKeyRepo = new APIKeyRepository(db);
  const upstreamRepo = new UpstreamRepository(db);
  const auditRepo = new AuditRepository(db);

  const upstreamManager = new UpstreamManager(upstreamRepo, auditRepo);
  const gatewayMcpServer = new GatewayMcpServer(upstreamManager, apiKeyRepo);

  app.use(cors());
  app.use(express.json());

  // Attach services to request for internal handlers
  app.locals.services = {
    db,
    config,
    userRepo,
    apiKeyRepo,
    upstreamRepo,
    auditRepo,
    upstreamManager,
    gatewayMcpServer
  };

  // ==========================================
  // 1. Unified Client-Facing MCP Endpoint (/mcp)
  // ==========================================
  app.all('/mcp', async (req: Request, res: Response) => {
    await gatewayMcpServer.handleMcpRequest(req, res);
  });

  // ==========================================
  // 2. Health & Lifecycle Probes
  // ==========================================
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'urumi-gateway' });
  });

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
      activeMcpSessions: gatewayMcpServer.getSessionsCount(),
      version: '1.0.0'
    });
  });

  // ==========================================
  // 3. Admin & Dashboard REST APIs
  // ==========================================

  // Aggregated Tools List
  app.get('/api/tools', async (_req: Request, res: Response) => {
    try {
      const tools = await upstreamManager.getAggregatedTools(false);
      res.status(200).json({ count: tools.length, tools });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Force Refresh Tools
  app.post('/api/tools/refresh', async (_req: Request, res: Response) => {
    try {
      upstreamManager.invalidateCache();
      const tools = await upstreamManager.getAggregatedTools(true);
      res.status(200).json({ message: 'Tools refreshed', count: tools.length, tools });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upstream Servers Management
  app.get('/api/upstreams', async (_req: Request, res: Response) => {
    try {
      const upstreams = await upstreamRepo.listAll();
      res.status(200).json(upstreams);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/upstreams', async (req: Request, res: Response) => {
    try {
      const parsed = CreateUpstreamServerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          issues: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        });
      }

      // Strict SSRF Validation
      const ssrfCheck = validateUpstreamUrl(parsed.data.url);
      if (!ssrfCheck.valid) {
        return res.status(400).json({
          error: 'SSRF validation failed: Upstream URL rejected by security policy',
          reason: ssrfCheck.reason
        });
      }

      const existing = await upstreamRepo.findBySlug(parsed.data.slug);
      if (existing) {
        return res.status(409).json({ error: `Upstream with slug '${parsed.data.slug}' already exists` });
      }

      const created = await upstreamRepo.create(parsed.data);
      upstreamManager.invalidateCache();
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/upstreams/:id', async (req: Request, res: Response) => {
    try {
      const parsed = UpdateUpstreamServerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          issues: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        });
      }

      if (parsed.data.url) {
        const ssrfCheck = validateUpstreamUrl(parsed.data.url);
        if (!ssrfCheck.valid) {
          return res.status(400).json({
            error: 'SSRF validation failed: Upstream URL rejected by security policy',
            reason: ssrfCheck.reason
          });
        }
      }

      const updated = await upstreamRepo.update(req.params.id, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: 'Upstream server not found' });
      }

      upstreamManager.invalidateCache();
      res.status(200).json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/upstreams/:id', async (req: Request, res: Response) => {
    try {
      const deleted = await upstreamRepo.delete(req.params.id);
      upstreamManager.invalidateCache();
      res.status(200).json({ success: deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API Key Management
  app.get('/api/keys', async (_req: Request, res: Response) => {
    try {
      const keys = await apiKeyRepo.listAll();
      res.status(200).json(keys);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/keys', async (req: Request, res: Response) => {
    try {
      const parsed = CreateAPIKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
      }

      // Default to first admin or specified user
      const users = await userRepo.listAll();
      const userId = (req.body.userId as string) || (users[0]?.id);
      if (!userId) {
        return res.status(400).json({ error: 'No user available to associate key with' });
      }

      const key = await apiKeyRepo.create(userId, parsed.data.name);
      res.status(201).json(key);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/keys/:id', async (req: Request, res: Response) => {
    try {
      await apiKeyRepo.revoke(req.params.id);
      res.status(200).json({ success: true, message: 'API key revoked' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Audit Logs
  app.get('/api/audit-logs', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
      const logs = await auditRepo.listRecent(limit);
      res.status(200).json({ count: logs.length, logs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // User Management
  app.get('/api/users', async (_req: Request, res: Response) => {
    try {
      const users = await userRepo.listAll();
      res.status(200).json(users);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/users', async (req: Request, res: Response) => {
    try {
      const parsed = CreateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
      }

      const existing = await userRepo.findByEmail(parsed.data.email);
      if (existing) {
        return res.status(409).json({ error: `User with email '${parsed.data.email}' already exists` });
      }

      const user = await userRepo.create(parsed.data);
      res.status(201).json(user);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}
