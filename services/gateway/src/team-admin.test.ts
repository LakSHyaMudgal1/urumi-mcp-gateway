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
import { hashAPIKey } from '@urumi/shared';

// Helper to send HTTP requests to Express server
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
        host: '127.0.0.1',
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

function createMockUpstreamApp(name: string, stockCount: number) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();

  app.all('/mcp', async (req, res) => {
    const sessionId = (req.headers['mcp-session-id'] as string) || (req.query.sessionId as string);
    if (sessionId && sessions.has(sessionId)) {
      await sessions.get(sessionId)!.transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const server = new Server({ name, version: '1.0.0' }, { capabilities: { tools: { listChanged: true } } });
      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
          {
            name: 'get_stock',
            description: 'Check item stock in inventory',
            inputSchema: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] }
          }
        ]
      }));

      server.setRequestHandler(CallToolRequestSchema, async request => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sku: (request.params.arguments as any)?.sku,
              stock: stockCount,
              server: name
            })
          }
        ]
      }));

      let transport: StreamableHTTPServerTransport;
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (sid: string): void => {
          sessions.set(sid, { transport, server });
        }
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).end();
  });

  return app;
}

test('Phase 6: Team Administration, Role-Based Access, Key Hashing, Revocation, and Audit Attribution', async () => {
  // 1. Setup in-memory DB and repositories
  const db = new SqliteAdapter(':memory:');
  await runMigrations(db);

  const userRepo = new UserRepository(db);
  const apiKeyRepo = new APIKeyRepository(db);
  const upstreamRepo = new UpstreamRepository(db);
  const auditRepo = new AuditRepository(db);

  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'sqlite://:memory:',
    PORT: '4000',
    JWT_SECRET: 'super-secure-team-admin-jwt-secret-key-32-chars!'
  });

  const app = createApp(db, config);
  const server = http.createServer(app);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));

  // Spin up a mock Inventory upstream
  const mockApp = createMockUpstreamApp('mock-inventory', 42);
  const mockServer = http.createServer(mockApp);
  await new Promise<void>(r => mockServer.listen(0, '127.0.0.1', r));
  const mockPort = (mockServer.address() as any).port;

  try {
    // ==========================================
    // 1. Setup Users & Authentication
    // ==========================================
    const adminUser = await userRepo.create({
      name: 'Admin Boss',
      email: 'admin@urumi.local',
      password: 'AdminPassword123!',
      role: 'admin'
    });

    const memberUser = await userRepo.create({
      name: 'Alice Dev',
      email: 'alice@urumi.local',
      password: 'AlicePassword123!',
      role: 'member'
    });

    // Login Admin
    const adminLoginRes = await requestHelper(server, 'POST', '/api/auth/login', {
      email: 'admin@urumi.local',
      password: 'AdminPassword123!'
    });
    assert.strictEqual(adminLoginRes.status, 200);
    const adminToken = adminLoginRes.body.token;
    assert.strictEqual(adminLoginRes.body.user.role, 'admin');

    // Login Member
    const memberLoginRes = await requestHelper(server, 'POST', '/api/auth/login', {
      email: 'alice@urumi.local',
      password: 'AlicePassword123!'
    });
    assert.strictEqual(memberLoginRes.status, 200);
    const memberToken = memberLoginRes.body.token;
    assert.strictEqual(memberLoginRes.body.user.role, 'member');

    // Profile check
    const meRes = await requestHelper(server, 'GET', '/api/auth/me', undefined, `Bearer ${memberToken}`);
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.email, 'alice@urumi.local');

    // ==========================================
    // 2. Server-Side Role Authorization Checks
    // ==========================================

    // 2a. Users listing: Admin OK (200), Member FORBIDDEN (403)
    const adminListUsers = await requestHelper(server, 'GET', '/api/users', undefined, `Bearer ${adminToken}`);
    assert.strictEqual(adminListUsers.status, 200);
    assert.strictEqual(adminListUsers.body.length, 2);

    const memberListUsers = await requestHelper(server, 'GET', '/api/users', undefined, `Bearer ${memberToken}`);
    assert.strictEqual(memberListUsers.status, 403);
    assert.strictEqual(memberListUsers.body.error.includes('admin privilege is required'), true);

    // 2b. User Creation/Invitation: Admin OK (201), Member FORBIDDEN (403)
    const memberCreateUser = await requestHelper(
      server,
      'POST',
      '/api/users',
      { name: 'Bob Hacker', email: 'bob@urumi.local', password: 'BobPassword123!' },
      `Bearer ${memberToken}`
    );
    assert.strictEqual(memberCreateUser.status, 403);

    const adminCreateUser = await requestHelper(
      server,
      'POST',
      '/api/users',
      { name: 'Bob Intern', email: 'bob@urumi.local', password: 'BobPassword123!', role: 'member' },
      `Bearer ${adminToken}`
    );
    assert.strictEqual(adminCreateUser.status, 201);
    const bobId = adminCreateUser.body.id;

    // 2c. Audit Logs: Admin OK (200), Member FORBIDDEN (403)
    const memberAudit = await requestHelper(server, 'GET', '/api/audit-logs', undefined, `Bearer ${memberToken}`);
    assert.strictEqual(memberAudit.status, 403);

    const adminAudit = await requestHelper(server, 'GET', '/api/audit-logs', undefined, `Bearer ${adminToken}`);
    assert.strictEqual(adminAudit.status, 200);

    // ==========================================
    // 3. API Key Lifecycle: Creation, Hashing, Single-Display, and Revocation
    // ==========================================

    // Member creates an API Key
    const keyCreateRes = await requestHelper(
      server,
      'POST',
      '/api/keys',
      { name: "Alice MacBook Key" },
      `Bearer ${memberToken}`
    );
    assert.strictEqual(keyCreateRes.status, 201);
    const rawKey = keyCreateRes.body.rawKey;
    const keyId = keyCreateRes.body.id;
    assert.ok(rawKey);
    assert.strictEqual(rawKey.startsWith('mcp_live_'), true);

    // Verify rawKey is stored as a keyed/secure hash in DB, not plain text
    const expectedHash = hashAPIKey(rawKey, config.JWT_SECRET);
    const dbKey = await db.query<any>('SELECT key_hash FROM api_keys WHERE id = $1', [keyId]);
    assert.strictEqual(dbKey[0].key_hash, expectedHash);

    // List keys for member: rawKey MUST NEVER be returned!
    const memberKeysRes = await requestHelper(server, 'GET', '/api/keys', undefined, `Bearer ${memberToken}`);
    assert.strictEqual(memberKeysRes.status, 200);
    assert.strictEqual(memberKeysRes.body.length, 1);
    assert.strictEqual(memberKeysRes.body[0].id, keyId);
    assert.strictEqual(memberKeysRes.body[0].rawKey, undefined); // Hidden!

    // Member cannot create key for another user (enforces own identity)
    const memberSpoofKey = await requestHelper(
      server,
      'POST',
      '/api/keys',
      { name: 'Spoofed Key', userId: adminUser.id },
      `Bearer ${memberToken}`
    );
    assert.strictEqual(memberSpoofKey.status, 201);
    assert.strictEqual(memberSpoofKey.body.userId, memberUser.id); // Enforced to Alice!

    // Validate API key usage on REST API
    const authWithKeyRes = await requestHelper(server, 'GET', '/api/auth/me', undefined, `Bearer ${rawKey}`);
    assert.strictEqual(authWithKeyRes.status, 200);
    assert.strictEqual(authWithKeyRes.body.id, memberUser.id);

    // Member revokes key
    const revokeRes = await requestHelper(server, 'DELETE', `/api/keys/${keyId}`, undefined, `Bearer ${memberToken}`);
    assert.strictEqual(revokeRes.status, 200);

    // Immediately reject next request using revoked key
    const rejectedKeyRes = await requestHelper(server, 'GET', '/api/auth/me', undefined, `Bearer ${rawKey}`);
    assert.strictEqual(rejectedKeyRes.status, 401);

    // ==========================================
    // 4. Disabled Members: Access Revocation
    // ==========================================

    // Create a new key for Bob
    const bobKeyRes = await requestHelper(
      server,
      'POST',
      '/api/keys',
      { name: 'Bob Key', userId: bobId },
      `Bearer ${adminToken}`
    );
    const bobRawKey = bobKeyRes.body.rawKey;

    // Bob can login initially
    const bobLoginInit = await requestHelper(server, 'POST', '/api/auth/login', {
      email: 'bob@urumi.local',
      password: 'BobPassword123!'
    });
    assert.strictEqual(bobLoginInit.status, 200);
    const bobToken = bobLoginInit.body.token;

    // Admin disables Bob
    const disableBobRes = await requestHelper(
      server,
      'PUT',
      `/api/users/${bobId}`,
      { status: 'disabled' },
      `Bearer ${adminToken}`
    );
    assert.strictEqual(disableBobRes.status, 200);
    assert.strictEqual(disableBobRes.body.status, 'disabled');

    // Bob's subsequent login is blocked
    const bobLoginBlocked = await requestHelper(server, 'POST', '/api/auth/login', {
      email: 'bob@urumi.local',
      password: 'BobPassword123!'
    });
    assert.strictEqual(bobLoginBlocked.status, 403);
    assert.strictEqual(bobLoginBlocked.body.error.includes('disabled'), true);

    // Bob's existing JWT token is rejected
    const bobTokenBlocked = await requestHelper(server, 'GET', '/api/auth/me', undefined, `Bearer ${bobToken}`);
    assert.strictEqual(bobTokenBlocked.status, 403);

    // Bob's API key is rejected
    const bobKeyBlocked = await requestHelper(server, 'GET', '/api/auth/me', undefined, `Bearer ${bobRawKey}`);
    assert.strictEqual(bobKeyBlocked.status, 401);

    // Admin re-enables Bob
    await requestHelper(
      server,
      'PUT',
      `/api/users/${bobId}`,
      { status: 'active' },
      `Bearer ${adminToken}`
    );
    const bobLoginActive = await requestHelper(server, 'POST', '/api/auth/login', {
      email: 'bob@urumi.local',
      password: 'BobPassword123!'
    });
    assert.strictEqual(bobLoginActive.status, 200);

    // ==========================================
    // 5. Upstream Management & Credential Protection
    // ==========================================

    // Member cannot create upstream (403)
    const memberCreateUpstream = await requestHelper(
      server,
      'POST',
      '/api/upstreams',
      { name: 'Fake Server', slug: 'fake', url: `http://127.0.0.1:${mockPort}/mcp` },
      `Bearer ${memberToken}`
    );
    assert.strictEqual(memberCreateUpstream.status, 403);

    // Admin creates upstream with secret credential
    const createUpstreamRes = await requestHelper(
      server,
      'POST',
      '/api/upstreams',
      {
        name: 'Warehouse Mock',
        slug: 'warehouse-mock',
        url: `http://127.0.0.1:${mockPort}/mcp`,
        authToken: 'secret-upstream-token-123',
        timeoutMs: 5000
      },
      `Bearer ${adminToken}`
    );
    assert.strictEqual(createUpstreamRes.status, 201);
    const upstreamId = createUpstreamRes.body.id;
    // Sensitive credential MUST NOT be returned in plain text!
    assert.strictEqual(createUpstreamRes.body.authToken, '********');
    assert.strictEqual(createUpstreamRes.body.hasAuthToken, true);

    // List upstreams: credentials masked for all viewers
    const listUpstreamsAdmin = await requestHelper(server, 'GET', '/api/upstreams', undefined, `Bearer ${adminToken}`);
    assert.strictEqual(listUpstreamsAdmin.body[0].authToken, '********');

    // Admin rotates credential without revealing old value
    const rotateRes = await requestHelper(
      server,
      'PUT',
      `/api/upstreams/${upstreamId}`,
      { authToken: 'new-rotated-secret-token-789' },
      `Bearer ${adminToken}`
    );
    assert.strictEqual(rotateRes.status, 200);
    assert.strictEqual(rotateRes.body.authToken, '********');

    // Check DB has the rotated value
    const dbUpstream = await upstreamRepo.findById(upstreamId);
    assert.strictEqual(dbUpstream!.authToken, 'new-rotated-secret-token-789');

    // ==========================================
    // 6. Chat Agent Execution & Audit Attribution
    // ==========================================

    // Member issues a chat instruction to check stock
    const chatRes = await requestHelper(
      server,
      'POST',
      '/api/chat',
      { message: 'Please get stock for SKU-WIDGET-99' },
      `Bearer ${memberToken}`
    );
    assert.strictEqual(chatRes.status, 200);
    assert.strictEqual(chatRes.body.toolCalls.length, 1);
    assert.strictEqual(chatRes.body.toolCalls[0].toolName.includes('get_stock'), true);
    assert.strictEqual(chatRes.body.reply.includes('Checked stock for SKU-WIDGET-99'), true);

    // Verify audit log has the execution attributed to Alice
    const auditLogsRes = await requestHelper(
      server,
      'GET',
      '/api/audit-logs?userId=' + memberUser.id,
      undefined,
      `Bearer ${adminToken}`
    );
    assert.strictEqual(auditLogsRes.status, 200);
    assert.strictEqual(auditLogsRes.body.total >= 1, true);

    const matchedLog = auditLogsRes.body.logs.find((l: any) => l.toolName === 'get_stock');
    assert.ok(matchedLog);
    assert.strictEqual(matchedLog.userId, memberUser.id);
    assert.strictEqual(matchedLog.userEmail, memberUser.email);
    assert.strictEqual(matchedLog.status, 'success');
    assert.strictEqual(matchedLog.parametersSanitized?.sku, 'SKU-WIDGET-99');

    // ==========================================
    // 7. Audit Log Filtering & Pagination
    // ==========================================

    // Query with filter for status=error (none yet for Alice)
    const errorFilterRes = await requestHelper(
      server,
      'GET',
      '/api/audit-logs?status=error',
      undefined,
      `Bearer ${adminToken}`
    );
    assert.strictEqual(errorFilterRes.status, 200);
    assert.strictEqual(Array.isArray(errorFilterRes.body.logs), true);

    // Pagination test (limit=1, offset=0)
    const pageRes = await requestHelper(
      server,
      'GET',
      '/api/audit-logs?limit=1&offset=0',
      undefined,
      `Bearer ${adminToken}`
    );
    assert.strictEqual(pageRes.status, 200);
    assert.strictEqual(pageRes.body.limit, 1);
    assert.strictEqual(pageRes.body.offset, 0);
    assert.strictEqual(pageRes.body.logs.length, 1);
  } finally {
    await new Promise<void>(r => server.close(() => r()));
    await new Promise<void>(r => mockServer.close(() => r()));
  }
});
