import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest
} from '@modelcontextprotocol/sdk/types.js';
import { SqliteAdapter } from '../db/adapter.js';
import { runMigrations } from '../db/migrations.js';
import {
  UserRepository,
  UpstreamRepository,
  AuditRepository
} from '../db/repositories.js';
import { createApp } from '../server.js';
import { loadConfig } from '../config.js';
import { MockDeterministicProvider } from './providers.js';
import { LLMProvider, LLMMessage, LLMToolDefinition } from './types.js';

// HTTP Request Helper
function requestHelper(
  server: http.Server,
  method: string,
  path: string,
  payload?: object,
  authHeader?: string
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as any;
    const dataStr = payload ? JSON.stringify(payload) : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json'
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
          resolve({ status: res.statusCode || 500, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(dataStr);
    }
    req.end();
  });
}

// Spawns a mock Streamable HTTP MCP Upstream Server
function createMockMcpServer(
  tools: any[],
  callHandler: (name: string, args: any) => Promise<any>
): Promise<{ server: http.Server; url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(cors());
  app.use(express.json());

  let transport: StreamableHTTPServerTransport | null = null;
  let mcpServer: Server | null = null;

  app.all('/mcp', async (req, res) => {
    if (isInitializeRequest(req.body) || !transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => 'mock-session-' + Math.random().toString(36).substring(2)
      });

      mcpServer = new Server(
        { name: 'mock-upstream', version: '1.0.0' },
        { capabilities: { tools: { listChanged: true } } }
      );

      mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools
      }));

      mcpServer.setRequestHandler(CallToolRequestSchema, async request => {
        const { name, arguments: args } = request.params;
        return callHandler(name, args || {});
      });

      await mcpServer.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  return new Promise(resolve => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      resolve({
        server,
        url: `http://127.0.0.1:${port}/mcp`,
        close: () => new Promise(resClose => server.close(() => resClose()))
      });
    });
  });
}

test('Phase 8: Dashboard Chat Agent with Multi-Step Tool Calling & Identity Attribution', async () => {
  // 1. Setup in-memory database
  const db = new SqliteAdapter(':memory:');
  await runMigrations(db);

  const config = loadConfig({
    DATABASE_URL: ':memory:',
    JWT_SECRET: 'super-secret-test-jwt-key-minimum-32-chars-long!',
    LLM_PROVIDER: 'mock',
    NODE_ENV: 'test'
  });

  const userRepo = new UserRepository(db);
  const upstreamRepo = new UpstreamRepository(db);
  const auditRepo = new AuditRepository(db);

  // Seed Initial Admin
  await userRepo.create({
    name: config.INITIAL_ADMIN_NAME,
    email: config.INITIAL_ADMIN_EMAIL,
    password: config.INITIAL_ADMIN_PASSWORD,
    role: 'admin'
  });

  // In-memory store state for assertions
  const createdProducts: any[] = [];
  const testOrders = [
    {
      id: 501,
      number: '501',
      status: 'processing',
      total: '129.50',
      billing: { first_name: 'John', last_name: 'Doe' },
      date_created: new Date().toISOString()
    }
  ];

  // 2. Spawn Mock Upstream 1: WooCommerce MCP
  const wooMock = await createMockMcpServer(
    [
      {
        name: 'create_product',
        description: 'Creates a new product in the WooCommerce store catalog',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            regular_price: { type: 'string' },
            status: { type: 'string' }
          },
          required: ['name', 'regular_price']
        }
      },
      {
        name: 'list_orders',
        description: 'Lists WooCommerce store orders',
        inputSchema: {
          type: 'object',
          properties: {
            created_today: { type: 'boolean' }
          }
        }
      }
    ],
    async (name, args) => {
      if (name === 'create_product') {
        const newProduct = {
          id: 1000 + createdProducts.length + 1,
          name: args.name,
          regular_price: args.regular_price,
          status: args.status || 'publish'
        };
        createdProducts.push(newProduct);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(newProduct)
            }
          ]
        };
      }
      if (name === 'list_orders') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(testOrders)
            }
          ]
        };
      }
      return { isError: true, content: [{ type: 'text', text: 'Unknown tool' }] };
    }
  );

  // 3. Spawn Mock Upstream 2: Inventory MCP
  const inventoryMock = await createMockMcpServer(
    [
      {
        name: 'get_stock',
        description: 'Retrieves stock level for SKU',
        inputSchema: {
          type: 'object',
          properties: { sku: { type: 'string' } },
          required: ['sku']
        }
      }
    ],
    async (name, args) => {
      if (name === 'get_stock') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                sku: args.sku,
                availableQuantity: 42,
                location: 'Warehouse-Bay-7'
              })
            }
          ]
        };
      }
      return { isError: true, content: [{ type: 'text', text: 'Unknown tool' }] };
    }
  );

  // 4. Spawn Mock Upstream 3: Shipping MCP
  const shippingMock = await createMockMcpServer(
    [
      {
        name: 'estimate_shipping',
        description: 'Calculates shipping rates for SKU and destination country',
        inputSchema: {
          type: 'object',
          properties: {
            sku: { type: 'string' },
            quantity: { type: 'number' },
            destination_country: { type: 'string' }
          },
          required: ['destination_country']
        }
      }
    ],
    async (name, args) => {
      if (name === 'estimate_shipping') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                sku: args.sku || 'SKU-HOODIE-M',
                destination_country: args.destination_country,
                estimated_cost_usd: '16.50',
                service_level: 'International Priority Parcel (3-5 days)'
              })
            }
          ]
        };
      }
      return { isError: true, content: [{ type: 'text', text: 'Unknown tool' }] };
    }
  );

  // 5. Register Upstreams in Gateway DB
  await upstreamRepo.create({
    name: 'WooCommerce Store',
    slug: 'woocommerce',
    url: wooMock.url,
    enabled: true,
    timeoutMs: 5000
  });

  await upstreamRepo.create({
    name: 'Inventory System',
    slug: 'inventory',
    url: inventoryMock.url,
    enabled: true,
    timeoutMs: 5000
  });

  await upstreamRepo.create({
    name: 'Shipping Carrier',
    slug: 'shipping',
    url: shippingMock.url,
    enabled: true,
    timeoutMs: 5000
  });

  // 6. Start Gateway Express Server
  const app = createApp(db, config);
  const gatewayHttp = http.createServer(app);
  await new Promise<void>(resolve => gatewayHttp.listen(0, '127.0.0.1', () => resolve()));

  try {
    // 7. Login as a Member to test authenticated session
    await userRepo.create({
      name: 'Bob Operator',
      email: 'bob@urumi.local',
      password: 'BobSecretPassword123!',
      role: 'member'
    });

    const loginRes = await requestHelper(gatewayHttp, 'POST', '/api/auth/login', {
      email: config.INITIAL_ADMIN_EMAIL,
      password: config.INITIAL_ADMIN_PASSWORD
    });
    assert.strictEqual(loginRes.status, 200);
    const adminToken = `Bearer ${loginRes.body.token}`;

    // =========================================================================
    // ACCEPTANCE TEST 1:
    // Ask to create a product with a name and price -> verify WooCommerce tool is called
    // and product appears in the store catalog.
    // =========================================================================
    const createProductPrompt = "Create a product named 'Vintage Leather Jacket' with price 89.99";
    const chatRes1 = await requestHelper(
      gatewayHttp,
      'POST',
      '/api/chat',
      { message: createProductPrompt },
      adminToken
    );

    assert.strictEqual(chatRes1.status, 200);
    assert.ok(chatRes1.body.reply.includes('product has been created') || chatRes1.body.reply.includes('WooCommerce'));
    assert.strictEqual(chatRes1.body.toolCalls.length, 1);
    assert.ok(chatRes1.body.toolCalls[0].toolName.includes('create_product'));
    assert.strictEqual(chatRes1.body.toolCalls[0].upstreamSlug, 'woocommerce');
    assert.strictEqual(chatRes1.body.toolCalls[0].status, 'success');

    // Verify product exists in store
    assert.strictEqual(createdProducts.length, 1);
    assert.strictEqual(createdProducts[0].name, 'Vintage Leather Jacket');
    assert.strictEqual(createdProducts[0].regular_price, '89.99');

    // Verify audit log attribution to logged-in user
    const auditLogs1 = await auditRepo.listFiltered({ toolName: 'create_product' });
    assert.ok(auditLogs1.logs.length >= 1);
    assert.strictEqual(auditLogs1.logs[0].userEmail, config.INITIAL_ADMIN_EMAIL);
    assert.strictEqual(auditLogs1.logs[0].status, 'success');

    // =========================================================================
    // ACCEPTANCE TEST 2:
    // Ask "What orders came in today?" -> verify answer comes from WooCommerce tool
    // and call is attributed to the logged-in user.
    // =========================================================================
    const chatRes2 = await requestHelper(
      gatewayHttp,
      'POST',
      '/api/chat',
      { message: 'What orders came in today?' },
      adminToken
    );

    assert.strictEqual(chatRes2.status, 200);
    assert.ok(chatRes2.body.reply.includes('Order #501'));
    assert.strictEqual(chatRes2.body.toolCalls.length, 1);
    assert.ok(chatRes2.body.toolCalls[0].toolName.includes('list_orders'));
    assert.strictEqual(chatRes2.body.toolCalls[0].upstreamSlug, 'woocommerce');

    const auditLogs2 = await auditRepo.listFiltered({ toolName: 'list_orders' });
    assert.ok(auditLogs2.logs.length >= 1);
    assert.strictEqual(auditLogs2.logs[0].userEmail, config.INITIAL_ADMIN_EMAIL);

    // =========================================================================
    // ACCEPTANCE TEST 3:
    // Combined question needing Inventory + Shipping -> verify trace shows calls to two
    // different upstream servers!
    // =========================================================================
    const chatRes3 = await requestHelper(
      gatewayHttp,
      'POST',
      '/api/chat',
      { message: 'Check stock for SKU-HOODIE-M and estimate shipping to CA' },
      adminToken
    );

    assert.strictEqual(chatRes3.status, 200);
    assert.strictEqual(chatRes3.body.toolCalls.length, 2, 'Must execute 2 distinct tool calls');

    // Verify calls to two different upstreams
    const upstreamSlugs = chatRes3.body.toolCalls.map((tc: any) => tc.upstreamSlug);
    assert.ok(upstreamSlugs.includes('inventory'), 'Trace must include inventory upstream');
    assert.ok(upstreamSlugs.includes('shipping'), 'Trace must include shipping upstream');

    assert.ok(chatRes3.body.toolCalls.some((tc: any) => tc.toolName.includes('get_stock')));
    assert.ok(chatRes3.body.toolCalls.some((tc: any) => tc.toolName.includes('estimate_shipping')));

    // Verify synthesized reply includes both inventory and shipping information
    assert.ok(chatRes3.body.reply.includes('Inventory Status'));
    assert.ok(chatRes3.body.reply.includes('Shipping Estimate'));
    assert.ok(chatRes3.body.isDemoMode, 'Mock provider must be clearly identified as demo mode');

    // =========================================================================
    // TEST 4: Bounded Tool-Calling Step Limit Enforcement
    // Prevents infinite tool loops
    // =========================================================================
    class InfiniteLoopProvider implements LLMProvider {
      readonly name = 'infinite-loop-mock';
      readonly model = 'loop-v1';
      readonly isDemo = true;
      callCount = 0;

      async chatCompletion(): Promise<any> {
        this.callCount++;
        return {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: `call_${this.callCount}`,
                type: 'function',
                function: {
                  name: 'inventory__get_stock',
                  arguments: JSON.stringify({ sku: 'SKU-HOODIE-M' })
                }
              }
            ]
          },
          finishReason: 'tool_calls'
        };
      }
    }

    const loopConfig = loadConfig({
      DATABASE_URL: ':memory:',
      JWT_SECRET: 'super-secret-test-jwt-key-minimum-32-chars-long!',
      LLM_PROVIDER: 'mock',
      LLM_MAX_STEPS: '3',
      NODE_ENV: 'test'
    });

    const loopProvider = new InfiniteLoopProvider();
    const loopApp = createApp(db, loopConfig, loopProvider);
    const loopHttp = http.createServer(loopApp);
    await new Promise<void>(resolve => loopHttp.listen(0, '127.0.0.1', () => resolve()));

    try {
      const loopRes = await requestHelper(
        loopHttp,
        'POST',
        '/api/chat',
        { message: 'Run loop' },
        adminToken
      );

      assert.strictEqual(loopRes.status, 200);
      assert.strictEqual(loopRes.body.stepCount, 3);
      assert.ok(loopRes.body.reply.includes('maximum configured tool steps (3)'));
    } finally {
      await new Promise<void>(resolve => loopHttp.close(() => resolve()));
    }

    // =========================================================================
    // TEST 5: Malformed Tool Arguments Handled Safely
    // Model returning non-JSON arguments must not crash the gateway
    // =========================================================================
    class MalformedArgsProvider implements LLMProvider {
      readonly name = 'malformed-mock';
      readonly model = 'bad-args-v1';
      readonly isDemo = true;
      turn = 0;

      async chatCompletion({ messages }: { messages: LLMMessage[] }): Promise<any> {
        this.turn++;
        if (this.turn === 1) {
          return {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'bad_call_1',
                  type: 'function',
                  function: {
                    name: 'inventory__get_stock',
                    arguments: 'THIS_IS_NOT_VALID_JSON{['
                  }
                }
              ]
            },
            finishReason: 'tool_calls'
          };
        }
        // Second turn: sees the error message in tool response and reports it cleanly
        const toolMsg = messages.find(m => m.role === 'tool');
        return {
          message: {
            role: 'assistant',
            content: `I caught an argument syntax error: ${toolMsg?.content}`
          },
          finishReason: 'stop'
        };
      }
    }

    const malformedApp = createApp(db, config, new MalformedArgsProvider());
    const malformedHttp = http.createServer(malformedApp);
    await new Promise<void>(resolve => malformedHttp.listen(0, '127.0.0.1', () => resolve()));

    try {
      const malformedRes = await requestHelper(
        malformedHttp,
        'POST',
        '/api/chat',
        { message: 'Test malformed args' },
        adminToken
      );

      assert.strictEqual(malformedRes.status, 200);
      assert.strictEqual(malformedRes.body.toolCalls.length, 1);
      assert.strictEqual(malformedRes.body.toolCalls[0].status, 'error');
      assert.ok(malformedRes.body.toolCalls[0].errorMessage.includes('Malformed tool arguments JSON'));
      assert.ok(malformedRes.body.reply.includes('argument syntax error'));
    } finally {
      await new Promise<void>(resolve => malformedHttp.close(() => resolve()));
    }

    // =========================================================================
    // TEST 6: Identity Binding Security
    // Server must reject attempts to spoof user identity in payload
    // =========================================================================
    const spoofAttemptRes = await requestHelper(
      gatewayHttp,
      'POST',
      '/api/chat',
      {
        message: 'Check stock for SKU-HOODIE-M',
        user: { id: 'spoofed_super_admin', email: 'fake@hacker.io', role: 'admin' }
      },
      adminToken
    );

    assert.strictEqual(spoofAttemptRes.status, 200);
    // Verified user returned in response must be the authenticated admin, NOT the spoofed payload
    assert.strictEqual(spoofAttemptRes.body.user.email, config.INITIAL_ADMIN_EMAIL);
    assert.notStrictEqual(spoofAttemptRes.body.user.id, 'spoofed_super_admin');

  } finally {
    await new Promise<void>(resolve => gatewayHttp.close(() => resolve()));
    await wooMock.close();
    await inventoryMock.close();
    await shippingMock.close();
    await db.close();
  }
});
