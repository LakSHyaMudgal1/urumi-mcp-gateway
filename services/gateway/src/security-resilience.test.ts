import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { SqliteAdapter } from './db/adapter.js';
import { runMigrations } from './db/migrations.js';
import {
  UserRepository,
  APIKeyRepository,
  UpstreamRepository,
  AuditRepository
} from './db/repositories.js';
import { createApp } from './server.js';
import { loadConfig } from './config.js';
import {
  isToolPermittedForRole,
  redactSensitiveString,
  sanitizeAuditData,
  validateUpstreamUrl
} from '@urumi/shared';

function requestHelper(
  server: http.Server,
  method: string,
  path: string,
  payload?: object,
  authHeader?: string
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as any;
    const dataStr = payload ? JSON.stringify(payload) : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    if (payload) {
      headers['Content-Length'] = String(Buffer.byteLength(dataStr));
    }
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers
      },
      res => {
        let raw = '';
        res.on('data', chunk => (raw += chunk));
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode || 500, body: parsed, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (dataStr) req.write(dataStr);
    req.end();
  });
}

test('Security & Resilience: isToolPermittedForRole rules', () => {
  // Admin permissions
  assert.strictEqual(isToolPermittedForRole('create_product', 'admin'), true);
  assert.strictEqual(isToolPermittedForRole('woocommerce__create_product', 'admin'), true);
  assert.strictEqual(isToolPermittedForRole('woocommerce__update_order_status', 'admin'), true);
  assert.strictEqual(isToolPermittedForRole('delete_product', 'admin'), true);
  assert.strictEqual(isToolPermittedForRole('inventory__get_stock', 'admin'), true);
  assert.strictEqual(isToolPermittedForRole('shipping__estimate_shipping', 'admin'), true);

  // Member permissions
  assert.strictEqual(isToolPermittedForRole('list_products', 'member'), true);
  assert.strictEqual(isToolPermittedForRole('woocommerce__list_products', 'member'), true);
  assert.strictEqual(isToolPermittedForRole('woocommerce__list_orders', 'member'), true);
  assert.strictEqual(isToolPermittedForRole('get_order', 'member'), true);
  assert.strictEqual(isToolPermittedForRole('inventory__get_stock', 'member'), true);
  assert.strictEqual(isToolPermittedForRole('shipping__estimate_shipping', 'member'), true);

  // Member restrictions (mutations strictly forbidden)
  assert.strictEqual(isToolPermittedForRole('create_product', 'member'), false);
  assert.strictEqual(isToolPermittedForRole('woocommerce__create_product', 'member'), false);
  assert.strictEqual(isToolPermittedForRole('update_order_status', 'member'), false);
  assert.strictEqual(isToolPermittedForRole('woocommerce__update_order_status', 'member'), false);
  assert.strictEqual(isToolPermittedForRole('delete_order', 'member'), false);
  assert.strictEqual(isToolPermittedForRole('remove_item', 'member'), false);
});

test('Security & Resilience: redactSensitiveString scrubs tokens, keys, and credentials', () => {
  const sensitiveText =
    'Error occurred with Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxMjMifQ.abc and key mcp_live_a1b2c3d4_0123456789abcdef0123456789abcdef0123456789abcdef and ck_12345678901234567890123456789012 and cs_98765432109876543210987654321098 at http://admin:superSecret@internal.cluster/v1';

  const cleaned = redactSensitiveString(sensitiveText);

  assert.strictEqual(cleaned.includes('eyJhbGci'), false);
  assert.strictEqual(cleaned.includes('0123456789abcdef0123456789abcdef'), false);
  assert.strictEqual(cleaned.includes('ck_1234567890'), false);
  assert.strictEqual(cleaned.includes('cs_9876543210'), false);
  assert.strictEqual(cleaned.includes('superSecret'), false);
  assert.ok(cleaned.includes('[REDACTED]'));
  assert.ok(cleaned.includes('[REDACTED_PASS]'));
});

test('Security & Resilience: SSRF URL validation and Kubernetes cluster domain handling', () => {
  // Disallowed dangerous metadata & link-local targets
  assert.strictEqual(validateUpstreamUrl('http://169.254.169.254/latest/meta-data/').valid, false);
  assert.strictEqual(validateUpstreamUrl('http://169.254.169.254:80/').valid, false);
  assert.strictEqual(validateUpstreamUrl('http://metadata.google.internal/').valid, false);
  assert.strictEqual(validateUpstreamUrl('http://metadata.goog/').valid, false);
  assert.strictEqual(validateUpstreamUrl('ftp://woocommerce-mcp:4001/mcp').valid, false);
  assert.strictEqual(validateUpstreamUrl('http://user:password@woocommerce-mcp:4001/mcp').valid, false);

  // Allowed in-cluster Kubernetes services
  assert.strictEqual(validateUpstreamUrl('http://woocommerce-mcp:4001/mcp').valid, true);
  assert.strictEqual(validateUpstreamUrl('http://inventory-mcp:4002/mcp').valid, true);
  assert.strictEqual(validateUpstreamUrl('http://shipping-mcp:4003/mcp').valid, true);
  assert.strictEqual(validateUpstreamUrl('http://woocommerce-mcp.default.svc.cluster.local:4001/mcp').valid, true);
});

test('Security & Resilience: API key constant-time verification', async () => {
  const db = new SqliteAdapter(':memory:');
  await runMigrations(db);
  const userRepo = new UserRepository(db);
  const apiKeyRepo = new APIKeyRepository(db);

  const user = await userRepo.create({
    email: 'alice@example.com',
    name: 'Alice Member',
    password: 'Password123!',
    role: 'member'
  });

  const created = await apiKeyRepo.create(user.id, 'My Key', 'test-secret');
  assert.ok(created.rawKey);

  // Valid key resolution
  const validated = await apiKeyRepo.validateKey(created.rawKey!, 'test-secret');
  assert.ok(validated);
  assert.strictEqual(validated?.user.email, 'alice@example.com');

  // Tampered key rejection
  const tamperedKey = created.rawKey!.slice(0, -4) + 'zzzz';
  const invalid = await apiKeyRepo.validateKey(tamperedKey, 'test-secret');
  assert.strictEqual(invalid, null);

  // Revocation rejection
  await apiKeyRepo.revoke(created.id);
  const afterRevoke = await apiKeyRepo.validateKey(created.rawKey!, 'test-secret');
  assert.strictEqual(afterRevoke, null);

  await db.close();
});

test('Security & Resilience: Disabled user rejection on API key validation', async () => {
  const db = new SqliteAdapter(':memory:');
  await runMigrations(db);
  const userRepo = new UserRepository(db);
  const apiKeyRepo = new APIKeyRepository(db);

  const user = await userRepo.create({
    email: 'bob@example.com',
    name: 'Bob Member',
    password: 'Password123!',
    role: 'member'
  });

  const key = await apiKeyRepo.create(user.id, 'Bob Key', 'test-secret');

  // Active user key validates successfully
  const valid = await apiKeyRepo.validateKey(key.rawKey!, 'test-secret');
  assert.ok(valid);

  // Disable user account
  await userRepo.update(user.id, { status: 'disabled' });

  // Key is rejected immediately for disabled user
  const rejected = await apiKeyRepo.validateKey(key.rawKey!, 'test-secret');
  assert.strictEqual(rejected, null);

  await db.close();
});

test('Security & Resilience: Member tool list hiding restricted tools in /api/tools and execution rejection', async () => {
  const db = new SqliteAdapter(':memory:');
  await runMigrations(db);

  const config = loadConfig({
    PORT: '0',
    NODE_ENV: 'test',
    DATABASE_URL: ':memory:',
    JWT_SECRET: 'super-secret-jwt-key-for-test-32-chars-long',
    INITIAL_ADMIN_EMAIL: 'admin@urumi.local',
    INITIAL_ADMIN_PASSWORD: 'AdminPassword123!'
  });

  const app = createApp(db, config);
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

  // Seed Initial Admin
  const userRepo = app.locals.services.userRepo;
  await userRepo.create({
    email: 'admin@urumi.local',
    name: 'Admin User',
    password: 'AdminPassword123!',
    role: 'admin'
  });

  // 1. Login as Admin
  const adminLogin = await requestHelper(server, 'POST', '/api/auth/login', {
    email: 'admin@urumi.local',
    password: 'AdminPassword123!'
  });
  const adminToken = adminLogin.body.token;

  // 2. Create Member user
  const memberCreate = await requestHelper(
    server,
    'POST',
    '/api/users',
    {
      email: 'member@urumi.local',
      name: 'Test Member',
      password: 'MemberPassword123!',
      role: 'member'
    },
    `Bearer ${adminToken}`
  );
  assert.strictEqual(memberCreate.status, 201);

  // 3. Login as Member
  const memberLogin = await requestHelper(server, 'POST', '/api/auth/login', {
    email: 'member@urumi.local',
    password: 'MemberPassword123!'
  });
  const memberToken = memberLogin.body.token;

  // 4. Register mock upstream server with read & write tools
  const mockMcpApp = express();
  mockMcpApp.use(cors());
  mockMcpApp.use(express.json());
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();

  mockMcpApp.all('/mcp', async (req, res) => {
    const sessionId = (req.headers['mcp-session-id'] as string) || (req.query.sessionId as string);
    if (sessionId && sessions.has(sessionId)) {
      await sessions.get(sessionId)!.transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const upstreamServer = new Server({ name: 'mock-woo', version: '1.0.0' }, { capabilities: { tools: { listChanged: true } } });
      upstreamServer.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
          { name: 'list_products', description: 'Lists catalog products', inputSchema: { type: 'object' } },
          { name: 'create_product', description: 'Creates a new product', inputSchema: { type: 'object' } },
          { name: 'update_order_status', description: 'Updates status of order', inputSchema: { type: 'object' } }
        ]
      }));
      upstreamServer.setRequestHandler(CallToolRequestSchema, async () => ({
        content: [{ type: 'text', text: 'Operation executed' }]
      }));

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => 'mock-session-123',
        onsessioninitialized: (sid: string) => {
          sessions.set(sid, { transport, server: upstreamServer });
        }
      });
      await upstreamServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({ error: 'Invalid mock request' });
  });

  const mockUpstreamServer = http.createServer(mockMcpApp);
  await new Promise<void>(resolve => mockUpstreamServer.listen(0, '127.0.0.1', resolve));
  const port = (mockUpstreamServer.address() as any).port;
  const upstreamUrl = `http://127.0.0.1:${port}/mcp`;

  // Admin registers upstream
  const addRes = await requestHelper(
    server,
    'POST',
    '/api/upstreams',
    {
      name: 'WooCommerce Store',
      slug: 'woocommerce',
      url: upstreamUrl,
      timeoutMs: 3000
    },
    `Bearer ${adminToken}`
  );
  assert.strictEqual(addRes.status, 201);

  // Admin /api/tools sees ALL tools
  const adminToolsRes = await requestHelper(server, 'GET', '/api/tools', undefined, `Bearer ${adminToken}`);
  assert.strictEqual(adminToolsRes.status, 200);
  const adminToolNames = adminToolsRes.body.tools.map((t: any) => t.name);
  assert.ok(adminToolNames.includes('woocommerce__list_products'));
  assert.ok(adminToolNames.includes('woocommerce__create_product'));
  assert.ok(adminToolNames.includes('woocommerce__update_order_status'));

  // Member /api/tools: Restricted tools (create_product, update_order_status) are HIDDEN
  const memberToolsRes = await requestHelper(server, 'GET', '/api/tools', undefined, `Bearer ${memberToken}`);
  assert.strictEqual(memberToolsRes.status, 200);
  const memberToolNames = memberToolsRes.body.tools.map((t: any) => t.name);
  assert.ok(memberToolNames.includes('woocommerce__list_products'));
  assert.strictEqual(memberToolNames.includes('woocommerce__create_product'), false);
  assert.strictEqual(memberToolNames.includes('woocommerce__update_order_status'), false);

  // Direct tool execution via upstreamManager: member is rejected
  const upstreamManager = app.locals.services.upstreamManager;
  const memberUser = (await app.locals.services.userRepo.findByEmail('member@urumi.local'))!;

  const directCallResult = await upstreamManager.executeTool(
    memberUser,
    'woocommerce__create_product',
    { name: 'Illegal Widget', price: '19.99' }
  );
  assert.strictEqual(directCallResult.isError, true);
  assert.ok(directCallResult.content[0].text.includes('Forbidden: Tool \'woocommerce__create_product\' is restricted'));

  // Verify audit log recorded the security denial
  const auditRepo = app.locals.services.auditRepo;
  const auditLogs = await auditRepo.listFiltered({ userId: memberUser.id, limit: 10 });
  const forbiddenLog = auditLogs.logs.find((l: any) => l.toolName === 'woocommerce__create_product');
  assert.ok(forbiddenLog);
  assert.strictEqual(forbiddenLog?.status, 'error');
  assert.ok(forbiddenLog?.errorMessage.includes('Forbidden: Tool \'woocommerce__create_product\' is restricted'));

  // Non-idempotent write operation check
  assert.strictEqual(upstreamManager.isIdempotent('create_product'), false);
  assert.strictEqual(upstreamManager.isIdempotent('update_order_status'), false);
  assert.strictEqual(upstreamManager.isIdempotent('list_products'), true);
  assert.strictEqual(upstreamManager.isIdempotent('get_order'), true);

  mockUpstreamServer.close();
  server.close();
  await db.close();
});
