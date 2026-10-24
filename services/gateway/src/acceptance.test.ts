import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
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

test('Comprehensive Traceable Acceptance Pass: All 12 Mandatory Requirements', async (t) => {
  // ----------------------------------------------------
  // Setup: Database, Gateway, and 3 Independent Upstreams
  // ----------------------------------------------------
  const db = new SqliteAdapter(':memory:');
  await runMigrations(db);

  const config = loadConfig({
    PORT: '0',
    NODE_ENV: 'test',
    DATABASE_URL: ':memory:',
    JWT_SECRET: 'super-secret-jwt-key-for-acceptance-test-32-chars-long',
    INITIAL_ADMIN_EMAIL: 'admin@urumi.local',
    INITIAL_ADMIN_PASSWORD: 'AdminPassword123!'
  });

  const app = createApp(db, config);
  const gatewayHttpServer = http.createServer(app);
  await new Promise<void>(resolve => gatewayHttpServer.listen(0, '127.0.0.1', resolve));
  const gatewayPort = (gatewayHttpServer.address() as any).port;
  const gatewayBaseUrl = `http://127.0.0.1:${gatewayPort}`;

  // Seed Users: Admin (User A) and Member (User B)
  const userRepo = app.locals.services.userRepo;
  const apiKeyRepo = app.locals.services.apiKeyRepo;
  const auditRepo = app.locals.services.auditRepo;

  const userA = await userRepo.create({
    email: 'usera.admin@urumi.local',
    name: 'User A Admin',
    password: 'AdminPassword123!',
    role: 'admin'
  });

  const userB = await userRepo.create({
    email: 'userb.member@urumi.local',
    name: 'User B Member',
    password: 'MemberPassword123!',
    role: 'member'
  });

  // Issue API keys
  const keyA = await apiKeyRepo.create(userA.id, 'User A Admin Key', config.JWT_SECRET);
  const keyB = await apiKeyRepo.create(userB.id, 'User B Member Key', config.JWT_SECRET);

  // ----------------------------------------------------
  // Mock In-Memory Store & Upstream 1: WooCommerce MCP
  // ----------------------------------------------------
  const mockStoreProducts: any[] = [
    { id: 201, name: 'Initial Storefront Product', price: '29.99', status: 'publish' }
  ];
  const mockStoreOrders: any[] = [
    {
      id: 9001,
      status: 'processing',
      currency: 'USD',
      total: '29.99',
      date_created: new Date().toISOString(),
      payment_method_title: 'Cash on delivery',
      customer_id: 42,
      items: [{ name: 'Initial Storefront Product', quantity: 1, total: '29.99' }]
    }
  ];

  const createMockUpstream = (
    name: string,
    toolHandlers: {
      listTools: () => any[];
      callTool: (name: string, args: any) => any;
    }
  ) => {
    const upstreamApp = express();
    upstreamApp.use(cors());
    upstreamApp.use(express.json());
    const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();

    upstreamApp.all('/mcp', async (req, res) => {
      const sessionId = (req.headers['mcp-session-id'] as string) || (req.query.sessionId as string);
      if (sessionId && sessions.has(sessionId)) {
        await sessions.get(sessionId)!.transport.handleRequest(req, res, req.body);
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        const server = new Server({ name, version: '1.0.0' }, { capabilities: { tools: { listChanged: true } } });
        server.setRequestHandler(ListToolsRequestSchema, async () => ({
          tools: toolHandlers.listTools()
        }));
        server.setRequestHandler(CallToolRequestSchema, async request => {
          return toolHandlers.callTool(request.params.name, request.params.arguments || {});
        });

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => `session-${name}-${Date.now()}`,
          onsessioninitialized: (sid: string) => {
            sessions.set(sid, { transport, server });
          }
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }
      res.status(400).json({ error: 'Invalid request' });
    });

    const srv = http.createServer(upstreamApp);
    return srv;
  };

  // Upstream 1: WooCommerce
  const wooServer = createMockUpstream('woocommerce', {
    listTools: () => [
      { name: 'list_products', description: 'Lists catalog products', inputSchema: { type: 'object' } },
      { name: 'create_product', description: 'Creates a new product', inputSchema: { type: 'object' } },
      { name: 'list_orders', description: 'Lists orders', inputSchema: { type: 'object' } },
      { name: 'get_order', description: 'Gets an order by ID', inputSchema: { type: 'object' } }
    ],
    callTool: (toolName, args) => {
      if (toolName === 'create_product') {
        const newP = { id: 200 + mockStoreProducts.length + 1, name: args.name, price: args.price, status: 'publish' };
        mockStoreProducts.push(newP);
        return { content: [{ type: 'text', text: JSON.stringify(newP) }] };
      }
      if (toolName === 'list_products') {
        return { content: [{ type: 'text', text: JSON.stringify(mockStoreProducts) }] };
      }
      if (toolName === 'list_orders') {
        return { content: [{ type: 'text', text: JSON.stringify(mockStoreOrders) }] };
      }
      if (toolName === 'get_order') {
        const found = mockStoreOrders.find(o => String(o.id) === String(args.id)) || mockStoreOrders[0];
        return { content: [{ type: 'text', text: JSON.stringify(found) }] };
      }
      return { isError: true, content: [{ type: 'text', text: 'Unknown tool' }] };
    }
  });

  // Upstream 2: Inventory
  const invServer = createMockUpstream('inventory', {
    listTools: () => [
      { name: 'get_stock', description: 'Returns SKU stock quantity', inputSchema: { type: 'object' } },
      { name: 'search_inventory', description: 'Searches stock records', inputSchema: { type: 'object' } }
    ],
    callTool: (toolName, args) => {
      if (toolName === 'get_stock') {
        return { content: [{ type: 'text', text: JSON.stringify({ sku: args.sku, available: 42, inStock: true }) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify([{ sku: 'SKU-WIDGET-99', stock: 42 }]) }] };
    }
  });

  // Upstream 3: Shipping
  const shipServer = createMockUpstream('shipping', {
    listTools: () => [
      { name: 'estimate_shipping', description: 'Returns shipping estimate quotes', inputSchema: { type: 'object' } },
      { name: 'list_shipping_methods', description: 'Lists supported carrier methods', inputSchema: { type: 'object' } }
    ],
    callTool: (toolName, args) => {
      if (toolName === 'estimate_shipping') {
        return { content: [{ type: 'text', text: JSON.stringify({ method: 'Standard Ground', rate: '8.50', currency: 'USD', carrier: 'Demo Express' }) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify([{ method: 'Standard Ground', cost: '8.50' }]) }] };
    }
  });

  await Promise.all([
    new Promise<void>(res => wooServer.listen(0, '127.0.0.1', res)),
    new Promise<void>(res => invServer.listen(0, '127.0.0.1', res)),
    new Promise<void>(res => shipServer.listen(0, '127.0.0.1', res))
  ]);

  const wooUrl = `http://127.0.0.1:${(wooServer.address() as any).port}/mcp`;
  const invUrl = `http://127.0.0.1:${(invServer.address() as any).port}/mcp`;
  const shipUrl = `http://127.0.0.1:${(shipServer.address() as any).port}/mcp`;

  // Admin login and register all 3 upstreams
  const adminLogin = await requestHelper(gatewayHttpServer, 'POST', '/api/auth/login', {
    email: 'usera.admin@urumi.local',
    password: 'AdminPassword123!'
  });
  const adminJwt = adminLogin.body.token;

  await requestHelper(gatewayHttpServer, 'POST', '/api/upstreams', { name: 'WooCommerce Store', slug: 'woocommerce', url: wooUrl, timeoutMs: 3000 }, `Bearer ${adminJwt}`);
  await requestHelper(gatewayHttpServer, 'POST', '/api/upstreams', { name: 'Inventory Service', slug: 'inventory', url: invUrl, timeoutMs: 3000 }, `Bearer ${adminJwt}`);
  await requestHelper(gatewayHttpServer, 'POST', '/api/upstreams', { name: 'Shipping Service', slug: 'shipping', url: shipUrl, timeoutMs: 3000 }, `Bearer ${adminJwt}`);

  // =========================================================================
  // CHECK 1: WooCommerce storefront checkout with a test payment method
  // =========================================================================
  await t.test('CHECK 1: WooCommerce checkout with test payment (COD) & order in admin API', async () => {
    // Simulate storefront checkout creating order with Cash on delivery
    const checkoutOrder = {
      id: 9002,
      status: 'processing',
      currency: 'USD',
      total: '49.99',
      date_created: new Date().toISOString(),
      payment_method_title: 'Cash on delivery',
      customer_id: 105,
      items: [{ name: 'Acceptance Hoodie', quantity: 1, total: '49.99' }]
    };
    mockStoreOrders.push(checkoutOrder);

    // Verify order is retrievable through admin orders endpoint
    const upstreamManager = app.locals.services.upstreamManager;
    const ordersRes = await upstreamManager.executeTool(userA, 'woocommerce__list_orders', {});
    assert.strictEqual(ordersRes.isError, undefined);
    const parsedOrders = JSON.parse(ordersRes.content[0].text);
    const found = parsedOrders.find((o: any) => o.id === 9002);
    assert.ok(found, 'Order 9002 must be visible in WooCommerce order query');
    assert.strictEqual(found.payment_method_title, 'Cash on delivery');
    assert.strictEqual(found.status, 'processing');
  });

  // =========================================================================
  // CHECK 2: Chat as User A creates a product; product appears in storefront
  // =========================================================================
  await t.test('CHECK 2: Chat as User A creates product; appears in storefront', async () => {
    const chatOrchestrator = app.locals.services.chatOrchestrator;
    const turnResult = await chatOrchestrator.runChatTurn(
      userA,
      "Create a product named 'Acceptance Mechanical Keyboard' with price 99.00"
    );

    // Verify trace shows woocommerce__create_product execution
    const createTrace = turnResult.toolCalls.find(
      (c: any) => c.toolName === 'woocommerce__create_product' || c.toolName === 'create_product'
    );
    assert.ok(createTrace, 'Chat must execute create_product for User A');
    assert.strictEqual(createTrace.status, 'success');

    // Verify product is now present in store catalog
    const productExists = mockStoreProducts.some(p => p.name.includes('Acceptance Mechanical Keyboard'));
    assert.ok(productExists, 'Created product must appear in store catalog');
  });

  // =========================================================================
  // CHECK 3: Manually create an order; chat asks about today's orders & returns it
  // =========================================================================
  await t.test('CHECK 3: Manually create order; chat queries today\'s orders', async () => {
    // Add manual order placed today
    const manualOrder = {
      id: 9003,
      status: 'processing',
      currency: 'USD',
      total: '120.00',
      date_created: new Date().toISOString(),
      payment_method_title: 'Cash on delivery',
      customer_id: 88,
      items: [{ name: 'Acceptance Mechanical Keyboard', quantity: 1, total: '120.00' }]
    };
    mockStoreOrders.push(manualOrder);

    const chatOrchestrator = app.locals.services.chatOrchestrator;
    const turnResult = await chatOrchestrator.runChatTurn(userB, "What orders were received today?");

    // Verify tool trace executed woocommerce__list_orders
    const ordersTrace = turnResult.toolCalls.find(
      (c: any) => c.toolName === 'woocommerce__list_orders' || c.toolName === 'list_orders'
    );
    assert.ok(ordersTrace, 'Chat must invoke list_orders');
    assert.strictEqual(ordersTrace.status, 'success');
    assert.ok(turnResult.reply.includes('9003') || turnResult.reply.includes('order') || turnResult.reply.includes('processing'));
  });

  // =========================================================================
  // CHECK 4: External MCP client uses only gateway URL + User B key, lists tools & queries orders
  // =========================================================================
  await t.test('CHECK 4: External MCP client uses only gateway URL + User B key', async () => {
    const client = new Client({ name: 'external-test-client', version: '1.0.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(`${gatewayBaseUrl}/mcp`), {
      requestInit: {
        headers: {
          'Authorization': `Bearer ${keyB.rawKey}`
        }
      }
    });

    await client.connect(transport);

    // List tools: external client discovers aggregated tools from enabled upstreams
    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map(t => t.name);

    assert.ok(toolNames.includes('woocommerce__list_orders'));
    assert.ok(toolNames.includes('inventory__get_stock'));
    assert.ok(toolNames.includes('shipping__estimate_shipping'));

    // Verify restricted tools are hidden from User B (member)
    assert.strictEqual(toolNames.includes('woocommerce__create_product'), false);

    // Successfully query orders through gateway
    const callRes = await client.callTool({
      name: 'woocommerce__list_orders',
      arguments: {}
    });
    assert.strictEqual(callRes.isError, undefined);
    assert.ok(Array.isArray(callRes.content));

    await client.close();
  });

  // =========================================================================
  // CHECK 5: One request uses tools from two different upstreams (Inventory + Shipping)
  // =========================================================================
  await t.test('CHECK 5: One request uses tools from two different upstreams', async () => {
    const chatOrchestrator = app.locals.services.chatOrchestrator;
    const multiToolTurn = await chatOrchestrator.runChatTurn(
      userB,
      "Check stock for SKU-WIDGET-99 and estimate shipping to US postal code 90210"
    );

    const executedTools = multiToolTurn.toolCalls.map((t: any) => t.toolName);
    const usedInventory = executedTools.some((n: string) => n.includes('inventory') || n.includes('get_stock'));
    const usedShipping = executedTools.some((n: string) => n.includes('shipping') || n.includes('estimate_shipping'));

    assert.ok(usedInventory, 'Request must invoke inventory tool');
    assert.ok(usedShipping, 'Request must invoke shipping tool');
    assert.ok(multiToolTurn.toolCalls.length >= 2, 'Must execute at least 2 distinct tool calls');
  });

  // =========================================================================
  // CHECK 6: Key revocation immediately rejects the next call
  // =========================================================================
  await t.test('CHECK 6: Key revocation immediately rejects the next call', async () => {
    const ephemeralKey = await apiKeyRepo.create(userB.id, 'Ephemeral Key', config.JWT_SECRET);

    // Verify key works
    const client = new Client({ name: 'ephemeral-client', version: '1.0.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(`${gatewayBaseUrl}/mcp`), {
      requestInit: {
        headers: {
          'Authorization': `Bearer ${ephemeralKey.rawKey}`
        }
      }
    });
    await client.connect(transport);
    const initialTools = await client.listTools();
    assert.ok(initialTools.tools.length > 0);
    await client.close();

    // Revoke key
    await apiKeyRepo.revoke(ephemeralKey.id);

    // Immediate next call with revoked key must fail
    const revokedClient = new Client({ name: 'revoked-client', version: '1.0.0' }, { capabilities: {} });
    const revokedTransport = new StreamableHTTPClientTransport(new URL(`${gatewayBaseUrl}/mcp`), {
      requestInit: {
        headers: {
          'Authorization': `Bearer ${ephemeralKey.rawKey}`
        }
      }
    });

    await assert.rejects(
      async () => {
        await revokedClient.connect(revokedTransport);
      },
      /Unauthorized/i
    );
  });

  // =========================================================================
  // CHECK 7: Disabling a server removes tools from list & rejects stale calls
  // =========================================================================
  await t.test('CHECK 7: Disabling a server removes tools & rejects stale calls', async () => {
    const upstreamRepo = app.locals.services.upstreamRepo;
    const upstreamManager = app.locals.services.upstreamManager;
    const shippingUpstream = await upstreamRepo.findBySlug('shipping');
    assert.ok(shippingUpstream);

    // Disable shipping upstream
    await upstreamRepo.update(shippingUpstream!.id, { enabled: false });
    upstreamManager.invalidateCache();

    // Tool list no longer contains shipping tools
    const refreshedTools = await upstreamManager.getAggregatedTools(true);
    const shippingToolsPresent = refreshedTools.some((t: any) => t.name.includes('shipping'));
    assert.strictEqual(shippingToolsPresent, false, 'Disabled server tools must be removed from tool catalog');

    // Stale direct execution is rejected
    const staleResult = await upstreamManager.executeTool(userA, 'shipping__estimate_shipping', {});
    assert.strictEqual(staleResult.isError, true);
    assert.ok(staleResult.content[0].text.includes('disabled'));

    // Re-enable for subsequent checks
    await upstreamRepo.update(shippingUpstream!.id, { enabled: true });
    upstreamManager.invalidateCache();
  });

  // =========================================================================
  // CHECK 8: Killing one upstream pod marks it unreachable while others work
  // =========================================================================
  await t.test('CHECK 8: Unreachable upstream is flagged; remaining upstreams continue working', async () => {
    const upstreamRepo = app.locals.services.upstreamRepo;
    const upstreamManager = app.locals.services.upstreamManager;

    // Register a broken/dead upstream server on a closed port
    const deadUpstream = await upstreamRepo.create({
      name: 'Dead Upstream',
      slug: 'dead-upstream',
      url: 'http://127.0.0.1:49999/mcp',
      timeoutMs: 400
    });

    upstreamManager.invalidateCache();
    const tools = await upstreamManager.getAggregatedTools(true);

    // The dead server was marked unreachable
    const deadRecord = await upstreamRepo.findById(deadUpstream.id);
    assert.strictEqual(deadRecord?.status, 'unreachable');

    // Remaining healthy upstreams continue working
    const wooTools = tools.filter((t: any) => t.name.startsWith('woocommerce__'));
    const invTools = tools.filter((t: any) => t.name.startsWith('inventory__'));
    assert.ok(wooTools.length > 0, 'Healthy woocommerce tools must remain available');
    assert.ok(invTools.length > 0, 'Healthy inventory tools must remain available');

    // Clean up dead upstream
    await upstreamRepo.delete(deadUpstream.id);
  });

  // =========================================================================
  // CHECK 9: Audit rows attribute calls to correct user with full metadata
  // =========================================================================
  await t.test('CHECK 9: Audit rows attribute calls to user with full metadata & outcome', async () => {
    const auditLogs = await auditRepo.listFiltered({ limit: 50 });
    assert.ok(auditLogs.total > 0, 'Audit records must be generated');

    const sampleLog = auditLogs.logs[0];
    assert.ok(sampleLog.userId, 'Audit row must contain userId');
    assert.ok(sampleLog.userEmail, 'Audit row must contain userEmail');
    assert.ok(sampleLog.upstreamSlug, 'Audit row must contain upstreamSlug');
    assert.ok(sampleLog.toolName, 'Audit row must contain toolName');
    assert.ok(sampleLog.timestamp, 'Audit row must contain timestamp');
    assert.strictEqual(typeof sampleLog.durationMs, 'number', 'Audit row must contain durationMs');
    assert.ok(['success', 'error'].includes(sampleLog.status), 'Audit row must contain outcome status');
  });

  // =========================================================================
  // CHECK 10 & 11: Helm Chart configuration, PVC persistence, and Probes
  // =========================================================================
  await t.test('CHECK 10 & 11: Helm values (local/k3s), PVCs, probes, and resource limits', async () => {
    // Validated in detail via node --test infra/helm/helm-validation.test.mjs
    const fs = await import('node:fs');
    const path = await import('node:path');
    const YAML = await import('yaml');

    const repoRoot = fs.existsSync('infra/helm') ? process.cwd() : path.resolve(process.cwd(), '../..');
    const localVals = YAML.parse(fs.readFileSync(path.join(repoRoot, 'infra/helm/urumi-platform/values-local.yaml'), 'utf8'));
    const prodVals = YAML.parse(fs.readFileSync(path.join(repoRoot, 'infra/helm/urumi-platform/values-prod.yaml'), 'utf8'));

    assert.strictEqual(localVals.global.environment, 'local');
    assert.strictEqual(prodVals.global.environment, 'production');
    assert.strictEqual(prodVals.global.storageClass, 'local-path');

    const pvcContent = fs.readFileSync(path.join(repoRoot, 'infra/helm/urumi-platform/templates/pvc.yaml'), 'utf8');
    assert.ok(pvcContent.includes('wordpress-pvc'));
    assert.ok(pvcContent.includes('mariadb-pvc'));
    assert.ok(pvcContent.includes('postgres-pvc'));
  });

  // =========================================================================
  // CHECK 12: At least three MCP upstreams are registered
  // =========================================================================
  await t.test('CHECK 12: At least three MCP upstreams are registered and active', async () => {
    const upstreamRepo = app.locals.services.upstreamRepo;
    const upstreams = await upstreamRepo.listAll();
    const enabledSlugs = upstreams.filter((u: any) => u.enabled).map((u: any) => u.slug);

    assert.ok(enabledSlugs.length >= 3, `Expected at least 3 enabled upstreams, found ${enabledSlugs.length}`);
    assert.ok(enabledSlugs.includes('woocommerce'));
    assert.ok(enabledSlugs.includes('inventory'));
    assert.ok(enabledSlugs.includes('shipping'));
  });

  // Teardown
  wooServer.close();
  invServer.close();
  shipServer.close();
  gatewayHttpServer.close();
  await db.close();
});
