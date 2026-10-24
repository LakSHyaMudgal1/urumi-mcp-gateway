import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createInventoryApp } from './server.js';
import { loadInventoryConfig } from './config.js';

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

test('Inventory MCP service health endpoints report readiness and tool list', async () => {
  const config = loadInventoryConfig({});
  const { app } = await createInventoryApp(config);
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
    assert.strictEqual(health.body.tools.includes('get_stock'), true);
    assert.strictEqual(health.body.tools.includes('search_inventory'), true);
  } finally {
    server.close();
  }
});

test('Inventory MCP Streamable HTTP transport and Tool Execution (HTTP JSON-RPC)', async () => {
  const config = loadInventoryConfig({});
  const { app } = await createInventoryApp(config);
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
        clientInfo: { name: 'inventory-test-client', version: '1.0' }
      }
    });

    assert.strictEqual(initRes.status, 200);
    assert.strictEqual(initRes.body.result.serverInfo.name, 'inventory-mcp');
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
    assert.strictEqual(names.includes('get_stock'), true);
    assert.strictEqual(names.includes('search_inventory'), true);
    assert.strictEqual(names.includes('inventory_get_stock'), true);
    assert.strictEqual(names.includes('inventory_search_inventory'), true);

    // 3. Tool Call: get_stock (In Stock)
    const stockRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'get_stock',
          arguments: { sku: 'URUMI-HD-01' }
        }
      },
      sessionId
    );

    assert.strictEqual(stockRes.status, 200);
    const stockData = JSON.parse(stockRes.body.result.content[0].text);
    assert.strictEqual(stockData.found, true);
    assert.strictEqual(stockData.sku, 'URUMI-HD-01');
    assert.strictEqual(stockData.item.available_quantity, 45);
    assert.strictEqual(stockData.item.status, 'in_stock');
    assert.strictEqual(stockData.item.warehouse, 'WH-EAST-1');

    // 4. Tool Call: get_stock (Out of Stock)
    const oosRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'get_stock',
          arguments: { sku: 'K8S-CAP-01' }
        }
      },
      sessionId
    );

    assert.strictEqual(oosRes.status, 200);
    const oosData = JSON.parse(oosRes.body.result.content[0].text);
    assert.strictEqual(oosData.found, true);
    assert.strictEqual(oosData.item.available_quantity, 0);
    assert.strictEqual(oosData.item.status, 'out_of_stock');

    // 5. Tool Call: get_stock (Clear Not Found)
    const notFoundRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'get_stock',
          arguments: { sku: 'NON-EXISTENT-SKU' }
        }
      },
      sessionId
    );

    assert.strictEqual(notFoundRes.status, 200);
    const notFoundData = JSON.parse(notFoundRes.body.result.content[0].text);
    assert.strictEqual(notFoundData.found, false);
    assert.strictEqual(notFoundData.sku, 'NON-EXISTENT-SKU');
    assert.strictEqual(notFoundData.message.includes('not found'), true);

    // 6. Tool Call: get_stock (Missing argument error)
    const missingArgRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'get_stock',
          arguments: {}
        }
      },
      sessionId
    );

    assert.strictEqual(missingArgRes.status, 200);
    assert.strictEqual(missingArgRes.body.result.isError, true);
    assert.strictEqual(missingArgRes.body.result.content[0].text.includes("Missing required argument 'sku'"), true);

    // 7. Tool Call: search_inventory (Matching query)
    const searchRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'search_inventory',
          arguments: { query: 'mug', limit: 5 }
        }
      },
      sessionId
    );

    assert.strictEqual(searchRes.status, 200);
    const searchData = JSON.parse(searchRes.body.result.content[0].text);
    assert.strictEqual(searchData.count >= 1, true);
    assert.strictEqual(searchData.items[0].sku, 'DEV-MUG-01');

    // 8. Tool Call: search_inventory (Bounded limit)
    const limitRes = await mcpRequestHelper(
      server,
      {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'search_inventory',
          arguments: { limit: 2 }
        }
      },
      sessionId
    );

    assert.strictEqual(limitRes.status, 200);
    const limitData = JSON.parse(limitRes.body.result.content[0].text);
    assert.strictEqual(limitData.count, 2);
  } finally {
    server.close();
  }
});

test('Interoperability with official @modelcontextprotocol/sdk Client and StreamableHTTPClientTransport', async () => {
  const config = loadInventoryConfig({});
  const { app } = await createInventoryApp(config);
  const server = http.createServer(app);
  await new Promise<void>(res => server.listen(0, '127.0.0.1', res));
  const port = (server.address() as any).port;

  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
  const client = new Client({ name: 'inventory-official-tester', version: '1.0' }, { capabilities: {} });

  try {
    await client.connect(transport);

    const toolsResult = await client.listTools();
    assert.strictEqual(toolsResult.tools.length >= 2, true);

    const callResult = await client.callTool({
      name: 'get_stock',
      arguments: { sku: 'URUMI-HD-01' }
    });

    const content = (callResult as any).content;
    assert.strictEqual(Array.isArray(content), true);
    const parsed = JSON.parse(content[0].text);
    assert.strictEqual(parsed.found, true);
    assert.strictEqual(parsed.sku, 'URUMI-HD-01');
    assert.strictEqual(parsed.item.available_quantity, 45);
  } finally {
    await client.close();
    server.close();
  }
});
