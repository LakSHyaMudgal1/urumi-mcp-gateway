import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createShippingApp } from './server.js';
import { loadShippingConfig } from './config.js';
import { DEMO_DISCLAIMER } from './calculator.js';

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

function httpGetHelper(server: http.Server, path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as any;
    http.get(`http://127.0.0.1:${addr.port}${path}`, res => {
      let raw = '';
      res.on('data', chunk => (raw += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 500, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode || 500, body: raw });
        }
      });
    }).on('error', reject);
  });
}

test('Shipping MCP service health endpoints report readiness and tool list', async () => {
  const config = loadShippingConfig({});
  const { app } = await createShippingApp(config);
  const server = http.createServer(app);
  await new Promise<void>(res => server.listen(0, '127.0.0.1', res));

  try {
    const healthz = await httpGetHelper(server, '/healthz');
    assert.strictEqual(healthz.status, 200);
    assert.strictEqual(healthz.body.status, 'ok');

    const readyz = await httpGetHelper(server, '/readyz');
    assert.strictEqual(readyz.status, 200);
    assert.strictEqual(readyz.body.status, 'ready');

    const health = await httpGetHelper(server, '/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.status, 'healthy');
    assert.strictEqual(health.body.tools.includes('list_shipping_methods'), true);
    assert.strictEqual(health.body.tools.includes('estimate_shipping'), true);
  } finally {
    server.close();
  }
});

test('Shipping MCP Streamable HTTP transport and Tool Execution (HTTP JSON-RPC)', async () => {
  const config = loadShippingConfig({});
  const { app } = await createShippingApp(config);
  const server = http.createServer(app);
  await new Promise<void>(res => server.listen(0, '127.0.0.1', res));

  try {
    // 1. Initialize Handshake
    const initRes = await mcpRequestHelper(server, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'shipping-test-client', version: '1.0' }
      }
    });

    assert.strictEqual(initRes.status, 200);
    assert.strictEqual(initRes.body.result.serverInfo.name, 'shipping-mcp');
    const sessionId = initRes.headers['mcp-session-id'] as string;
    assert.strictEqual(typeof sessionId, 'string');
    assert.strictEqual(sessionId.length > 0, true);

    // 2. Tools List
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
    const names = tools.map((t: any) => t.name);
    assert.strictEqual(names.includes('list_shipping_methods'), true);
    assert.strictEqual(names.includes('estimate_shipping'), true);
    assert.strictEqual(names.includes('shipping_list_shipping_methods'), true);
    assert.strictEqual(names.includes('shipping_estimate_shipping'), true);

    // 3. Tool Call: list_shipping_methods (US Domestic)
    const usMethodsRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'list_shipping_methods',
          arguments: { destination_country: 'US' }
        }
      },
      sessionId
    );

    assert.strictEqual(usMethodsRes.status, 200);
    const usData = JSON.parse(usMethodsRes.body.result.content[0].text);
    assert.strictEqual(usData.destination_country, 'US');
    assert.strictEqual(usData.count >= 3, true);
    const usMethodIds = usData.methods.map((m: any) => m.id);
    assert.strictEqual(usMethodIds.includes('ground-std'), true);
    assert.strictEqual(usMethodIds.includes('air-exp'), true);

    // 4. Tool Call: list_shipping_methods (International e.g. GB)
    const intlMethodsRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'list_shipping_methods',
          arguments: { destination_country: 'GB' }
        }
      },
      sessionId
    );

    assert.strictEqual(intlMethodsRes.status, 200);
    const intlData = JSON.parse(intlMethodsRes.body.result.content[0].text);
    assert.strictEqual(intlData.destination_country, 'GB');
    const intlMethodIds = intlData.methods.map((m: any) => m.id);
    assert.strictEqual(intlMethodIds.includes('intl-eco'), true);
    assert.strictEqual(intlMethodIds.includes('intl-prio'), true);

    // 5. Tool Call: list_shipping_methods (Invalid Country Code)
    const invalidCountryRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'list_shipping_methods',
          arguments: { destination_country: 'INVALID_LONG_CODE' }
        }
      },
      sessionId
    );

    assert.strictEqual(invalidCountryRes.status, 200);
    assert.strictEqual(invalidCountryRes.body.result.isError, true);
    assert.strictEqual(invalidCountryRes.body.result.content[0].text.includes('Invalid destination_country'), true);

    // 6. Tool Call: estimate_shipping (Valid Quote with Disclaimer)
    const quoteRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'estimate_shipping',
          arguments: {
            sku: 'URUMI-HD-01',
            quantity: 2,
            destination_country: 'US',
            postal_code: '94107'
          }
        }
      },
      sessionId
    );

    assert.strictEqual(quoteRes.status, 200);
    const quoteData = JSON.parse(quoteRes.body.result.content[0].text);
    assert.strictEqual(quoteData.sku, 'URUMI-HD-01');
    assert.strictEqual(quoteData.quantity, 2);
    assert.strictEqual(quoteData.destination_country, 'US');
    assert.strictEqual(quoteData.postal_code, '94107');
    assert.strictEqual(quoteData.estimated_package_weight_kg, 1.7);
    assert.strictEqual(quoteData.disclaimer, DEMO_DISCLAIMER);
    assert.strictEqual(Array.isArray(quoteData.quotes), true);
    assert.strictEqual(quoteData.quotes.length >= 3, true);

    // Standard ground calculation: 5.99 base + (1 * 1.50) = 7.49
    const groundQuote = quoteData.quotes.find((q: any) => q.method_id === 'ground-std');
    assert.strictEqual(groundQuote.estimated_cost, '7.49');

    // 7. Tool Call: estimate_shipping (Invalid Quantity < 1)
    const invalidQtyRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'estimate_shipping',
          arguments: {
            sku: 'URUMI-HD-01',
            quantity: -5,
            destination_country: 'US'
          }
        }
      },
      sessionId
    );

    assert.strictEqual(invalidQtyRes.status, 200);
    assert.strictEqual(invalidQtyRes.body.result.isError, true);
    assert.strictEqual(invalidQtyRes.body.result.content[0].text.includes("Invalid 'quantity'"), true);

    // 8. Tool Call: estimate_shipping (Missing SKU)
    const missingSkuRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'estimate_shipping',
          arguments: {
            quantity: 1,
            destination_country: 'US'
          }
        }
      },
      sessionId
    );

    assert.strictEqual(missingSkuRes.status, 200);
    assert.strictEqual(missingSkuRes.body.result.isError, true);
    assert.strictEqual(missingSkuRes.body.result.content[0].text.includes("Missing required argument 'sku'"), true);
  } finally {
    server.close();
  }
});

test('Interoperability with official @modelcontextprotocol/sdk Client and StreamableHTTPClientTransport', async () => {
  const config = loadShippingConfig({});
  const { app } = await createShippingApp(config);
  const server = http.createServer(app);
  await new Promise<void>(res => server.listen(0, '127.0.0.1', res));
  const port = (server.address() as any).port;

  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
  const client = new Client({ name: 'shipping-official-tester', version: '1.0' }, { capabilities: {} });

  try {
    await client.connect(transport);

    const toolsResult = await client.listTools();
    assert.strictEqual(toolsResult.tools.length >= 2, true);

    const callResult = await client.callTool({
      name: 'estimate_shipping',
      arguments: {
        sku: 'DEV-MUG-01',
        quantity: 1,
        destination_country: 'US'
      }
    });

    const content = (callResult as any).content;
    assert.strictEqual(Array.isArray(content), true);
    const parsed = JSON.parse(content[0].text);
    assert.strictEqual(parsed.sku, 'DEV-MUG-01');
    assert.strictEqual(parsed.disclaimer, DEMO_DISCLAIMER);
    assert.strictEqual(parsed.quotes[0].estimated_cost, '5.99');
  } finally {
    await client.close();
    server.close();
  }
});
