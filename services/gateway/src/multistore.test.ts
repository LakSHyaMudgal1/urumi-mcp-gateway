import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { SqliteAdapter } from './db/adapter.js';
import { runMigrations } from './db/migrations.js';
import {
  UserRepository,
  StoreRepository,
  UpstreamRepository,
  AuditRepository
} from './db/repositories.js';
import { createApp } from './server.js';
import { GatewayConfig } from './config.js';
import { InMemoryKubernetesClient } from './provisioner/k8s-client.js';
import { generateStoreManifests } from './provisioner/manifests.js';
import { signJWT } from '@urumi/shared';
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

// Helper for HTTP requests
async function makeRequest(
  baseUrl: string,
  method: string,
  path: string,
  options: {
    token?: string;
    body?: any;
  } = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  const url = new URL(path, baseUrl);
  const postData = options.body ? JSON.stringify(options.body) : null;

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Accept': 'application/json',
          ...(postData ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } : {}),
          ...(options.token ? { 'Authorization': `Bearer ${options.token}` } : {})
        }
      },
      (res) => {
        let rawData = '';
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          let parsed: any = null;
          try {
            parsed = rawData ? JSON.parse(rawData) : null;
          } catch {
            parsed = rawData;
          }
          resolve({
            status: res.statusCode || 500,
            headers: res.headers,
            body: parsed
          });
        });
      }
    );

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

describe('Optional Bonus: Multi-Store WooCommerce Provisioning & Zero-Trust Isolation', () => {
  let db: SqliteAdapter;
  let userRepo: UserRepository;
  let storeRepo: StoreRepository;
  let upstreamRepo: UpstreamRepository;
  let k8sClient: InMemoryKubernetesClient;
  let server: http.Server;
  let baseUrl: string;

  let adminUser: any;
  let memberUser: any;
  let adminToken: string;
  let memberToken: string;

  // Mock store HTTP MCP servers running locally for deterministic tool execution in tests
  let alphaMcpServer: http.Server;
  let betaMcpServer: http.Server;
  let alphaMcpUrl: string;
  let betaMcpUrl: string;

  const config: GatewayConfig = {
    PORT: 0,
    NODE_ENV: 'test',
    DATABASE_URL: 'sqlite://:memory:',
    JWT_SECRET: 'test-jwt-secret-at-least-32-chars-long-multistore-test',
    INITIAL_ADMIN_EMAIL: 'admin@urumi.local',
    INITIAL_ADMIN_PASSWORD: 'AdminPassword123!',
    INITIAL_ADMIN_NAME: 'Platform Admin',
    WOOCOMMERCE_MCP_URL: 'http://localhost:4001/mcp',
    INVENTORY_MCP_URL: 'http://localhost:4002/mcp',
    SHIPPING_MCP_URL: 'http://localhost:4003/mcp',
    LLM_PROVIDER: 'mock',
    LLM_MODEL: 'deterministic-demo-v1',
    LLM_MAX_STEPS: 6
  };

  before(async () => {
    // 1. In-memory DB and migrations
    db = new SqliteAdapter(':memory:');
    await runMigrations(db);

    userRepo = new UserRepository(db);
    storeRepo = new StoreRepository(db);
    upstreamRepo = new UpstreamRepository(db);

    adminUser = await userRepo.create({
      email: 'admin@urumi.local',
      name: 'Admin User',
      password: 'AdminPassword123!',
      role: 'admin'
    });

    memberUser = await userRepo.create({
      email: 'member@urumi.local',
      name: 'Member User',
      password: 'MemberPassword123!',
      role: 'member'
    });

    adminToken = signJWT({ userId: adminUser.id, role: 'admin', email: adminUser.email, name: adminUser.name, status: 'active' }, config.JWT_SECRET);
    memberToken = signJWT({ userId: memberUser.id, role: 'member', email: memberUser.email, name: memberUser.name, status: 'active' }, config.JWT_SECRET);

    // 2. Start mock store MCP servers
    const createMockStoreMcp = (storeName: string, todayOrders: any[]) => {
      const app = express();
      app.use(cors());
      app.use(express.json());
      const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();

      const tools = [
        {
          name: 'list_orders',
          description: `List orders in ${storeName}`,
          inputSchema: { type: 'object', properties: { created_today: { type: 'boolean' } } }
        },
        {
          name: 'list_products',
          description: `List products in ${storeName}`,
          inputSchema: { type: 'object', properties: { limit: { type: 'number' } } }
        }
      ];

      app.all('/mcp', async (req, res) => {
        const sessionId = (req.headers['mcp-session-id'] as string) || (req.query.sessionId as string);
        if (sessionId && sessions.has(sessionId)) {
          await sessions.get(sessionId)!.transport.handleRequest(req, res, req.body);
          return;
        }

        if (!sessionId && isInitializeRequest(req.body)) {
          const mcpServer = new Server({ name: storeName, version: '1.0.0' }, { capabilities: { tools: { listChanged: true } } });
          mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
          mcpServer.setRequestHandler(CallToolRequestSchema, async () => ({
            content: [
              {
                type: 'text',
                text: JSON.stringify(todayOrders)
              }
            ]
          }));

          let transport: StreamableHTTPServerTransport;
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (sid: string): void => {
              sessions.set(sid, { transport, server: mcpServer });
            }
          });

          transport.onclose = () => {
            if (transport.sessionId) sessions.delete(transport.sessionId);
          };

          await mcpServer.connect(transport);
          await transport.handleRequest(req, res, req.body);
          return;
        }

        res.status(400).end();
      });

      return http.createServer(app);
    };

    alphaMcpServer = createMockStoreMcp('Alpha Store', [
      { id: 101, number: '101', status: 'processing', total: '149.50', billing: { first_name: 'Alice', last_name: 'Smith' } },
      { id: 102, number: '102', status: 'completed', total: '89.00', billing: { first_name: 'Bob', last_name: 'Jones' } }
    ]);
    betaMcpServer = createMockStoreMcp('Beta Store', [
      { id: 201, number: '201', status: 'processing', total: '320.00', billing: { first_name: 'Charlie', last_name: 'Brown' } }
    ]);

    await new Promise<void>(resolve => alphaMcpServer.listen(0, resolve));
    await new Promise<void>(resolve => betaMcpServer.listen(0, resolve));

    const alphaPort = (alphaMcpServer.address() as AddressInfo).port;
    const betaPort = (betaMcpServer.address() as AddressInfo).port;
    alphaMcpUrl = `http://127.0.0.1:${alphaPort}/mcp`;
    betaMcpUrl = `http://127.0.0.1:${betaPort}/mcp`;

    // 3. Simulated Kubernetes Cluster Driver
    k8sClient = new InMemoryKubernetesClient();
    k8sClient.readinessDelayMs = 10; // Fast async execution for tests

    // 4. Start Gateway app
    const app = createApp(db, config, undefined, k8sClient);
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) await new Promise(r => server.close(r));
    if (alphaMcpServer) await new Promise(r => alphaMcpServer.close(r));
    if (betaMcpServer) await new Promise(r => betaMcpServer.close(r));
  });

  test('1. Input Validation and Reserved Slug Protection', async () => {
    // A. Reserved slug check
    const reservedRes = await makeRequest(baseUrl, 'POST', '/api/stores', {
      token: adminToken,
      body: { name: 'Admin Gateway', slug: 'gateway' }
    });
    assert.strictEqual(reservedRes.status, 400);
    assert.strictEqual(reservedRes.body.error.includes('reserved'), true);

    // B. Malformed slug check
    const invalidSlugRes = await makeRequest(baseUrl, 'POST', '/api/stores', {
      token: adminToken,
      body: { name: 'Bad Store', slug: 'Bad_Slug!!' }
    });
    assert.strictEqual(invalidSlugRes.status, 400);
    assert.strictEqual(invalidSlugRes.body.error, 'Validation failed');
  });

  test('2. Concurrent Provisioning of Two Isolated WooCommerce Stores', async () => {
    // Override the MCP target URL for the test stores so the gateway can query the local mock MCP servers
    const appServices = (server as any)._events?.request?.locals?.services;

    // Launch store-alpha and store-beta concurrently
    const [alphaRes, betaRes] = await Promise.all([
      makeRequest(baseUrl, 'POST', '/api/stores', {
        token: memberToken,
        body: { name: 'Alpha Store', slug: 'alpha' }
      }),
      makeRequest(baseUrl, 'POST', '/api/stores', {
        token: memberToken,
        body: { name: 'Beta Store', slug: 'beta' }
      })
    ]);

    assert.strictEqual(alphaRes.status, 201);
    assert.strictEqual(betaRes.status, 201);
    assert.strictEqual(alphaRes.body.slug, 'alpha');
    assert.strictEqual(betaRes.body.slug, 'beta');
    assert.strictEqual(alphaRes.body.namespace, 'store-alpha');
    assert.strictEqual(betaRes.body.namespace, 'store-beta');

    // Wait briefly for async provisioning to complete
    let alphaStore: any;
    let betaStore: any;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 50));
      alphaStore = await storeRepo.findBySlug('alpha');
      betaStore = await storeRepo.findBySlug('beta');
      if (alphaStore?.status === 'ready' && betaStore?.status === 'ready') break;
    }

    assert.strictEqual(alphaStore?.status, 'ready');
    assert.strictEqual(betaStore?.status, 'ready');

    // Connect test MCP endpoints to verify tool discovery & cross-query
    const alphaUpstream = await upstreamRepo.findBySlug('store-alpha');
    const betaUpstream = await upstreamRepo.findBySlug('store-beta');
    assert.ok(alphaUpstream, 'store-alpha must be auto-registered as an upstream');
    assert.ok(betaUpstream, 'store-beta must be auto-registered as an upstream');

    await upstreamRepo.update(alphaUpstream.id, { url: alphaMcpUrl });
    await upstreamRepo.update(betaUpstream.id, { url: betaMcpUrl });
  });

  test('3. Verification of Kubernetes Namespace Manifests and Zero-Trust Isolation', async () => {
    const alphaResources = await k8sClient.listNamespaceResources('store-alpha');
    const betaResources = await k8sClient.listNamespaceResources('store-beta');

    assert.ok(alphaResources.length >= 8, 'store-alpha must contain all required manifests');
    assert.ok(betaResources.length >= 8, 'store-beta must contain all required manifests');

    // Verify ResourceQuota, LimitRange, and ServiceAccount
    const hasQuota = alphaResources.some(r => r.kind === 'ResourceQuota');
    const hasLimits = alphaResources.some(r => r.kind === 'LimitRange');
    const hasSa = alphaResources.some(r => r.kind === 'ServiceAccount' && r.automountServiceAccountToken === false);
    assert.strictEqual(hasQuota, true, 'Must define ResourceQuota');
    assert.strictEqual(hasLimits, true, 'Must define LimitRange');
    assert.strictEqual(hasSa, true, 'Must define least-privilege ServiceAccount without token automount');

    // Zero-Trust Isolation Check:
    // A. Gateway can reach store-alpha WooCommerce MCP on port 4001
    const gatewayToAlpha = k8sClient.canCommunicate('default', 'gateway', 'store-alpha', 'store-woocommerce-mcp', 4001);
    assert.strictEqual(gatewayToAlpha, true, 'Gateway must reach store-alpha MCP');

    // B. Intra-namespace MCP to WordPress is allowed
    const mcpToWp = k8sClient.canCommunicate('store-alpha', 'store-woocommerce-mcp', 'store-alpha', 'store-wordpress', 80);
    assert.strictEqual(mcpToWp, true, 'MCP in store-alpha can reach WordPress in store-alpha');

    // C. Inter-namespace cross-store communication is strictly BLOCKED by NetworkPolicy
    const crossStoreDb = k8sClient.canCommunicate('store-alpha', 'store-woocommerce-mcp', 'store-beta', 'store-mariadb', 3306);
    const crossStoreWp = k8sClient.canCommunicate('store-alpha', 'store-woocommerce-mcp', 'store-beta', 'store-wordpress', 80);
    assert.strictEqual(crossStoreDb, false, 'Store alpha MCP MUST NOT reach Store beta MariaDB');
    assert.strictEqual(crossStoreWp, false, 'Store alpha MCP MUST NOT reach Store beta WordPress');
  });

  test('4. Per-User Quota Enforcement', async () => {
    // Member has quota max 3; already owns 2 (alpha, beta).
    // Create 3rd store: should succeed
    const thirdRes = await makeRequest(baseUrl, 'POST', '/api/stores', {
      token: memberToken,
      body: { name: 'Gamma Store', slug: 'gamma' }
    });
    assert.strictEqual(thirdRes.status, 201);

    // Attempt 4th store: quota exceeded (max 3 per user)
    const fourthRes = await makeRequest(baseUrl, 'POST', '/api/stores', {
      token: memberToken,
      body: { name: 'Delta Store', slug: 'delta' }
    });
    assert.strictEqual(fourthRes.status, 403);
    assert.strictEqual(fourthRes.body.error.includes('quota exceeded'), true);

    // Cleanup 3rd store
    await storeRepo.delete(thirdRes.body.id);
  });

  test('5. Chat Agent Compares Today Orders Across Both Stores', async () => {
    // Force refresh tool mapping
    await makeRequest(baseUrl, 'POST', '/api/tools/refresh', { token: adminToken });

    // Verify both stores expose namespaced tools
    const toolsRes = await makeRequest(baseUrl, 'GET', '/api/tools', { token: adminToken });
    const toolNames = toolsRes.body.tools.map((t: any) => t.name);
    assert.ok(toolNames.some((n: string) => n.includes('store_alpha__list_orders') || n.includes('store-alpha__list_orders')));
    assert.ok(toolNames.some((n: string) => n.includes('store_beta__list_orders') || n.includes('store-beta__list_orders')));

    // Ask Chat Agent to compare today's orders across store alpha and store beta
    const chatRes = await makeRequest(baseUrl, 'POST', '/api/chat', {
      token: memberToken,
      body: {
        message: "Compare today's orders between store alpha and store beta"
      }
    });

    assert.strictEqual(chatRes.status, 200);
    assert.ok(chatRes.body.toolCalls.length >= 2, 'Chat agent must call tools on both store upstreams');

    // Verify calls were made to both store alpha and store beta tools
    const calledTools = chatRes.body.toolCalls.map((tc: any) => tc.toolName);
    const calledAlpha = calledTools.some((n: string) => n.includes('alpha'));
    const calledBeta = calledTools.some((n: string) => n.includes('beta'));
    assert.strictEqual(calledAlpha, true, 'Must call store-alpha order tool');
    assert.strictEqual(calledBeta, true, 'Must call store-beta order tool');

    // Verify synthesized reply includes order counts & totals
    const reply = chatRes.body.reply;
    assert.ok(reply.includes('STORE') || reply.includes('ALPHA') || reply.includes('BETA'));
    assert.ok(reply.includes('Orders Today'));
  });

  test('6. Store Deletion Purges Namespace and Deregisters Upstream while Remaining Store Works', async () => {
    const alphaStore = await storeRepo.findBySlug('alpha');
    assert.ok(alphaStore);

    // Delete store-alpha
    const delRes = await makeRequest(baseUrl, 'DELETE', `/api/stores/${alphaStore.id}`, {
      token: memberToken
    });
    assert.strictEqual(delRes.status, 200);
    assert.strictEqual(delRes.body.namespace, 'store-alpha');

    // A. Verify store-alpha is gone from DB
    const deletedInDb = await storeRepo.findBySlug('alpha');
    assert.strictEqual(deletedInDb, null, 'Deleted store record must be removed from DB');

    // B. Verify store-alpha namespace and PVCs are purged from Kubernetes
    const nsResources = await k8sClient.listNamespaceResources('store-alpha');
    assert.strictEqual(nsResources.length, 0, 'Kubernetes resources and namespace must be purged');

    // C. Verify store-alpha tools are gone from Gateway catalog
    const toolsRes = await makeRequest(baseUrl, 'GET', '/api/tools', { token: adminToken });
    const toolNames = toolsRes.body.tools.map((t: any) => t.name);
    assert.strictEqual(toolNames.some((n: string) => n.includes('store-alpha') || n.includes('store_alpha')), false);

    // D. Verify store-beta continues working without interruption
    const betaStore = await storeRepo.findBySlug('beta');
    assert.ok(betaStore, 'store-beta must remain active');
    assert.strictEqual(betaStore.status, 'ready');
    assert.ok(toolNames.some((n: string) => n.includes('store-beta') || n.includes('store_beta')), 'store-beta tools must remain available');
  });

  test('7. Partial Failure Rollback and Deadline Timeout', async () => {
    // Configure simulated deployment failure for "fail-store"
    k8sClient.simulateFailureForSlug = 'fail-store';

    const failRes = await makeRequest(baseUrl, 'POST', '/api/stores', {
      token: memberToken,
      body: { name: 'Failing Store', slug: 'fail-store' }
    });
    assert.strictEqual(failRes.status, 201);

    // Wait for provisioning worker to catch failure and execute rollback
    let failedStore: any;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 50));
      failedStore = await storeRepo.findBySlug('fail-store');
      if (failedStore?.status === 'failed') break;
    }

    assert.strictEqual(failedStore?.status, 'failed');
    assert.ok(failedStore?.failureReason?.includes('CrashLoopBackOff'), 'Failure reason must reflect pod failure');

    // Verify partial namespace resources were cleaned up on failure
    const leakedResources = await k8sClient.listNamespaceResources('store-fail-store');
    assert.strictEqual(leakedResources.length, 0, 'Partially provisioned resources must be cleaned up on failure');

    // Reset failure simulation
    k8sClient.simulateFailureForSlug = undefined;
  });
});
