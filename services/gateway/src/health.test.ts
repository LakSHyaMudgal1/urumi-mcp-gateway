import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { SqliteAdapter } from './db/adapter.js';
import { runMigrations } from './db/migrations.js';
import { createApp } from './server.js';
import { loadConfig } from './config.js';

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

test('Health endpoints report accurate liveness and readiness statuses', async () => {
  const db = new SqliteAdapter(':memory:');
  await runMigrations(db);
  const config = loadConfig();
  const app = createApp(db, config);

  const server = http.createServer(app);
  await new Promise<void>(res => server.listen(0, '127.0.0.1', res));

  try {
    // 1. Liveness Probe (/healthz) -> 200
    const liveness = await requestHelper(server, '/healthz');
    assert.strictEqual(liveness.status, 200);
    assert.strictEqual(liveness.body.status, 'ok');

    // 2. Readiness Probe (/readyz) -> 200 when DB is connected
    const readiness = await requestHelper(server, '/readyz');
    assert.strictEqual(readiness.status, 200);
    assert.strictEqual(readiness.body.status, 'ready');
    assert.strictEqual(readiness.body.database, 'connected');

    // 3. Health Summary (/health) -> 200
    const health = await requestHelper(server, '/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.status, 'healthy');
    assert.strictEqual(health.body.database, 'connected');

    // 4. Simulate Database Failure: Close the DB
    await db.close();

    // Liveness remains 200 (process is still running)
    const livenessAfterDbFail = await requestHelper(server, '/healthz');
    assert.strictEqual(livenessAfterDbFail.status, 200);

    // Readiness must return 503 (critical dependency failed - do not mark ready!)
    const readinessAfterDbFail = await requestHelper(server, '/readyz');
    assert.strictEqual(readinessAfterDbFail.status, 503);
    assert.strictEqual(readinessAfterDbFail.body.status, 'not_ready');

    // Health summary must return 503 / unhealthy
    const healthAfterDbFail = await requestHelper(server, '/health');
    assert.strictEqual(healthAfterDbFail.status, 503);
    assert.strictEqual(healthAfterDbFail.body.status, 'unhealthy');
    assert.strictEqual(healthAfterDbFail.body.database, 'disconnected');
  } finally {
    server.close();
  }
});
