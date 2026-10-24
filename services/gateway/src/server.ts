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
  DEFAULT_SSRF_CONFIG,
  CreateUpstreamServerSchema,
  UpdateUpstreamServerSchema,
  CreateAPIKeySchema,
  CreateUserSchema,
  UpdateUserSchema,
  LoginSchema,
  AuditFilterSchema,
  ChatMessageInputSchema,
  verifyPassword,
  signJWT,
  createRateLimiter
} from '@urumi/shared';
import { createAuthMiddleware, AuthenticatedRequest } from './middleware/auth.js';
import { ChatOrchestrator } from './chat/orchestrator.js';
import { LLMProvider } from './chat/types.js';

export interface GatewayServices {
  db: DatabaseAdapter;
  config: GatewayConfig;
  userRepo: UserRepository;
  apiKeyRepo: APIKeyRepository;
  upstreamRepo: UpstreamRepository;
  auditRepo: AuditRepository;
  upstreamManager: UpstreamManager;
  gatewayMcpServer: GatewayMcpServer;
  chatOrchestrator: ChatOrchestrator;
}

export function createApp(
  db: DatabaseAdapter,
  config: GatewayConfig,
  customChatProvider?: LLMProvider
): Express {
  const app = express();

  const userRepo = new UserRepository(db);
  const apiKeyRepo = new APIKeyRepository(db);
  const upstreamRepo = new UpstreamRepository(db);
  const auditRepo = new AuditRepository(db);

  const upstreamManager = new UpstreamManager(upstreamRepo, auditRepo);
  const gatewayMcpServer = new GatewayMcpServer(upstreamManager, apiKeyRepo);
  const chatOrchestrator = new ChatOrchestrator(upstreamManager, config, customChatProvider);

  const authMiddleware = createAuthMiddleware({
    userRepo,
    apiKeyRepo,
    jwtSecret: config.JWT_SECRET
  });

  const authRateLimiter = createRateLimiter({
    windowMs: 60000,
    max: 20,
    message: 'Too many authentication attempts. Please try again in a minute.'
  });

  const apiKeyRateLimiter = createRateLimiter({
    windowMs: 60000,
    max: 30,
    message: 'Rate limit exceeded for API key management.'
  });

  const ssrfPolicyConfig = config.NODE_ENV === 'production'
    ? DEFAULT_SSRF_CONFIG
    : {
        ...DEFAULT_SSRF_CONFIG,
        allowedClusterHostnames: [
          ...(DEFAULT_SSRF_CONFIG.allowedClusterHostnames || []),
          '127.0.0.1',
          'localhost'
        ]
      };

  app.use(cors());
  app.use(express.json());

  // Attach services to locals
  app.locals.services = {
    db,
    config,
    userRepo,
    apiKeyRepo,
    upstreamRepo,
    auditRepo,
    upstreamManager,
    gatewayMcpServer,
    chatOrchestrator
  };

  // Resolve user identity on all requests if Authorization header is present
  app.use(authMiddleware.authenticate);

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
  // 3. Authentication & User Profile Routes
  // ==========================================
  app.post('/api/auth/login', authRateLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          issues: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        });
      }

      const userWithPass = await userRepo.findByEmail(parsed.data.email);
      if (!userWithPass) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const isValid = verifyPassword(parsed.data.password, userWithPass.passwordHash, userWithPass.passwordSalt);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      if (userWithPass.status === 'disabled') {
        return res.status(403).json({ error: 'Account has been disabled by an administrator' });
      }

      const token = signJWT(
        {
          userId: userWithPass.id,
          email: userWithPass.email,
          name: userWithPass.name,
          role: userWithPass.role,
          status: userWithPass.status
        },
        config.JWT_SECRET
      );

      res.status(200).json({
        token,
        user: {
          id: userWithPass.id,
          email: userWithPass.email,
          name: userWithPass.name,
          role: userWithPass.role,
          status: userWithPass.status,
          createdAt: userWithPass.createdAt
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/auth/me', authMiddleware.requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.status(200).json(req.user);
  });

  // ==========================================
  // 4. Team Member Management (Admin only)
  // ==========================================
  app.get('/api/users', authMiddleware.requireRole('admin'), async (_req: Request, res: Response) => {
    try {
      const users = await userRepo.listAll();
      res.status(200).json(users);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/users', authMiddleware.requireRole('admin'), authRateLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = CreateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          issues: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        });
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

  app.put('/api/users/:id', authMiddleware.requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const parsed = UpdateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          issues: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        });
      }

      const updated = await userRepo.update(req.params.id, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.status(200).json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/users/:id', authMiddleware.requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user?.id === req.params.id) {
        return res.status(400).json({ error: 'Administrators cannot delete their own account' });
      }

      await userRepo.delete(req.params.id);
      res.status(200).json({ success: true, message: 'User access revoked and account deleted' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 5. API Key Management (Role-based)
  // ==========================================
  app.get('/api/keys', authMiddleware.requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user?.role === 'admin') {
        const keys = await apiKeyRepo.listAll();
        return res.status(200).json(keys);
      } else {
        // Members only view their own keys
        const keys = await apiKeyRepo.listByUserId(req.user!.id);
        return res.status(200).json(keys);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/keys', authMiddleware.requireAuth, apiKeyRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = CreateAPIKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          issues: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        });
      }

      let targetUserId = req.user!.id;
      // Admin can specify a different user id if desired
      if (req.user?.role === 'admin' && parsed.data.userId) {
        targetUserId = parsed.data.userId;
      }

      const targetUser = await userRepo.findById(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ error: 'Target user for API key not found' });
      }

      if (targetUser.status === 'disabled') {
        return res.status(400).json({ error: 'Cannot issue API key for a disabled user' });
      }

      const key = await apiKeyRepo.create(targetUserId, parsed.data.name, config.JWT_SECRET);
      res.status(201).json(key);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/keys/:id', authMiddleware.requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // If member: can only revoke their own key
      const userIdParam = req.user?.role === 'admin' ? undefined : req.user!.id;
      const revoked = await apiKeyRepo.revoke(req.params.id, userIdParam);

      if (!revoked) {
        return res.status(404).json({ error: 'Key not found or not owned by user' });
      }

      res.status(200).json({ success: true, message: 'API key revoked immediately' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 6. Upstream Servers Management (Admin only for mutations)
  // ==========================================
  app.get('/api/upstreams', authMiddleware.requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const upstreams = await upstreamRepo.listAll();
      const sanitized = upstreams.map(u => upstreamRepo.sanitize(u));

      if (req.user?.role === 'admin') {
        return res.status(200).json(sanitized);
      } else {
        // Members see only enabled upstreams
        return res.status(200).json(sanitized.filter(u => u.enabled));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/upstreams', authMiddleware.requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const parsed = CreateUpstreamServerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          issues: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        });
      }

      // Strict SSRF Validation
      const ssrfCheck = validateUpstreamUrl(parsed.data.url, ssrfPolicyConfig);
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
      res.status(201).json(upstreamRepo.sanitize(created));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/upstreams/:id', authMiddleware.requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const parsed = UpdateUpstreamServerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          issues: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        });
      }

      if (parsed.data.url) {
        const ssrfCheck = validateUpstreamUrl(parsed.data.url, ssrfPolicyConfig);
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
      res.status(200).json(upstreamRepo.sanitize(updated));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/upstreams/:id', authMiddleware.requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const deleted = await upstreamRepo.delete(req.params.id);
      upstreamManager.invalidateCache();
      res.status(200).json({ success: deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 7. Audit Logs (Admin only, paginated & filtered)
  // ==========================================
  app.get('/api/audit-logs', authMiddleware.requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const parsed = AuditFilterSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid filter parameters',
          issues: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        });
      }

      const result = await auditRepo.listFiltered(parsed.data);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 8. Tool Catalog & Refresh
  // ==========================================
  app.get('/api/tools', authMiddleware.requireAuth, async (_req: Request, res: Response) => {
    try {
      const tools = await upstreamManager.getAggregatedTools(false);
      res.status(200).json({ count: tools.length, tools });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/tools/refresh', authMiddleware.requireRole('admin'), async (_req: Request, res: Response) => {
    try {
      upstreamManager.invalidateCache();
      const tools = await upstreamManager.getAggregatedTools(true);
      res.status(200).json({ message: 'Tools refreshed', count: tools.length, tools });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 9. Chat Agent Orchestration (User-attributed)
  // ==========================================
  app.post('/api/chat', authMiddleware.requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = ChatMessageInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          issues: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        });
      }

      const user = req.user!;
      const { message, history } = parsed.data;

      // Execute multi-step tool-calling turn strictly attributed to authenticated user
      const result = await chatOrchestrator.runChatTurn(user, message, history);
      res.status(200).json(result);
    } catch (err: any) {
      console.error('[Chat Agent] Orchestration error:', err);
      res.status(500).json({
        error: err.message || 'Chat agent orchestration failed',
        details: err.status ? `Provider status: ${err.status}` : undefined
      });
    }
  });

  return app;
}
