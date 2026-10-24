import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createInventoryApp } from './server.js';
import { loadInventoryConfig } from './config.js';

function requestHelper(server: http.Server, path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as any;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        path,
        method: 'GET'
      },
      res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 500, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode || 500, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('Inventory MCP service health endpoints report readiness and tool list', async () => {
  const config = loadInventoryConfig({});
  const app = createInventoryApp(config);
  const server = http.createServer(app);
  await new Promise<void>(res => server.listen(0, '127.0.0.1', res));

  try {
    const liveness = await requestHelper(server, '/healthz');
    assert.strictEqual(liveness.status, 200);
    assert.strictEqual(liveness.body.status, 'ok');

    const readiness = await requestHelper(server, '/readyz');
    assert.strictEqual(readiness.status, 200);
    assert.strictEqual(readiness.body.status, 'ready');

    const health = await requestHelper(server, '/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.status, 'healthy');
    assert.strictEqual(health.body.tools.includes('inventory_check_stock'), true);
  } finally {
    server.close();
  }
});
