import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createWooCommerceApp } from './server.js';
import { loadWooCommerceConfig } from './config.js';
import { WooCommerceClient } from './client.js';

function mcpRequestHelper(
  server: http.Server,
  payload: object,
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

test('WooCommerce MCP Streamable HTTP transport and Tool Execution (HTTP JSON-RPC)', async () => {
  const config = loadWooCommerceConfig({
    WOOCOMMERCE_STORE_URL: 'http://store.local.test',
    WOOCOMMERCE_MOCK_FALLBACK: 'true'
  });

  const { app } = await createWooCommerceApp(config);
  const server = http.createServer(app);
  await new Promise<void>(res => server.listen(0, '127.0.0.1', res));

  try {
    // 1. MCP Protocol Initialize
    const initRes = await mcpRequestHelper(server, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0' }
      }
    });

    assert.strictEqual(initRes.status, 200);
    assert.strictEqual(initRes.body.result.serverInfo.name, 'woocommerce-mcp');
    assert.strictEqual(initRes.body.result.protocolVersion, '2024-11-05');

    const sessionId = initRes.headers['mcp-session-id'] as string;
    assert.strictEqual(typeof sessionId, 'string');
    assert.strictEqual(sessionId.length > 0, true);

    // 2. MCP Tools List
    const toolsRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      },
      sessionId
    );

    assert.strictEqual(toolsRes.status, 200);
    const tools = toolsRes.body.result.tools;
    assert.strictEqual(Array.isArray(tools), true);

    const toolNames = tools.map((t: any) => t.name);
    assert.strictEqual(toolNames.includes('woocommerce_list_products'), true);
    assert.strictEqual(toolNames.includes('woocommerce_create_product'), true);
    assert.strictEqual(toolNames.includes('woocommerce_list_orders'), true);
    assert.strictEqual(toolNames.includes('woocommerce_get_order'), true);
    assert.strictEqual(toolNames.includes('woocommerce_update_order_status'), true);

    // 3. Tool Call: woocommerce_list_products
    const listProductsRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'woocommerce_list_products',
          arguments: { per_page: 5 }
        }
      },
      sessionId
    );

    assert.strictEqual(listProductsRes.status, 200);
    const productsData = JSON.parse(listProductsRes.body.result.content[0].text);
    assert.strictEqual(productsData.count >= 2, true);
    assert.strictEqual(typeof productsData.products[0].id, 'number');
    assert.strictEqual(typeof productsData.products[0].price, 'string');

    // 4. Tool Call: woocommerce_create_product
    const createProductRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'woocommerce_create_product',
          arguments: {
            name: 'Engineered Ceramic Cup',
            regular_price: '28.50',
            sku: 'CERAMIC-01',
            manage_stock: true,
            stock_quantity: 50
          }
        }
      },
      sessionId
    );

    assert.strictEqual(createProductRes.status, 200);
    const createdData = JSON.parse(createProductRes.body.result.content[0].text);
    assert.strictEqual(createdData.product.name, 'Engineered Ceramic Cup');
    assert.strictEqual(createdData.product.regular_price, '28.50');
    assert.strictEqual(createdData.product.sku, 'CERAMIC-01');

    // 5. Tool Call: woocommerce_list_orders (today_only)
    const listOrdersRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'woocommerce_list_orders',
          arguments: { today_only: true }
        }
      },
      sessionId
    );

    assert.strictEqual(listOrdersRes.status, 200);
    const ordersData = JSON.parse(listOrdersRes.body.result.content[0].text);
    assert.strictEqual(ordersData.count >= 1, true);
    assert.strictEqual(ordersData.orders[0].payment_method_title, 'Cash on delivery');

    // 6. Tool Call: woocommerce_get_order
    const getOrderRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'woocommerce_get_order',
          arguments: { order_id: 5001 }
        }
      },
      sessionId
    );

    assert.strictEqual(getOrderRes.status, 200);
    const orderData = JSON.parse(getOrderRes.body.result.content[0].text);
    assert.strictEqual(orderData.id, 5001);
    assert.strictEqual(orderData.status, 'processing');
    assert.strictEqual(Array.isArray(orderData.items), true);

    // 7. Tool Call: woocommerce_update_order_status
    const updateOrderRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'woocommerce_update_order_status',
          arguments: { order_id: 5001, status: 'completed' }
        }
      },
      sessionId
    );

    assert.strictEqual(updateOrderRes.status, 200);
    const updateData = JSON.parse(updateOrderRes.body.result.content[0].text);
    assert.strictEqual(updateData.id, 5001);
    assert.strictEqual(updateData.status, 'completed');
    assert.strictEqual(updateData.previous_status, 'processing');
  } finally {
    server.close();
  }
});

test('Interoperability with official @modelcontextprotocol/sdk Client and StreamableHTTPClientTransport', async () => {
  const config = loadWooCommerceConfig({
    WOOCOMMERCE_STORE_URL: 'http://store.local.test',
    WOOCOMMERCE_MOCK_FALLBACK: 'true'
  });

  const { app } = await createWooCommerceApp(config);
  const server = http.createServer(app);
  await new Promise<void>(res => server.listen(0, '127.0.0.1', res));
  const port = (server.address() as any).port;

  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
  const client = new Client({ name: 'official-client-tester', version: '1.0' }, { capabilities: {} });

  try {
    await client.connect(transport);

    const toolsResult = await client.listTools();
    assert.strictEqual(toolsResult.tools.length >= 5, true);

    const toolNames = toolsResult.tools.map(t => t.name);
    assert.strictEqual(toolNames.includes('list_products'), true);
    assert.strictEqual(toolNames.includes('woocommerce_list_products'), true);

    // Call canonical name
    const canonicalRes = await client.callTool({
      name: 'list_products',
      arguments: { per_page: 2 }
    });
    const canonicalContent = (canonicalRes as any).content;
    assert.strictEqual(Array.isArray(canonicalContent), true);
    const parsedCanonical = JSON.parse(canonicalContent[0].text);
    assert.strictEqual(parsedCanonical.count, 2);

    // Call prefixed alias
    const prefixedRes = await client.callTool({
      name: 'woocommerce_list_products',
      arguments: { per_page: 2 }
    });
    const prefixedContent = (prefixedRes as any).content;
    assert.strictEqual(Array.isArray(prefixedContent), true);
    const parsedPrefixed = JSON.parse(prefixedContent[0].text);
    assert.strictEqual(parsedPrefixed.count, 2);
  } finally {
    await client.close();
    server.close();
  }
});

test('WooCommerceClient strips credentials from errors and formats compact models', async () => {
  const client = new WooCommerceClient(
    loadWooCommerceConfig({
      WOOCOMMERCE_STORE_URL: 'http://non-existent-store.local.test:59999',
      WOOCOMMERCE_CONSUMER_KEY: 'ck_secret_key_to_never_leak',
      WOOCOMMERCE_CONSUMER_SECRET: 'cs_secret_val_to_never_leak',
      WOOCOMMERCE_MOCK_FALLBACK: 'false'
    })
  );

  try {
    await client.listProducts({});
    assert.fail('Should have thrown an error');
  } catch (err: any) {
    assert.strictEqual(err.message.includes('ck_secret_key'), false);
    assert.strictEqual(err.message.includes('cs_secret_val'), false);
    assert.strictEqual(err.message.includes('[REDACTED_KEY]'), false);
  }
});

test('WooCommerce REST API client interacts with mocked HTTP WooCommerce server', async () => {
  let receivedAuth = '';
  let receivedUrl = '';

  const mockWpServer = http.createServer((req, res) => {
    receivedAuth = req.headers['authorization'] || '';
    receivedUrl = req.url || '';

    if (req.url?.startsWith('/wp-json/wc/v3/products')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            id: 201,
            name: 'Mocked WP Product',
            slug: 'mocked-wp-product',
            permalink: 'http://store.local.test/product/mocked-wp-product',
            price: '34.99',
            regular_price: '34.99',
            status: 'publish',
            sku: 'WP-MOCK-01',
            manage_stock: true,
            stock_quantity: 15,
            stock_status: 'instock'
          }
        ])
      );
      return;
    }

    if (req.url?.startsWith('/wp-json/wc/v3/orders/777')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 777,
          status: 'processing',
          currency: 'USD',
          total: '34.99',
          total_tax: '2.50',
          shipping_total: '0.00',
          date_created: new Date().toISOString(),
          payment_method_title: 'Cash on delivery',
          customer_id: 42,
          line_items: [
            { id: 1, name: 'Mocked WP Product', product_id: 201, sku: 'WP-MOCK-01', quantity: 1, total: '34.99' }
          ],
          shipping: { city: 'Boston', state: 'MA', country: 'US', postcode: '02108' }
        })
      );
      return;
    }

    if (req.url?.startsWith('/wp-json/wc/v3/orders/9999')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 'woocommerce_rest_cannot_view', message: 'Order #9999 not found' }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Not found' }));
  });

  await new Promise<void>(res => mockWpServer.listen(0, '127.0.0.1', res));
  const port = (mockWpServer.address() as any).port;

  const client = new WooCommerceClient(
    loadWooCommerceConfig({
      WOOCOMMERCE_STORE_URL: `http://127.0.0.1:${port}`,
      WOOCOMMERCE_CONSUMER_KEY: 'ck_my_real_test_key',
      WOOCOMMERCE_CONSUMER_SECRET: 'cs_my_real_test_secret',
      WOOCOMMERCE_MOCK_FALLBACK: 'false'
    })
  );

  try {
    // 1. Fetch products from mocked HTTP WooCommerce
    const products = await client.listProducts({ search: 'mocked', page: 1, per_page: 5 });
    assert.strictEqual(products.length, 1);
    assert.strictEqual(products[0].id, 201);
    assert.strictEqual(products[0].name, 'Mocked WP Product');
    assert.strictEqual(receivedUrl.includes('search=mocked'), true);

    const expectedAuth = `Basic ${Buffer.from('ck_my_real_test_key:cs_my_real_test_secret').toString('base64')}`;
    assert.strictEqual(receivedAuth, expectedAuth);

    // 2. Fetch order by ID
    const order = await client.getOrder(777);
    assert.strictEqual(order.id, 777);
    assert.strictEqual(order.status, 'processing');
    assert.strictEqual(order.shipping_summary?.city, 'Boston');
    assert.strictEqual(order.shipping_summary?.postcode, '02108');

    // 3. Error handling from WooCommerce API
    await assert.rejects(
      async () => await client.getOrder(9999),
      /Order #9999 not found/
    );
  } finally {
    mockWpServer.close();
  }
});

test('create_product handles decimal-safe prices and validates inputs', async () => {
  const client = new WooCommerceClient(
    loadWooCommerceConfig({
      WOOCOMMERCE_STORE_URL: 'http://store.local.test',
      WOOCOMMERCE_MOCK_FALLBACK: 'true'
    })
  );

  // Valid price formats
  const p1 = await client.createProduct({ name: 'Decimal Test 1', regular_price: '29.99' });
  assert.strictEqual(p1.regular_price, '29.99');

  const p2 = await client.createProduct({ name: 'Decimal Test 2', regular_price: '50' });
  assert.strictEqual(p2.regular_price, '50.00');

  const p3 = await client.createProduct({ name: 'Decimal Test 3', regular_price: '$12.50' });
  assert.strictEqual(p3.regular_price, '12.50');

  // Invalid prices
  await assert.rejects(
    async () => await client.createProduct({ name: 'Bad Price', regular_price: '-5.00' }),
    /Invalid 'regular_price'/
  );

  await assert.rejects(
    async () => await client.createProduct({ name: 'Bad Price', regular_price: 'not-a-number' }),
    /Invalid 'regular_price'/
  );

  // Missing name
  await assert.rejects(
    async () => await client.createProduct({ name: '', regular_price: '19.99' }),
    /Product 'name' is required/
  );

  // Invalid status
  await assert.rejects(
    async () => await client.createProduct({ name: 'Bad Status', regular_price: '19.99', status: 'invalid' as any }),
    /Invalid product status/
  );
});

test('list_orders filters by store timezone and date range', async () => {
  const client = new WooCommerceClient(
    loadWooCommerceConfig({
      WOOCOMMERCE_STORE_URL: 'http://store.local.test',
      WOOCOMMERCE_MOCK_FALLBACK: 'true',
      WOOCOMMERCE_TIMEZONE: 'America/New_York'
    })
  );

  // Today only query
  const ordersToday = await client.listOrders({ today_only: true, timezone: 'America/New_York' });
  assert.strictEqual(Array.isArray(ordersToday), true);
  assert.strictEqual(ordersToday.length >= 1, true);

  // Date range query
  const ordersPast = await client.listOrders({
    after: new Date(Date.now() - 86400000 * 3).toISOString(),
    before: new Date().toISOString()
  });
  assert.strictEqual(ordersPast.length >= 2, true);

  // Invalid order status update
  await assert.rejects(
    async () => await client.updateOrderStatus(5001, 'invalid_status' as any),
    /Invalid order status 'invalid_status'/
  );
});
