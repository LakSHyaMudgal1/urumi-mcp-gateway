import test from 'node:test';
import assert from 'node:assert';
import { loadConfig } from './config.js';

test('loadConfig provides sensible defaults for local development', () => {
  const conf = loadConfig({});
  assert.strictEqual(conf.PORT, 4000);
  assert.strictEqual(conf.NODE_ENV, 'development');
  assert.strictEqual(conf.DATABASE_URL, 'sqlite://./gateway.db');
  assert.strictEqual(conf.INITIAL_ADMIN_EMAIL, 'admin@urumi.local');
  assert.strictEqual(conf.INITIAL_ADMIN_PASSWORD, 'AdminSecurePassword123!');
});

test('loadConfig parses custom environment variables correctly', () => {
  const conf = loadConfig({
    PORT: '8080',
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://user:pass@postgres-host:5432/mcp_gateway',
    INITIAL_ADMIN_EMAIL: 'ops@company.io',
    INITIAL_ADMIN_PASSWORD: 'OpsSecurePassword2026!'
  });

  assert.strictEqual(conf.PORT, 8080);
  assert.strictEqual(conf.NODE_ENV, 'production');
  assert.strictEqual(conf.DATABASE_URL, 'postgres://user:pass@postgres-host:5432/mcp_gateway');
  assert.strictEqual(conf.INITIAL_ADMIN_EMAIL, 'ops@company.io');
});

test('loadConfig throws a descriptive error on invalid inputs', () => {
  assert.throws(() => {
    loadConfig({
      INITIAL_ADMIN_EMAIL: 'not-an-email'
    });
  }, /Environment configuration error: INITIAL_ADMIN_EMAIL/);
});
