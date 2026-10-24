import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SqliteAdapter } from './db/adapter.js';
import { runMigrations } from './db/migrations.js';
import {
  UserRepository,
  APIKeyRepository,
  UpstreamRepository,
  AuditRepository
} from './db/repositories.js';
import { UpstreamManager } from './mcp/upstreamManager.js';
import { GatewayMcpServer } from './mcp/gatewayServer.js';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest
} from '@modelcontextprotocol/sdk/types.js';
import { createApp } from './server.js';
import { loadConfig } from './config.js';

// Helper for sending HTTP requests to the Gateway
function gatewayRequestHelper(
  server: http.Server,
  payload: object,
  authHeader?: string,
  sessionId?: string
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as any;
    const dataStr = JSON.stringify(payload);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Content-Length': String(Buffer.byteLength(dataStr))
    };

    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    if (sessionId) {
      headers['mcp-session-id'] = sessionId;
    }

    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        path: '/mcp',
        method: 'POST',
        headers
      },
      res => {
        let raw = '';
        res.on('data', chunk => (raw += chunk));
        res.on('end', () => {
          let parsed: any;
          if (raw.includes('data:')) {
            const lines = raw.split('\n');
            const dataLine = lines.find(l => l.startsWith('data:'));
            if (dataLine) {
              parsed = JSON.parse(dataLine.replace(/^data:\s*/, ''));
            }
          } else {
            try {
              parsed = JSON.parse(raw);
            } catch {
              parsed = raw;
            }
          }
          resolve({ status: res.statusCode || 500, body: parsed, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    req.write(dataStr);
    req.end();
  });
}

test('Gateway MCP Server: Full Lifecycle, Auth, Aggregation, Collision, Timeout, and Audit Tests', async () => {
  // 1. Setup in-memory database and repositories
  const db = new SqliteAdapter(':memory:');
  await runMigrations(db);

  const userRepo = new UserRepository(db);
  const apiKeyRepo = new APIKeyRepository(db);
  const upstreamRepo = new UpstreamRepository(db);
  const auditRepo = new AuditRepository(db);

  // Create test user and API keys
  const testUser = await userRepo.create({
    name: 'Alice Engineer',
    email: 'alice@urumi.local',
    password: 'Password123!',
    role: 'member'
  });

  const validKeySummary = await apiKeyRepo.create(testUser.id, 'Alice Work Laptop');
  const validKey = validKeySummary.rawKey!;

  const revokedKeySummary = await apiKeyRepo.create(testUser.id, 'Old Key');
  const revokedKey = revokedKeySummary.rawKey!;
  await apiKeyRepo.revoke(revokedKeySummary.id);

  function createMockMcpApp(name: string, tools: any[], stock: number) {
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
      server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
      server.setRequestHandler(CallToolRequestSchema, async request => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              server: name === 'inventory-alpha' ? 'alpha' : 'beta',
              sku: (request.params.arguments as any)?.sku,
              stock
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

      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).end();
  });

  return app;
}

// 2. Setup mock upstream servers
  // Upstream A: Primary Inventory
  const appA = createMockMcpApp(
    'inventory-alpha',
    [
      {
        name: 'get_stock', // Common name to trigger collision with Server B
        description: 'Lookup stock in warehouse Alpha',
        inputSchema: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] }
      },
      {
        name: 'unique_alpha_tool',
        description: 'Tool unique to alpha',
        inputSchema: { type: 'object' }
      }
    ],
    100
  );
  const mockServerA = http.createServer(appA);
  await new Promise<void>(r => mockServerA.listen(0, '127.0.0.1', r));
  const portA = (mockServerA.address() as any).port;

  // Upstream B: Secondary Inventory (contains colliding 'get_stock' tool)
  const appB = createMockMcpApp(
    'inventory-beta',
    [
      {
        name: 'get_stock', // Colliding name!
        description: 'Lookup stock in warehouse Beta',
        inputSchema: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] }
      }
    ],
    200
  );
  const mockServerB = http.createServer(appB);
  await new Promise<void>(r => mockServerB.listen(0, '127.0.0.1', r));
  const portB = (mockServerB.address() as any).port;

  // Upstream C: Slow / Timeout Server
  const mockServerC = http.createServer((_req, _res) => {
    // Deliberately never respond to simulate timeout
  });
  await new Promise<void>(r => mockServerC.listen(0, '127.0.0.1', r));
  const portC = (mockServerC.address() as any).port;

  // Register upstreams in database
  await upstreamRepo.create({
    name: 'Warehouse Alpha',
    slug: 'warehouse-alpha',
    url: `http://127.0.0.1:${portA}/mcp`,
    enabled: true,
    timeoutMs: 5000
  });

  await upstreamRepo.create({
    name: 'Warehouse Beta',
    slug: 'warehouse-beta',
    url: `http://127.0.0.1:${portB}/mcp`,
    enabled: true,
    timeoutMs: 5000
  });

  const slowUpstream = await upstreamRepo.create({
    name: 'Slow Gateway Target',
    slug: 'slow-target',
    url: `http://127.0.0.1:${portC}/mcp`,
    enabled: true,
    timeoutMs: 600 // 600ms timeout
  });

  // 3. Create Gateway App
  const config = loadConfig({
    DATABASE_URL: 'sqlite://:memory:',
    PORT: '4000'
  });
  const gatewayApp = createApp(db, config);
  const gatewayServer = http.createServer(gatewayApp);
  await new Promise<void>(r => gatewayServer.listen(0, '127.0.0.1', r));
  const gatewayPort = (gatewayServer.address() as any).port;

  try {
    // ==========================================
    // Test 1: Authentication Failures
    // ==========================================

    // 1a. Missing API Key
    const noKeyRes = await gatewayRequestHelper(gatewayServer, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } }
    });
    assert.strictEqual(noKeyRes.status, 401);
    assert.strictEqual(noKeyRes.body.error.message.includes('Unauthorized'), true);

    // 1b. Invalid API Key
    const invalidKeyRes = await gatewayRequestHelper(
      gatewayServer,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } }
      },
      'Bearer mcp_live_invalid_key_12345'
    );
    assert.strictEqual(invalidKeyRes.status, 401);

    // 1c. Revoked API Key
    const revokedKeyRes = await gatewayRequestHelper(
      gatewayServer,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } }
      },
      `Bearer ${revokedKey}`
    );
    assert.strictEqual(revokedKeyRes.status, 401);

    // ==========================================
    // Test 2: Valid Session Initialization
    // ==========================================
    const initRes = await gatewayRequestHelper(
      gatewayServer,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'official-test-client', version: '1.0' } }
      },
      `Bearer ${validKey}`
    );

    assert.strictEqual(initRes.status, 200);
    assert.strictEqual(initRes.body.result.serverInfo.name, 'urumi-mcp-gateway');
    const sessionId = initRes.headers['mcp-session-id'] as string;
    assert.strictEqual(typeof sessionId, 'string');
    assert.strictEqual(sessionId.length > 0, true);

    // ==========================================
    // Test 3: Tool Aggregation & Collision Namespacing
    // ==========================================
    const toolsRes = await gatewayRequestHelper(
      gatewayServer,
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      undefined,
      sessionId
    );

    assert.strictEqual(toolsRes.status, 200);
    const tools = toolsRes.body.result.tools;
    assert.strictEqual(Array.isArray(tools), true);

    const toolNames = tools.map((t: any) => t.name);

    // Both servers declare 'get_stock', so they MUST be namespaced!
    assert.strictEqual(toolNames.includes('warehouse_alpha__get_stock'), true);
    assert.strictEqual(toolNames.includes('warehouse_beta__get_stock'), true);

    // The unique tool is accessible both by clean name and namespaced name
    assert.strictEqual(toolNames.includes('unique_alpha_tool'), true);
    assert.strictEqual(toolNames.includes('warehouse_alpha__unique_alpha_tool'), true);

    // ==========================================
    // Test 4: Tool Routing & Deterministic Execution
    // ==========================================

    // 4a. Call Warehouse Alpha's namespaced tool
    const callAlphaRes = await gatewayRequestHelper(
      gatewayServer,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'warehouse_alpha__get_stock',
          arguments: { sku: 'TEST-SKU-1' }
        }
      },
      undefined,
      sessionId
    );
    assert.strictEqual(callAlphaRes.status, 200);
    const alphaData = JSON.parse(callAlphaRes.body.result.content[0].text);
    assert.strictEqual(alphaData.server, 'alpha');
    assert.strictEqual(alphaData.stock, 100);

    // 4b. Call Warehouse Beta's namespaced tool
    const callBetaRes = await gatewayRequestHelper(
      gatewayServer,
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'warehouse_beta__get_stock',
          arguments: { sku: 'TEST-SKU-1' }
        }
      },
      undefined,
      sessionId
    );
    assert.strictEqual(callBetaRes.status, 200);
    const betaData = JSON.parse(callBetaRes.body.result.content[0].text);
    assert.strictEqual(betaData.server, 'beta');
    assert.strictEqual(betaData.stock, 200);

    // ==========================================
    // Test 5: Audit Log Verification
    // ==========================================
    const recentLogs = await auditRepo.listRecent(10);
    assert.strictEqual(recentLogs.length >= 2, true);

    const latestLog = recentLogs[0];
    assert.strictEqual(latestLog.userId, testUser.id);
    assert.strictEqual(latestLog.userEmail, testUser.email);
    assert.strictEqual(latestLog.status, 'success');
    assert.strictEqual(typeof latestLog.durationMs, 'number');
    assert.strictEqual(latestLog.durationMs >= 0, true);
    assert.strictEqual(latestLog.toolName, 'get_stock');
    assert.strictEqual(latestLog.upstreamSlug, 'warehouse-beta');
    assert.strictEqual(latestLog.parametersSanitized?.sku, 'TEST-SKU-1');

    // ==========================================
    // Test 6: Disabled Server Handling
    // ==========================================
    const serverB = await upstreamRepo.findBySlug('warehouse-beta');
    await upstreamRepo.update(serverB!.id, { enabled: false });

    // Force refresh gateway tools
    const services = gatewayApp.locals.services;
    services.upstreamManager.invalidateCache();

    const toolsAfterDisable = await gatewayRequestHelper(
      gatewayServer,
      { jsonrpc: '2.0', id: 5, method: 'tools/list', params: {} },
      undefined,
      sessionId
    );

    const namesAfterDisable = toolsAfterDisable.body.result.tools.map((t: any) => t.name);
    // Beta tools must be immediately excluded
    assert.strictEqual(namesAfterDisable.includes('warehouse_beta__get_stock'), false);

    // Calling disabled server's tool with stale name must be rejected
    const callDisabledRes = await gatewayRequestHelper(
      gatewayServer,
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'warehouse_beta__get_stock',
          arguments: { sku: 'TEST-SKU-1' }
        }
      },
      undefined,
      sessionId
    );
    assert.strictEqual(callDisabledRes.status, 200);
    assert.strictEqual(callDisabledRes.body.result.isError, true);
    assert.strictEqual(callDisabledRes.body.result.content[0].text.includes('disabled'), true);

    // ==========================================
    // Test 7: Upstream Timeout & Fault Isolation
    // ==========================================
    const timeoutToolRes = await gatewayRequestHelper(
      gatewayServer,
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'slow_target__any_tool',
          arguments: {}
        }
      },
      undefined,
      sessionId
    );
    assert.strictEqual(timeoutToolRes.status, 200);
    assert.strictEqual(timeoutToolRes.body.result.isError, true);
    assert.strictEqual(timeoutToolRes.body.result.content[0].text.includes('not found') || timeoutToolRes.body.result.content[0].text.includes('timed out'), true);

    // Warehouse Alpha MUST continue working without degradation
    const alphaAfterRes = await gatewayRequestHelper(
      gatewayServer,
      {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'warehouse_alpha__get_stock',
          arguments: { sku: 'TEST-SKU-ALIVE' }
        }
      },
      undefined,
      sessionId
    );
    assert.strictEqual(alphaAfterRes.status, 200);
    assert.strictEqual(JSON.parse(alphaAfterRes.body.result.content[0].text).server, 'alpha');

    // ==========================================
    // Test 8: Official Client Streamable HTTP Handshake
    // ==========================================
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${gatewayPort}/mcp`),
      { requestInit: { headers: { 'Authorization': `Bearer ${validKey}` } } }
    );
    const officialClient = new Client({ name: 'official-sdk-tester', version: '1.0' }, { capabilities: {} });

    await officialClient.connect(transport);
    const officialTools = await officialClient.listTools();
    assert.strictEqual(officialTools.tools.length >= 1, true);

    const callResult = await officialClient.callTool({
      name: 'warehouse_alpha__get_stock',
      arguments: { sku: 'OFFICIAL-CLIENT-TEST' }
    });
    const parsed = JSON.parse((callResult as any).content[0].text);
    assert.strictEqual(parsed.server, 'alpha');
    await officialClient.close();
  } finally {
    mockServerA.close();
    mockServerB.close();
    mockServerC.close();
    gatewayServer.close();
    await db.close();
  }
});
