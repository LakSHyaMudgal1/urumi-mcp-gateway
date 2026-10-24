import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { SqliteAdapter } from './db/adapter.js';
import { runMigrations } from './db/migrations.js';
import { UserRepository, UpstreamRepository } from './db/repositories.js';
import { createApp } from './server.js';
import { loadConfig } from './config.js';

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

function createMockUpstreamApp(serverName: string) {
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

    if (req.method === 'POST' && isInitializeRequest(req.body)) {
      const server = new Server(
        { name: serverName, version: '1.0.0' },
        { capabilities: { tools: {} } }
      );

      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
          {
            name: 'lookup_item',
            description: 'Finds an item by SKU',
            inputSchema: {
              type: 'object',
              properties: { sku: { type: 'string' } },
              required: ['sku']
            }
          }
        ]
      }));

      server.setRequestHandler(CallToolRequestSchema, async request => {
        if (request.params.name === 'lookup_item') {
          return {
            content: [{ type: 'text', text: JSON.stringify({ sku: request.params.arguments?.sku, stock: 100 }) }]
          };
        }
        throw new Error(`Tool not found: ${request.params.name}`);
      });

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

test('Upstream Server Management: Real Backend Lifecycle (Create, Edit, Test Connection, Disable/Enable, Delete, Namespacing)', async () => {
  // 1. Setup in-memory DB and repositories
  const db = new SqliteAdapter(':memory:');
  await runMigrations(db);

  const userRepo = new UserRepository(db);
  const upstreamRepo = new UpstreamRepository(db);

  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'sqlite://:memory:',
    PORT: '4000',
    JWT_SECRET: 'super-secure-upstream-test-jwt-secret-key-32-chars!'
  });

  const app = createApp(db, config);
  const gatewayServer = http.createServer(app);
  await new Promise<void>(r => gatewayServer.listen(0, '127.0.0.1', r));

  // 2. Setup mock upstream Streamable HTTP MCP server
  const mockApp = createMockUpstreamApp('mock-warehouse');
  const mockServer = http.createServer(mockApp);
  await new Promise<void>(r => mockServer.listen(0, '127.0.0.1', r));
  const mockPort = (mockServer.address() as any).port;

  // 3. Authenticate Admin User
  const adminUser = await userRepo.create({
    name: 'Admin Boss',
    email: 'admin@urumi.local',
    password: 'AdminPassword123!',
    role: 'admin'
  });

  const loginRes = await requestHelper(gatewayServer, 'POST', '/api/auth/login', {
    email: 'admin@urumi.local',
    password: 'AdminPassword123!'
  });
  const adminToken = loginRes.body.token;

  try {
    // -------------------------------------------------------------
    // A. CREATE UPSTREAM FLOW
    // -------------------------------------------------------------
    // Invalid URL (SSRF rejection for AWS metadata IP)
    const ssrfReject = await requestHelper(
      gatewayServer,
      'POST',
      '/api/upstreams',
      {
        name: 'Malicious Server',
        slug: 'malicious',
        url: 'http://169.254.169.254/latest/meta-data/'
      },
      `Bearer ${adminToken}`
    );
    assert.strictEqual(ssrfReject.status, 400);
    assert.ok(ssrfReject.body.error.includes('SSRF validation failed'));

    // Valid Registration with write-only credentials
    const createRes = await requestHelper(
      gatewayServer,
      'POST',
      '/api/upstreams',
      {
        name: 'Warehouse Operations',
        slug: 'warehouse',
        url: `http://127.0.0.1:${mockPort}/mcp`,
        authToken: 'secret-upstream-token-alpha',
        timeoutMs: 4000
      },
      `Bearer ${adminToken}`
    );
    assert.strictEqual(createRes.status, 201);
    assert.strictEqual(createRes.body.name, 'Warehouse Operations');
    assert.strictEqual(createRes.body.slug, 'warehouse');
    assert.strictEqual(createRes.body.enabled, true);
    // Credentials MUST be write-only: never revealed in plaintext!
    assert.strictEqual(createRes.body.authToken, '********');
    assert.strictEqual(createRes.body.hasAuthToken, true);

    const serverId = createRes.body.id;

    // -------------------------------------------------------------
    // B. TEST CONNECTION FLOW (Active live test & per-row endpoint)
    // -------------------------------------------------------------
    const testRes = await requestHelper(
      gatewayServer,
      'POST',
      `/api/upstreams/${serverId}/test`,
      undefined,
      `Bearer ${adminToken}`
    );
    assert.strictEqual(testRes.status, 200);
    assert.strictEqual(testRes.body.success, true);
    assert.strictEqual(testRes.body.status, 'connected');
    assert.strictEqual(testRes.body.toolCount, 1);
    assert.ok(typeof testRes.body.latencyMs === 'number');

    // Verify tools catalog includes namespacing: warehouse__lookup_item
    const toolsRes = await requestHelper(gatewayServer, 'GET', '/api/tools', undefined, `Bearer ${adminToken}`);
    assert.strictEqual(toolsRes.status, 200);
    const toolNames = toolsRes.body.tools.map((t: any) => t.name);
    assert.ok(toolNames.includes('warehouse__lookup_item'), 'Gateway must expose namespaced tool warehouse__lookup_item');
    assert.ok(toolNames.includes('lookup_item'), 'Gateway must expose clean alias when no collision exists');

    // -------------------------------------------------------------
    // C. EDIT FLOW (Write-Only Secret Handling & Parameter Updates)
    // -------------------------------------------------------------
    // Case 1: Updating name and URL while leaving authToken undefined preserves existing secret
    const editPreserveRes = await requestHelper(
      gatewayServer,
      'PUT',
      `/api/upstreams/${serverId}`,
      { name: 'Warehouse Logistics Center', timeoutMs: 4500 },
      `Bearer ${adminToken}`
    );
    assert.strictEqual(editPreserveRes.status, 200);
    assert.strictEqual(editPreserveRes.body.name, 'Warehouse Logistics Center');
    assert.strictEqual(editPreserveRes.body.timeoutMs, 4500);
    assert.strictEqual(editPreserveRes.body.authToken, '********');
    assert.strictEqual(editPreserveRes.body.hasAuthToken, true);

    const dbAfterPreserve = await upstreamRepo.findById(serverId);
    assert.strictEqual(dbAfterPreserve!.authToken, 'secret-upstream-token-alpha');

    // Case 2: Rotating credential to new token
    const editRotateRes = await requestHelper(
      gatewayServer,
      'PUT',
      `/api/upstreams/${serverId}`,
      { authToken: 'new-rotated-secret-beta' },
      `Bearer ${adminToken}`
    );
    assert.strictEqual(editRotateRes.status, 200);
    assert.strictEqual(editRotateRes.body.authToken, '********');
    assert.strictEqual(editRotateRes.body.hasAuthToken, true);

    const dbAfterRotate = await upstreamRepo.findById(serverId);
    assert.strictEqual(dbAfterRotate!.authToken, 'new-rotated-secret-beta');

    // -------------------------------------------------------------
    // D. DISABLE / ENABLE FLOW
    // -------------------------------------------------------------
    // Disable the server
    const disableRes = await requestHelper(
      gatewayServer,
      'PUT',
      `/api/upstreams/${serverId}`,
      { enabled: false },
      `Bearer ${adminToken}`
    );
    assert.strictEqual(disableRes.status, 200);
    assert.strictEqual(disableRes.body.enabled, false);

    // Testing connection on disabled server is rejected with 400
    const testDisabledRes = await requestHelper(
      gatewayServer,
      'POST',
      `/api/upstreams/${serverId}/test`,
      undefined,
      `Bearer ${adminToken}`
    );
    assert.strictEqual(testDisabledRes.status, 400);
    assert.ok(testDisabledRes.body.error.includes('Cannot test disabled server'));

    // Refresh tools: tools from disabled server must disappear from catalog
    await requestHelper(gatewayServer, 'POST', '/api/tools/refresh', undefined, `Bearer ${adminToken}`);
    const toolsAfterDisable = await requestHelper(gatewayServer, 'GET', '/api/tools', undefined, `Bearer ${adminToken}`);
    const namesAfterDisable = toolsAfterDisable.body.tools.map((t: any) => t.name);
    assert.strictEqual(namesAfterDisable.includes('warehouse__lookup_item'), false, 'Tools from disabled server must be omitted');

    // Re-enable the server
    const enableRes = await requestHelper(
      gatewayServer,
      'PUT',
      `/api/upstreams/${serverId}`,
      { enabled: true },
      `Bearer ${adminToken}`
    );
    assert.strictEqual(enableRes.status, 200);
    assert.strictEqual(enableRes.body.enabled, true);

    // Refresh tools: tools restored
    await requestHelper(gatewayServer, 'POST', '/api/tools/refresh', undefined, `Bearer ${adminToken}`);
    const toolsAfterEnable = await requestHelper(gatewayServer, 'GET', '/api/tools', undefined, `Bearer ${adminToken}`);
    assert.ok(toolsAfterEnable.body.tools.some((t: any) => t.name === 'warehouse__lookup_item'));

    // -------------------------------------------------------------
    // E. DELETE FLOW
    // -------------------------------------------------------------
    const deleteRes = await requestHelper(
      gatewayServer,
      'DELETE',
      `/api/upstreams/${serverId}`,
      undefined,
      `Bearer ${adminToken}`
    );
    assert.strictEqual(deleteRes.status, 200);
    assert.strictEqual(deleteRes.body.success, true);

    // Server must be gone from listing
    const listAfterDelete = await requestHelper(gatewayServer, 'GET', '/api/upstreams', undefined, `Bearer ${adminToken}`);
    assert.strictEqual(listAfterDelete.body.some((s: any) => s.id === serverId), false);

    // Testing connection on deleted server returns 404
    const testDeletedRes = await requestHelper(
      gatewayServer,
      'POST',
      `/api/upstreams/${serverId}/test`,
      undefined,
      `Bearer ${adminToken}`
    );
    assert.strictEqual(testDeletedRes.status, 404);
  } finally {
    mockServer.close();
    gatewayServer.close();
    await db.close();
  }
});
